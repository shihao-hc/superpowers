/**
 * Chat WebSocket Handler
 * Handles real-time chat communication with skill integration
 */

const { EventEmitter } = require('events');
const { SkillDiscovery } = require('../skills/agent/SkillDiscovery');
const { SkillManager } = require('../skills/SkillManager');
const { AsyncExecutor } = require('../skills/agent/AsyncExecutor');
const { SessionManager } = require('../skills/agent/SessionManager');
const { MultimodalPresenter } = require('../skills/agent/MultimodalPresenter');
const { RLSkillRecommender } = require('../skills/recommendation/RLSkillRecommender');

class ChatWebSocketHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.sessions = new Map();
    this.maxSessions = options.maxSessions || 1000;
    
    // Initialize skill components
    this.skillManager = options.skillManager || new SkillManager();
    this.skillDiscovery = new SkillDiscovery({ skillManager: this.skillManager });
    this.sessionManager = new SessionManager();
    this.executor = new AsyncExecutor();
    this.presenter = new MultimodalPresenter();
    this.rlRecommender = new RLSkillRecommender({
      learningRate: 0.1,
      discountFactor: 0.9,
      explorationRate: 0.15
    });
    
    // Proactive suggestion settings
    this.proactiveEnabled = options.proactiveEnabled !== false;
    this.suggestionThreshold = options.suggestionThreshold || 0.7;
    this.minMessagesForSuggestion = 3;
    
    // LLM adapter (should be injected)
    this.llmAdapter = options.llmAdapter || null;
    
    // Setup executor event listeners
    this._setupExecutorListeners();
  }

  /**
   * Setup executor event listeners
   */
  _setupExecutorListeners() {
    this.executor.on('progress', (data) => {
      this.emit('skill_progress', data);
    });

    this.executor.on('completed', (execution) => {
      this.emit('skill_complete', execution);
    });

    this.executor.on('failed', (execution) => {
      this.emit('skill_error', execution);
    });
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(socket) {
    console.log('[ChatWS] New connection:', socket.id);

    // Join session
    socket.on('join_session', (data) => {
      this._handleJoinSession(socket, data);
    });

    // Chat message
    socket.on('chat_message', (data) => {
      this._handleChatMessage(socket, data);
    });

    // Skill execution request
    socket.on('execute_skill', (data) => {
      this._handleSkillExecution(socket, data);
    });

    // Disconnect
    socket.on('disconnect', () => {
      this._handleDisconnect(socket);
    });

    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to UltraWork AI Chat',
      sessionId: socket.id
    });
  }

  /**
   * Handle join session
   */
  _handleJoinSession(socket, data) {
    const { sessionId } = data;
    
    if (!sessionId) {
      socket.emit('error', { message: 'Session ID required' });
      return;
    }

    // Create or get session
    const session = this.sessionManager.getSession(sessionId, {
      socketId: socket.id
    });

    this.sessions.set(socket.id, {
      sessionId,
      socket,
      session
    });

    socket.join(sessionId);
    
    console.log(`[ChatWS] Socket ${socket.id} joined session ${sessionId}`);
    
    socket.emit('session_joined', {
      sessionId,
      historyLength: session.history.length
    });
  }

  /**
   * Handle chat message
   */
  async _handleChatMessage(socket, data) {
    const { sessionId, conversationId, message, model, attachments } = data;
    
    if (!sessionId || !message) {
      socket.emit('error', { message: 'Invalid message data' });
      return;
    }

    const sessionData = this.sessions.get(socket.id);
    if (!sessionData) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    const session = sessionData.session;
    
    try {
      // Add user message to history
      this.sessionManager.addToHistory(sessionId, {
        type: 'user',
        content: message,
        metadata: { conversationId, attachments }
      });

      // Analyze for skill usage
      const analysis = this.skillDiscovery.analyzeInput(message, session.history.slice(-10));
      
      let shouldUseSkill = false;
      let skillToUse = null;
      
      if (analysis.hasMatch && analysis.confidence >= 0.6) {
        shouldUseSkill = true;
        skillToUse = analysis.matchedSkills[0];
      }

      // Start streaming response
      socket.emit('message_start', { conversationId });

      if (shouldUseSkill && skillToUse) {
        // Execute skill
        await this._executeSkillWithStreaming(socket, {
          sessionId,
          conversationId,
          skillName: skillToUse.name,
          parameters: this._extractSkillParameters(message, skillToUse),
          userMessage: message
        });
      } else {
        // Generate text response
        await this._generateTextResponse(socket, {
          sessionId,
          conversationId,
          message,
          model,
          attachments,
          history: session.history
        });
      }

      socket.emit('message_end', { conversationId });
      
      // Proactive skill suggestion
      if (this.proactiveEnabled && session.history.length >= this.minMessagesForSuggestion) {
        this._maybeSendProactiveSuggestion(socket, {
          sessionId,
          conversationId,
          lastMessage: message,
          history: session.history
        });
      }

    } catch (error) {
      console.error('[ChatWS] Error handling message:', error);
      socket.emit('error', { 
        message: '处理消息时出错',
        error: error.message 
      });
    }
  }
  
  /**
   * Maybe send proactive skill suggestion
   */
  _maybeSendProactiveSuggestion(socket, options) {
    const { sessionId, conversationId, lastMessage, history } = options;
    
    // Get available skills for suggestion context
    const allSkills = this.skillManager.getAllSkills ? this.skillManager.getAllSkills() : [];
    
    // Use RL recommender to get suggestions
    const suggestions = this.rlRecommender.recommendSkills(
      lastMessage,
      sessionId,
      allSkills,
      history,
      1
    );
    
    if (suggestions.length > 0 && suggestions[0].confidence >= this.suggestionThreshold) {
      const skill = suggestions[0];
      
      // Generate suggestion message
      const suggestionMessages = [
        `💡 根据您的操作，我建议使用"${skill.name}"技能。是否需要我帮您调用？`,
        `🔧 发现技能"${skill.name}"可能对您有帮助，需要执行吗？`,
        `✨ 您可能需要"${skill.name}"，要我现在调用吗？`,
        `📋 建议：使用"${skill.name}"可以提高效率，是否继续？`
      ];
      
      const message = suggestionMessages[Math.floor(Math.random() * suggestionMessages.length)];
      
      socket.emit('proactive_suggestion', {
        conversationId,
        skill: {
          name: skill.name,
          description: skill.description,
          confidence: skill.confidence
        },
        message,
        action: 'execute_skill_suggested',
        autoDismissAfter: 30000 // 30 seconds
      });
    }
  }

  /**
   * Execute skill with streaming updates
   */
  async _executeSkillWithStreaming(socket, options) {
    const { sessionId, conversationId, skillName, parameters, userMessage } = options;
    
    // Notify skill start
    socket.emit('skill_start', {
      conversationId,
      skillName,
      message: `正在执行 ${skillName} 技能...`
    });

    // Add skill call to history
    this.sessionManager.addToHistory(sessionId, {
      type: 'skill_call',
      content: { skillName, parameters },
      skillName,
      metadata: { conversationId }
    });

    try {
      // Execute skill asynchronously
      const execution = await this.executor.execute(skillName, parameters, {
        sessionId,
        onProgress: (progress, message) => {
          socket.emit('skill_progress', {
            conversationId,
            skillName,
            progress,
            message
          });
        }
      });

      // Wait for completion
      const result = await this.executor.waitForCompletion(execution.executionId);

      // Record execution
      this.sessionManager.recordSkillExecution(sessionId, skillName, execution.executionId, {
        success: true,
        duration: result.duration,
        result
      });

      // Notify skill complete
      socket.emit('skill_complete', {
        conversationId,
        skillName,
        executionId: execution.executionId,
        duration: result.duration
      });

      // Present result
      const presentation = await this.presenter.present(result, {
        format: 'auto'
      });

      // Stream the result text
      const resultText = this._formatSkillResult(skillName, result, presentation);
      await this._streamText(socket, conversationId, resultText);

      // Add result to history
      this.sessionManager.addToHistory(sessionId, {
        type: 'skill_result',
        content: { success: true, result: presentation },
        skillName,
        executionId: execution.executionId,
        metadata: { conversationId }
      });

    } catch (error) {
      console.error('[ChatWS] Skill execution error:', error);
      
      socket.emit('skill_error', {
        conversationId,
        skillName,
        error: error.message
      });

      // Send error message
      const errorText = `抱歉，执行 ${skillName} 技能时出错：${error.message}`;
      await this._streamText(socket, conversationId, errorText);

      // Add error to history
      this.sessionManager.addToHistory(sessionId, {
        type: 'skill_error',
        content: { error: error.message },
        skillName,
        metadata: { conversationId }
      });
    }
  }

  /**
   * Format skill result
   */
  _formatSkillResult(skillName, result, presentation) {
    let text = '';
    
    if (result.success !== false) {
      text = `✅ **${skillName}** 技能执行完成！\n\n`;
      
      if (presentation.metadata?.isImage) {
        text += '已生成图片，请查看附件。';
      } else if (presentation.metadata?.isPDF) {
        text += '已生成PDF文档，请查看附件。';
      } else if (presentation.metadata?.isExcel) {
        text += '已生成Excel表格，请查看附件。';
      } else if (presentation.metadata?.isPPT) {
        text += '已生成PowerPoint演示文稿，请查看附件。';
      } else if (result.text || result.message) {
        text += result.text || result.message;
      } else {
        text += '任务已完成。';
      }
      
      if (result.duration) {
        text += `\n\n⏱️ 执行时间：${(result.duration / 1000).toFixed(1)}秒`;
      }
    } else {
      text = `❌ **${skillName}** 技能执行失败：${result.error || '未知错误'}`;
    }
    
    return text;
  }

  /**
   * Generate text response using LLM
   */
  async _generateTextResponse(socket, options) {
    const { sessionId, conversationId, message, model, attachments, history } = options;
    
    if (!this.llmAdapter) {
      // Fallback response if no LLM
      const fallbackResponse = this._generateFallbackResponse(message);
      await this._streamText(socket, conversationId, fallbackResponse);
      return;
    }

    try {
      // Build conversation context
      const context = this._buildConversationContext(history, message);
      
      // Generate response
      const response = await this.llmAdapter.generate(context, {
        model: model || 'llama3.2',
        temperature: 0.7,
        maxTokens: 1000
      });

      // Stream the response
      await this._streamText(socket, conversationId, response);

      // Add assistant response to history
      this.sessionManager.addToHistory(sessionId, {
        type: 'assistant',
        content: response,
        metadata: { conversationId, model }
      });

    } catch (error) {
      console.error('[ChatWS] LLM error:', error);
      
      // Use fallback
      const fallbackResponse = this._generateFallbackResponse(message);
      await this._streamText(socket, conversationId, fallbackResponse);
    }
  }

  /**
   * Build conversation context
   */
  _buildConversationContext(history, currentMessage) {
    let context = '';
    
    // Add recent history
    const recentHistory = history.slice(-10);
    for (const entry of recentHistory) {
      if (entry.type === 'user') {
        context += `User: ${entry.content}\n`;
      } else if (entry.type === 'assistant') {
        context += `Assistant: ${entry.content}\n`;
      }
    }
    
    // Add current message
    context += `User: ${currentMessage}\nAssistant:`;
    
    return context;
  }

  /**
   * Generate fallback response
   */
  _generateFallbackResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    // Simple pattern matching for common queries
    if (lowerMessage.includes('你好') || lowerMessage.includes('hello')) {
      return '你好！我是 UltraWork AI 助手。有什么我可以帮你的吗？';
    }
    
    if (lowerMessage.includes('文档') || lowerMessage.includes('document')) {
      return '我可以帮你创建各种文档！请告诉我你需要什么类型的文档（Word、PDF、PPT、Excel），以及文档的内容和格式要求。';
    }
    
    if (lowerMessage.includes('图表') || lowerMessage.includes('chart')) {
      return '我可以帮你创建各种图表！请告诉我你想可视化什么数据，以及你想要的图表类型（柱状图、折线图、饼图等）。';
    }
    
    if (lowerMessage.includes('分析') || lowerMessage.includes('analyze')) {
      return '我可以帮你分析数据！请提供你需要分析的数据或文件，我会为你生成详细的分析报告。';
    }
    
    return `收到你的消息："${message}"。\n\n我是一个AI助手，可以帮你完成各种任务。请告诉我更多细节，或者尝试以下功能：\n\n• 生成文档（Word、PDF、PPT、Excel）\n• 创建图表和数据可视化\n• 分析和处理数据\n• 搜索和抓取网页内容`;
  }

  /**
   * Stream text to client
   */
  async _streamText(socket, conversationId, text) {
    const chunkSize = 10;
    const chunks = [];
    
    // Split into chunks
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.substring(i, i + chunkSize));
    }
    
    // Stream chunks
    for (const chunk of chunks) {
      socket.emit('message_chunk', {
        conversationId,
        content: chunk
      });
      
      // Small delay for streaming effect
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Extract skill parameters from user message
   */
  _extractSkillParameters(message, skill) {
    const params = {};
    
    // Basic extraction - in production, this would use NLP
    if (skill.inputs) {
      for (const input of skill.inputs) {
        // Try to extract from message
        if (input.name === 'text' || input.name === 'content') {
          params[input.name] = message;
        } else if (input.name === 'data' || input.name === 'query') {
          params[input.name] = message;
        }
      }
    }
    
    // Default to passing message as content
    if (Object.keys(params).length === 0) {
      params.content = message;
      params.text = message;
    }
    
    return params;
  }

  /**
   * Handle skill execution request
   */
  async _handleSkillExecution(socket, data) {
    const { sessionId, skillName, parameters } = data;
    
    if (!sessionId || !skillName) {
      socket.emit('error', { message: 'Invalid skill execution request' });
      return;
    }

    try {
      const execution = await this.executor.execute(skillName, parameters, {
        sessionId,
        onProgress: (progress, message) => {
          socket.emit('skill_progress', {
            skillName,
            progress,
            message
          });
        }
      });

      socket.emit('skill_started', {
        skillName,
        executionId: execution.executionId,
        estimatedDuration: execution.estimatedDuration
      });

    } catch (error) {
      socket.emit('skill_error', {
        skillName,
        error: error.message
      });
    }
  }

  /**
   * Handle disconnect
   */
  _handleDisconnect(socket) {
    const sessionData = this.sessions.get(socket.id);
    
    if (sessionData) {
      console.log(`[ChatWS] Socket ${socket.id} disconnected, session ${sessionData.sessionId}`);
      this.sessions.delete(socket.id);
    }
  }

  /**
   * Get session stats
   */
  getSessionStats() {
    return {
      activeConnections: this.sessions.size,
      maxSessions: this.maxSessions
    };
  }

  /**
   * Cleanup inactive sessions
   */
  cleanup() {
    const now = Date.now();
    const timeout = 3600000; // 1 hour
    
    for (const [socketId, data] of this.sessions) {
      if (now - data.session.lastAccessed > timeout) {
        data.socket.disconnect(true);
        this.sessions.delete(socketId);
      }
    }
  }
}

// Singleton instance
let globalChatHandler = null;

function getChatWebSocketHandler(options) {
  if (!globalChatHandler) {
    globalChatHandler = new ChatWebSocketHandler(options);
  }
  return globalChatHandler;
}

module.exports = {
  ChatWebSocketHandler,
  getChatWebSocketHandler
};