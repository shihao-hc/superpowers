/**
 * UltraWork AI 聊天服务
 */

const { EventEmitter } = require('events');
const _config = require('../config');

// 集成 Claude Code 风格的上下文压缩服务
const { ContextCompactService } = require('../../src/agent/ContextCompactService');

class ChatService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.conversations = new Map();
    this.messageQueue = [];
    this.stats = {
      totalMessages: 0,
      totalLatency: 0,
      errors: 0,
      llm: { attempts: 0, successes: 0, fallbacks: 0 }
    };

    // LLM 推理（Ollama）— 可注入 mock，默认惰性创建
    this.ollamaBridge = options.ollamaBridge || null;
    this._ollamaTried = false;

    // 初始化上下文压缩服务
    this.contextCompact = new ContextCompactService({
      maxTokens: 100000,
      bufferTokens: 13000,
      warningThreshold: 20000,
      preserveRecentMessages: 10,
      autoCompactEnabled: true
    });
  }

  /**
   * 获取或惰性创建 Ollama bridge
   */
  _getOllamaBridge() {
    if (this.ollamaBridge) {return this.ollamaBridge;}
    // 不在首次失败后永久禁用 — 每次请求重试（Ollama 重启等瞬时故障不应永久降级）
    this._ollamaTried = true;
    try {
      const { OllamaBridge } = require('../../src/localInferencing/OllamaBridge');
      this.ollamaBridge = new OllamaBridge();
      return this.ollamaBridge;
    } catch (e) { /* Ollama 不可用时回退话术 */ }
    return null;
  }

  /**
   * 获取或惰性创建 MCP plugin（供 LLM 自主调用 MCP 只读工具）
   */
  _getMCPPlugin() {
    if (this._mcpPlugin) {return this._mcpPlugin;}
    if (this._mcpTried) {return null;} // 一次失败后不再重试（进程级）
    this._mcpTried = true;
    try {
      const path = require('path');
      const { MCPPlugin } = require('../../src/mcp/MCPPlugin');
      const plugin = new MCPPlugin({ configPath: path.join(process.cwd(), 'config', 'mcp-servers.json') });
      this._mcpPlugin = plugin;
      return plugin;
    } catch (e) { /* MCP 不可用，仅 generate_document 技能 */ }
    return null;
  }

  /**
   * Ollama 调用带重试（瞬时故障自动恢复）
   */
  async _chatWithRetry(bridge, sysPrompt, history, options = {}) {
    const { RetryHandler } = require('../../src/utils/UltraWorkUtils');
    const messages = [
      { role: 'system', content: sysPrompt },
      ...history
    ];
    const result = await RetryHandler.retry(
      () => bridge.chat(messages, { temperature: 0.7, tools: options.tools }),
      { maxAttempts: 3, delay: 500, backoff: 2 }
    );
    return result;
  }

  /**
   * 规则解析文档生成请求（确定性兜底，不依赖 LLM tool_calls）
   */
  _ruleBasedDocumentCall(text) {
    const t = String(text || '');
    // 解析标题：引号内或"标题为/标题：/名为"后
    const titleMatch = t.match(/["“”]([^"“”']{1,50})["“”'']/) ||
      t.match(/标题[为是：:\s]+([^，。,.]{1,30})/) ||
      t.match(/名为[：:\s]*([^，。,.]{1,30})/);
    const title = titleMatch ? titleMatch[1].trim() : '未命名文档';
    // 解析类型
    let type = 'docx';
    if (/pdf/i.test(t)) { type = 'pdf'; }
    else if (/图形|海报|图片|图标|chart|canvas/i.test(t)) { type = 'canvas-design'; }
    else if (/word|docx|文档|报告|周报|表格/i.test(t)) { type = 'docx'; }
    // 若只是问"能生成吗"而非明确请求，不触发
    if (/能(否|不能|可以)?生成|是否|怎么生成|如何生成/.test(t) && !/帮我|请|给我|帮我生成|请生成/.test(t)) {
      return null;
    }
    return { name: 'generate_document', arguments: { type, title } };
  }

  /**
   * 描述工具执行结果（供兜底回复）
   */
  _describeToolResult(toolResults) {
    const r = (toolResults || [])[0];
    if (!r) { return '我尝试生成文档，但没有成功。'; }
    if (r.ok) {
      return `我已为你生成${r.result && r.result.type ? r.result.type.toUpperCase() : '文档'}：${r.result && r.result.message ? r.result.message : '已生成'}${r.result && r.result.path ? `（${r.result.path}）` : ''}`;
    }
    return `生成文档时遇到问题：${r.error || '未知错误'}`;
  }

  /**
   * 工具调用 schema（供 LLM 自主调用技能）
   */
  async _buildToolsSchema() {
    const tools = [
      {
        type: 'function',
        function: {
          name: 'generate_document',
          description: '生成 Office 文档（Word/PDF/Canvas 图形）。当用户要求创建/生成文档、报告、表格、图形时使用。',
          parameters: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['docx', 'pdf', 'canvas-design'], description: '文档类型' },
              title: { type: 'string', description: '文档标题' },
              content: { type: 'string', description: '文档内容或描述' },
              action: { type: 'string', enum: ['create'], description: '操作，默认 create' }
            },
            required: ['type']
          }
        }
      }
    ];

    // 追加 MCP 只读工具（读写分离：写操作不暴露给 LLM，门禁仅作深度防御）
    try {
      const plugin = this._getMCPPlugin();
      if (plugin) {
        try {
          if (plugin.status !== 'ready' && typeof plugin.onLoad === 'function') {
            await Promise.race([
              plugin.onLoad(),
              new Promise((_, rej) => setTimeout(() => rej(new Error('MCP init timeout')), 5000))
            ]);
          }
        } catch (e) { /* MCP 初始化失败/超时，仅 generate_document */ }
        if (typeof plugin.getAvailableTools === 'function') {
          const readOnlyAllowlist = [
            'filesystem:read_file', 'filesystem:read_text_file', 'filesystem:read_media_file',
            'filesystem:list_directory', 'filesystem:directory_tree', 'filesystem:search_files',
            'filesystem:get_file_info', 'filesystem:list_allowed_directories',
            'sequential-thinking:sequentialthinking'
          ];
          const available = plugin.getAvailableTools({ includeSchema: true }) || [];
          for (const t of available) {
            if (readOnlyAllowlist.includes(t.name)) {
              tools.push({
                type: 'function',
                function: {
                  name: t.name,
                  description: t.description || t.name,
                  parameters: t.parameters || { type: 'object', properties: {} }
                }
              });
            }
          }
        }
      }
    } catch (e) { /* MCP 工具可选，仅 generate_document */ }

    return tools;
  }

  /**
   * 执行 LLM 请求的工具调用（白名单 + 真实技能执行）
   */
  async _executeToolCalls(toolCalls) {
    const results = [];
    for (const call of (toolCalls || [])) {
      const fn = call.function || call;
      const name = fn.name || '';
      const args = (typeof fn.arguments === 'string' ? (() => { try { return JSON.parse(fn.arguments); } catch { return {}; } })() : fn.arguments) || {};
      let executor = null;
      try {
        if (name.includes(':') && name !== 'generate_document') {
          // MCP 工具调用（只读白名单已在 schema 层限制，此处再校验防直接注入）
          const readOnlyAllowlist = [
            'filesystem:read_file', 'filesystem:read_text_file', 'filesystem:read_media_file',
            'filesystem:list_directory', 'filesystem:directory_tree', 'filesystem:search_files',
            'filesystem:get_file_info', 'filesystem:list_allowed_directories',
            'sequential-thinking:sequentialthinking'
          ];
          if (!readOnlyAllowlist.includes(name)) {
            results.push({ tool: name, ok: false, error: `Tool '${name}' is not allowed for autonomous use` });
            continue;
          }
          const plugin = this._getMCPPlugin();
          if (!plugin || typeof plugin.executeTool !== 'function') {
            results.push({ tool: name, ok: false, error: 'MCP plugin not available' });
            continue;
          }
          const mcpResult = await plugin.executeTool(name, args);
          results.push({
            tool: name,
            ok: true,
            result: { type: 'mcp', tool: name, output: mcpResult }
          });
          continue;
        }
        if (name === 'generate_document') {
          const skillName = args.type || 'docx';
          if (process.env.NODE_ENV === 'test' && process.env.DEBUG_TOOLS === '1') {
            console.log('[_executeToolCalls] executing:', skillName, JSON.stringify(args).slice(0, 80));
          }
          const { AsyncExecutor } = require('../../src/skills/agent/AsyncExecutor');
          executor = new AsyncExecutor();
          const execution = await executor.execute(skillName, {
            action: args.action || 'create',
            title: args.title || args.content || '',
            content: args.content || ''
          });
          const finalResult = await executor.waitForCompletion(execution.executionId, { timeout: 30000 });
          const filePath = finalResult && finalResult.result ? (finalResult.result.path || finalResult.path || null) : null;
          // placeholder 非真实执行 → 诚实失败
          const placeholder = finalResult ? finalResult.placeholder : false;
          if (placeholder) {
            results.push({ tool: name, ok: false, error: `Skill '${skillName}' has no real executor (placeholder)` });
          } else {
            results.push({
              tool: name,
              ok: true,
              result: {
                type: skillName,
                message: filePath ? `已生成到 ${filePath}` : 'generated',
                path: filePath
              }
            });
          }
        } else {
          results.push({ tool: name, ok: false, error: `Unknown tool: ${name}` });
        }
      } catch (e) {
        results.push({ tool: name, ok: false, error: e.message });
      } finally {
        // 清理 AsyncExecutor 定时器（防泄漏）
        if (executor && typeof executor.destroy === 'function') {
          executor.destroy();
        }
      }
    }
    if (process.env.DEBUG_TOOLS === '1') {
      console.log('[_executeToolCalls] results:', JSON.stringify(results).slice(0, 200));
    }
    return results;
  }

  /**
   * 处理消息
   */
  async processMessage({ text, personality, context, userId }) {
    const startTime = Date.now();

    try {
      // 获取或创建会话
      let conversation = this.conversations.get(userId);
      if (!conversation) {
        conversation = {
          id: userId,
          messages: [],
          personality: personality || 'default',
          context: context || {},
          createdAt: new Date(),
          lastActivity: new Date()
        };
        this.conversations.set(userId, conversation);
      }

      // 更新会话
      conversation.personality = personality || conversation.personality;
      conversation.context = { ...conversation.context, ...context };
      conversation.lastActivity = new Date();

      // 添加用户消息
      const userMessage = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        role: 'user',
        content: text,
        timestamp: new Date()
      };

      conversation.messages.push(userMessage);

      // BrainSystem 感知：意图分析 + 记忆存储（非侵入式，失败不影响对话）
      try {
        const { BrainSystem } = require('../../src/core/BrainSystem');
        if (BrainSystem.analyzeIntent) {
          const intent = BrainSystem.analyzeIntent(text);
          conversation.context = { ...conversation.context, lastIntent: intent };
        }
        if (BrainSystem.smartStore && userId && userId !== 'anonymous') {
          BrainSystem.smartStore(`chat_${userId}_${Date.now()}`, { input: text, role: 'user', userId });
        }
        const hooks = require('../../src/hooks');
        if (hooks && hooks.HookEvents && hooks.triggerHook) {
          await hooks.triggerHook(hooks.HookEvents.MESSAGE_RECEIVE, { text, userId, conversation: conversation.id });
        }
      } catch (e) { /* BrainSystem 可选，失败静默 */ }

      // Claude Code 风格的上下文压缩
      this.contextCompact.addMessage(userMessage);

      // 检查是否需要压缩
      if (this.contextCompact.shouldCompact()) {
        const compacted = this.contextCompact.compact();
        if (compacted.messages) {
          conversation.messages = compacted.messages;
        }
        this.emit('context:compacted', { userId, compacted: compacted.stats });
      }

      // 生成回复
      const response = await this.generateResponse(text, conversation);

      // 添加助手回复
      const assistantMessage = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        role: 'assistant',
        content: response.text,
        personality: conversation.personality,
        timestamp: new Date(),
        latency: Date.now() - startTime
      };

      conversation.messages.push(assistantMessage);

      // BrainSystem 记忆：存储交互 + 发送钩子（非侵入式）
      try {
        const { BrainSystem } = require('../../src/core/BrainSystem');
        if (BrainSystem.smartStore && userId && userId !== 'anonymous') {
          BrainSystem.smartStore(`chat_reply_${userId}_${Date.now()}`, { input: text, output: response.text, userId });
        }
        const hooks = require('../../src/hooks');
        if (hooks && hooks.HookEvents && hooks.triggerHook) {
          await hooks.triggerHook(hooks.HookEvents.MESSAGE_SEND, { text: response.text, input: text, userId, conversation: conversation.id });
        }
      } catch (e) { /* BrainSystem 可选，失败静默 */ }

      // 限制会话长度
      if (conversation.messages.length > 100) {
        conversation.messages = conversation.messages.slice(-50);
      }

      // 更新统计
      this.stats.totalMessages++;
      this.stats.totalLatency += (Date.now() - startTime);

      // 发出事件
      this.emit('message:processed', {
        userId,
        messageId: assistantMessage.id,
        latency: Date.now() - startTime
      });

      return {
        id: assistantMessage.id,
        text: response.text,
        source: response.source,
        toolResults: response.toolResults,
        ruleBased: response.ruleBased,
        personality: conversation.personality,
        timestamp: assistantMessage.timestamp,
        metadata: {
          latency: Date.now() - startTime,
          conversationLength: conversation.messages.length
        }
      };
    } catch (error) {
      this.stats.errors++;
      this.emit('message:error', { userId, error });
      throw error;
    }
  }

  /**
   * 生成回复
   */
  async generateResponse(text, conversation) {
    // 优先使用 Ollama 真实推理（非侵入式，失败回退话术）
    try {
      const bridge = this._getOllamaBridge();
      if (bridge) {
        const history = (conversation.messages || []).slice(-6).map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        }));
        // 动态 system prompt：融入人格 + 意图 + 相关记忆（多轮一致性 + 记忆增强）
        const personality = conversation.personality || 'default';
        const lastIntent = conversation.context && conversation.context.lastIntent;
        let memoryText = '';
        try {
          const { BrainSystem } = require('../../src/core/BrainSystem');
          let mem = [];
          if (BrainSystem.smartSearchSemantic) {
            mem = (await BrainSystem.smartSearchSemantic(text, 3)) || [];
          }
          if (mem.length === 0 && BrainSystem.smartSearch) {
            mem = BrainSystem.smartSearch(text, 3);
          }
          if (mem.length > 0) {
            memoryText = `你记得与该用户相关的信息：${mem.map((m) => typeof m.value === 'string' ? m.value : JSON.stringify(m.value)).join('；')}。`;
          }
        } catch (e) { /* 记忆可选，失败静默 */ }
        // 注入相关经验教训（学习到的知识影响回复）
        let lessonText = '';
        try {
          const LessonLibrary = require('../../src/core/LessonLibrary');
          const lib = new LessonLibrary({ quiet: true });
          const lessons = lib.search ? lib.search(text, { limit: 3 }) : [];
          if (Array.isArray(lessons) && lessons.length > 0) {
            lessonText = `参考经验教训：${lessons.map((l) => (l.lesson || l.problem || '').substring(0, 60)).filter(Boolean).join('；')}。`;
          }
        } catch (e) { /* 教训可选，失败静默 */ }
        // 注入思考前置（BrainSystem 的深层思考驱动更可靠的回答）
        let thinkText = '';
        try {
          const { BrainSystem } = require('../../src/core/BrainSystem');
          if (BrainSystem.forceThink) {
            const thinking = BrainSystem.forceThink(text);
            const qs = (thinking && thinking.metaQuestions) || [];
            if (Array.isArray(qs) && qs.length > 0) {
              const questions = qs.filter((q) => q && q.question).map((q) => q.question);
              if (questions.length > 0) {
                thinkText = `回答前请先思考：${questions.slice(0, 3).join('；')}。`;
              }
            }
          }
        } catch (e) { /* 思考可选，失败静默 */ }
        // 工具触发检测：仅当用户请求与文档生成相关时才启用工具调用（避免模型频繁误触发）
        const toolTrigger = /生成|创建|制作|设计|文档|报告|表格|图形|word|pdf|docx|周报|ppt|海报|图片|图标|读取|搜索|查看|列出|目录|文件|思维|分析文件|sequential/i.test(text);
        const toolPrompt = toolTrigger ? '当用户要求生成文档/报告/表格/图形时，调用 generate_document 工具（type 可选 docx/pdf/canvas-design，title 为标题）。当用户要求读取文件/目录、搜索文件、查看文件信息时，调用 filesystem:* 只读工具（如 filesystem:read_file, filesystem:list_directory, filesystem:search_files）。当需要深度思考时可用 sequential-thinking:sequentialthinking。调用工具后根据结果回复用户。' : '';
        const sysPrompt = `你是一个乐于助人的中文 AI 助手，回答简洁友好。你当前的人格是「${personality}」。${lastIntent && lastIntent.intent ? `用户最近的意图是「${lastIntent.intent}」。` : ''}${memoryText}${lessonText}${thinkText}${toolPrompt}`;
        const result = await this._chatWithRetry(bridge, sysPrompt, history, { tools: toolTrigger ? await this._buildToolsSchema() : undefined });
        this.stats.llm.attempts++;
        // 确定性兜底：用户明确请求生成文档但 LLM 未触发工具 → 规则解析直接执行（不依赖模型 tool_calls 质量）
        if (toolTrigger && result && result.ok && Array.isArray(result.tool_calls) && result.tool_calls.length === 0) {
          const ruleBased = this._ruleBasedDocumentCall(text);
          if (ruleBased) {
            const toolResults = await this._executeToolCalls([{ function: ruleBased }]);
            return { text: this._describeToolResult(toolResults), confidence: 0.8, source: 'ollama', toolResults, ruleBased: true };
          }
        }
        if (result && result.ok && result.text) {
          this.stats.llm.successes++;
          return { text: result.text, confidence: 0.9, source: 'ollama' };
        }
        // 工具调用循环（自主做事）：LLM 请求工具 → 执行 → 结果回填 → 再调 LLM
        if (result && result.ok && Array.isArray(result.tool_calls) && result.tool_calls.length > 0) {
          const toolResults = await this._executeToolCalls(result.tool_calls);
          const toolMessages = [
            { role: 'assistant', content: result.text || '', tool_calls: result.tool_calls },
            ...toolResults.map((r) => ({
              role: 'tool',
              content: JSON.stringify(r).substring(0, 500)
            }))
          ];
          const extendedHistory = [...history, ...toolMessages];
          const finalResult = await this._chatWithRetry(bridge, sysPrompt, extendedHistory);
          this.stats.llm.attempts++;
          if (finalResult && finalResult.ok && finalResult.text) {
            this.stats.llm.successes++;
            return { text: finalResult.text, confidence: 0.9, source: 'ollama', toolResults };
          }
        }
      }
    } catch (e) { /* Ollama 不可用，回退话术 */ }
    this.stats.llm.fallbacks++;

    const personality = conversation.personality || 'default';
    const _context = conversation.context || {};

    // 根据人格生成不同的回复风格
    const responses = {
      default: [
        '我理解你的意思。',
        '这是一个有趣的问题。',
        '让我想想...',
        '好的，我明白了。',
        '谢谢你的分享！'
      ],
      playful: [
        '哈哈，这太有趣了！',
        '哇，你真厉害！',
        '我也觉得很好玩呢~',
        '嘻嘻，你想到了什么？',
        '太棒了！继续说~'
      ],
      professional: [
        '我已经收到您的信息。',
        '根据您的描述，我建议...',
        '这个问题需要进一步分析。',
        '我理解您的需求。',
        '让我为您详细说明。'
      ],
      creative: [
        '让我用不同的角度思考...',
        '这让我想到了一个有趣的故事...',
        '也许我们可以这样看...',
        '想象一下...',
        '如果换一种方式呢？'
      ]
    };

    const responseList = responses[personality] || responses.default;
    const randomResponse = responseList[Math.floor(Math.random() * responseList.length)];

    // 模拟AI处理延迟
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

    return {
      text: randomResponse,
      confidence: 0.8 + Math.random() * 0.2,
      source: 'fallback'
    };
  }

  /**
   * 流式处理消息
   */
  async processStream({ text, personality, context, userId, onData, onEnd, onError }) {
    try {
      const startTime = Date.now();

      // 获取或创建会话
      let conversation = this.conversations.get(userId);
      if (!conversation) {
        conversation = {
          id: userId,
          messages: [],
          personality: personality || 'default',
          context: context || {},
          createdAt: new Date(),
          lastActivity: new Date()
        };
        this.conversations.set(userId, conversation);
      }

      // 添加用户消息
      conversation.messages.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        role: 'user',
        content: text,
        timestamp: new Date()
      });

      // 模拟流式响应
      const fullResponse = `收到你的消息: "${text}"。这是${conversation.personality}人格的回复。`;
      const words = fullResponse.split('');

      let currentText = '';

      for (let i = 0; i < words.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 30));

        currentText += words[i];

        onData({
          type: 'chunk',
          content: words[i],
          fullText: currentText,
          progress: (i + 1) / words.length
        });
      }

      // 添加助手回复
      conversation.messages.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        role: 'assistant',
        content: currentText,
        timestamp: new Date(),
        latency: Date.now() - startTime
      });

      onEnd();
    } catch (error) {
      onError(error);
    }
  }

  /**
   * 获取聊天历史
   */
  async getHistory(userId, options = {}) {
    const conversation = this.conversations.get(userId);
    if (!conversation) {
      return { messages: [], total: 0 };
    }

    const { limit = 50, offset = 0 } = options;
    const messages = conversation.messages.slice(offset, offset + limit);

    return {
      messages,
      total: conversation.messages.length,
      offset,
      limit,
      personality: conversation.personality,
      lastActivity: conversation.lastActivity
    };
  }

  /**
   * 清除聊天历史
   */
  async clearHistory(userId) {
    const conversation = this.conversations.get(userId);
    if (conversation) {
      conversation.messages = [];
      conversation.lastActivity = new Date();
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      activeConversations: this.conversations.size,
      averageLatency: this.stats.totalMessages > 0 ?
        this.stats.totalLatency / this.stats.totalMessages : 0
    };
  }

  /**
   * 清理不活跃会话
   */
  cleanupInactiveSessions(maxInactiveTime = 3600000) { // 默认1小时
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, conversation] of this.conversations) {
      if (now - conversation.lastActivity.getTime() > maxInactiveTime) {
        this.conversations.delete(userId);
        cleaned++;
      }
    }

    return cleaned;
  }
}

module.exports = new ChatService();