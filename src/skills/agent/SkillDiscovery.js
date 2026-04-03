/**
 * Skill Discovery System
 * Agent 在对话中自动判断何时需要调用技能，并选择最合适的技能
 * 类似 Claude 的 function calling 功能
 * 
 * Features:
 * - Intent matching with confidence scoring
 * - Learning from user feedback
 * - Adaptive threshold adjustment
 * - Performance tracking
 */

class SkillDiscovery {
  constructor(options = {}) {
    this.skillManager = options.skillManager;
    this.skillLoader = options.skillLoader;
    this.feedbackSystem = options.feedbackSystem || null;
    
    // 技能索引缓存
    this.skillIndex = new Map();
    this.intentPatterns = new Map();
    
    // Learning data
    this.learningData = {
      acceptedRecommendations: new Map(),
      rejectedRecommendations: new Map(),
      skillSuccessRates: new Map(),
      contextMappings: new Map(),
      keywordWeights: new Map()
    };
    
    // 配置
    this.config = {
      maxSkillsInPrompt: 20,
      confidenceThreshold: 0.6,
      enableAutoSelect: true,
      enableConfirmation: true,
      contextWindow: 10,
      learningEnabled: options.learningEnabled !== false,
      adaptiveThreshold: options.adaptiveThreshold !== false
    };
    
    // Performance tracking
    this.performanceStats = {
      totalRecommendations: 0,
      acceptedRecommendations: 0,
      rejectedRecommendations: 0,
      averageConfidence: 0
    };
    
    // 初始化技能索引
    this._buildSkillIndex();
  }

  /**
   * 构建技能索引
   */
  _buildSkillIndex() {
    try {
      const skills = this.skillManager.getAllSkills ? this.skillManager.getAllSkills() : [];
      
      for (const skill of skills) {
        // 基础信息
        const indexEntry = {
          id: skill.id || skill.name,
          name: skill.name,
          description: skill.description || '',
          category: skill.category || 'general',
          riskLevel: skill.riskLevel || 'low',
          version: skill.version || '1.0.0',
          inputs: skill.inputs || [],
          outputs: skill.outputs || [],
          tags: skill.tags || [],
          examples: skill.examples || [],
          synonyms: skill.synonyms || [],
          useCases: skill.useCases || []
        };
        
        // 提取关键词
        indexEntry.keywords = this._extractKeywords(
          `${skill.name} ${skill.description} ${(skill.tags || []).join(' ')}`
        );
        
        // 提取意图模式
        indexEntry.intentPatterns = this._extractIntentPatterns(skill);
        
        this.skillIndex.set(skill.name, indexEntry);
      }
      
      console.log(`[SkillDiscovery] Indexed ${this.skillIndex.size} skills`);
    } catch (error) {
      console.error('[SkillDiscovery] Failed to build index:', error.message);
    }
  }

  /**
   * 提取关键词
   */
  _extractKeywords(text) {
    if (!text) return [];
    
    const stopWords = new Set(['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这']);
    
    const words = text.toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.has(word));
    
    return [...new Set(words)];
  }

  /**
   * 提取意图模式
   */
  _extractIntentPatterns(skill) {
    const patterns = [];
    
    // 从描述中提取动词+名词模式
    const verbs = ['创建', '生成', '制作', '写', '读', '编辑', '删除', '转换', '分析', '处理', '优化', '计算', '查询', '搜索', '获取'];
    const nouns = ['报告', '文档', '图表', '表格', '图片', '代码', '文件', '数据', '分析', '测试', '演示', '幻灯片'];
    
    // 基于技能名称和描述推断意图
    const combinedText = `${skill.name} ${skill.description}`.toLowerCase();
    
    // 常见的技能调用模式
    const intentMappings = {
      'docx': ['写文档', '创建文档', '生成word', 'word文档', '文档编辑'],
      'pdf': ['生成pdf', '创建pdf', 'pdf文件', '转换pdf'],
      'pptx': ['做ppt', '创建幻灯片', '制作演示', '生成演示文稿'],
      'xlsx': ['做表格', '创建excel', '电子表格', '数据表'],
      'canvas': ['画图', '生成图片', '创建图表', '可视化'],
      'pdf-generator': ['生成pdf', 'pdf文档'],
      'text-generator': ['写文本', '生成文字', '创作'],
      'data-cleaner': ['清洗数据', '数据处理', '数据整理'],
      'statistics': ['统计分析', '数据分析', '计算统计'],
      'chart-generator': ['画图表', '图表生成', '数据可视化']
    };
    
    // 匹配已知的意图映射
    for (const [skillPattern, intents] of Object.entries(intentMappings)) {
      if (combinedText.includes(skillPattern)) {
        patterns.push(...intents);
      }
    }
    
    return [...new Set(patterns)];
  }

  /**
   * 获取技能的LLM工具定义（OpenAI/Anthropic格式）
   */
  getSkillsForLLM(options = {}) {
    const { maxSkills = this.config.maxSkillsInPrompt, category = null } = options;
    
    let skills = Array.from(this.skillIndex.values());
    
    // 按类别过滤
    if (category) {
      skills = skills.filter(s => s.category === category);
    }
    
    // 转换为工具格式
    const tools = skills.slice(0, maxSkills).map(skill => this._convertToToolFormat(skill));
    
    return {
      tools,
      toolCount: tools.length,
      totalSkills: this.skillIndex.size
    };
  }

  /**
   * 转换为工具格式（OpenAI function calling 格式）
   */
  _convertToToolFormat(skill) {
    // 构建参数schema
    const parameters = {
      type: 'object',
      properties: {},
      required: []
    };
    
    for (const input of skill.inputs || []) {
      parameters.properties[input.name] = {
        type: input.type || 'string',
        description: input.description || ''
      };
      
      if (input.required) {
        parameters.required.push(input.name);
      }
      
      if (input.enum) {
        parameters.properties[input.name].enum = input.enum;
      }
      
      if (input.default !== undefined) {
        parameters.properties[input.name].default = input.default;
      }
    }
    
    return {
      type: 'function',
      function: {
        name: skill.name,
        description: this._formatDescription(skill),
        parameters: parameters,
        // 扩展字段
        metadata: {
          category: skill.category,
          riskLevel: skill.riskLevel,
          version: skill.version,
          tags: skill.tags
        }
      }
    };
  }

  /**
   * 格式化技能描述
   */
  _formatDescription(skill) {
    let description = skill.description || '';
    
    // 添加用法示例
    if (skill.examples && skill.examples.length > 0) {
      description += '\n\n用法示例:';
      skill.examples.slice(0, 2).forEach(example => {
        description += `\n- ${example}`;
      });
    }
    
    // 添加适用场景
    if (skill.useCases && skill.useCases.length > 0) {
      description += '\n\n适用场景: ' + skill.useCases.join(', ');
    }
    
    // 添加风险提示
    if (skill.riskLevel === 'high') {
      description += '\n\n⚠️ 此技能需要确认才能执行（高风险操作）';
    }
    
    return description;
  }

  /**
   * 分析用户输入，匹配最合适的技能
   */
  analyzeInput(userInput, conversationHistory = []) {
    const inputLower = userInput.toLowerCase();
    const results = {
      matchedSkills: [],
      hasMatch: false,
      confidence: 0,
      needsConfirmation: false,
      suggestedClarification: null
    };
    
    // 提取用户输入的关键词
    const inputKeywords = this._extractKeywords(userInput);
    
    // 计算每个技能的匹配分数
    const scoredSkills = [];
    
    for (const [skillName, skillIndex] of this.skillIndex) {
      const score = this._calculateMatchScore(skillIndex, inputLower, inputKeywords, conversationHistory);
      
      if (score >= this.config.confidenceThreshold) {
        scoredSkills.push({
          skill: skillIndex,
          score,
          matchReasons: this._getMatchReasons(skillIndex, inputLower, inputKeywords)
        });
      }
    }
    
    // 按分数排序
    scoredSkills.sort((a, b) => b.score - a.score);
    
    // 取前3个最佳匹配
    results.matchedSkills = scoredSkills.slice(0, 3).map(s => ({
      ...s.skill,
      confidence: s.score,
      matchReasons: s.matchReasons
    }));
    
    results.hasMatch = scoredSkills.length > 0;
    results.confidence = scoredSkills.length > 0 ? scoredSkills[0].score : 0;
    
    // 检查是否需要确认
    if (results.matchedSkills.length > 0 && results.matchedSkills[0].riskLevel === 'high') {
      results.needsConfirmation = true;
    }
    
    // 如果匹配度不高，可能需要澄清
    if (results.hasMatch && results.confidence < 0.8 && results.confidence >= this.config.confidenceThreshold) {
      results.suggestedClarification = this._generateClarificationQuestion(
        results.matchedSkills[0],
        userInput
      );
    }
    
    return results;
  }

  /**
   * 计算匹配分数
   */
  _calculateMatchScore(skillIndex, inputLower, inputKeywords, conversationHistory) {
    let score = 0;
    
    // 1. 关键词匹配（权重 40%）
    const keywordMatches = skillIndex.keywords.filter(kw => 
      inputLower.includes(kw) || inputKeywords.includes(kw)
    ).length;
    const keywordScore = skillIndex.keywords.length > 0 
      ? keywordMatches / Math.min(skillIndex.keywords.length, 10) 
      : 0;
    score += keywordScore * 0.4;
    
    // 2. 意图模式匹配（权重 30%）
    const intentMatches = skillIndex.intentPatterns.filter(pattern => 
      inputLower.includes(pattern)
    ).length;
    const intentScore = skillIndex.intentPatterns.length > 0 
      ? intentMatches / skillIndex.intentPatterns.length 
      : 0;
    score += intentScore * 0.3;
    
    // 3. 描述相似度（权重 20%）
    const descWords = this._extractKeywords(skillIndex.description);
    const descMatches = descWords.filter(w => inputLower.includes(w)).length;
    const descScore = descWords.length > 0 ? descMatches / descWords.length : 0;
    score += descScore * 0.2;
    
    // 4. 同义词匹配（权重 10%）
    const synonymMatches = (skillIndex.synonyms || []).filter(syn => 
      inputLower.includes(syn)
    ).length;
    const synonymScore = (skillIndex.synonyms || []).length > 0 
      ? synonymMatches / skillIndex.synonyms.length 
      : 0;
    score += synonymScore * 0.1;
    
    return Math.min(1, score);
  }

  /**
   * 获取匹配原因
   */
  _getMatchReasons(skillIndex, inputLower, inputKeywords) {
    const reasons = [];
    
    // 关键词匹配
    const matchedKeywords = skillIndex.keywords.filter(kw => 
      inputLower.includes(kw) || inputKeywords.includes(kw)
    );
    if (matchedKeywords.length > 0) {
      reasons.push(`关键词匹配: ${matchedKeywords.slice(0, 3).join(', ')}`);
    }
    
    // 意图匹配
    const matchedIntents = skillIndex.intentPatterns.filter(pattern => 
      inputLower.includes(pattern)
    );
    if (matchedIntents.length > 0) {
      reasons.push(`意图匹配: ${matchedIntents.slice(0, 2).join(', ')}`);
    }
    
    return reasons;
  }

  /**
   * 生成澄清问题
   */
  _generateClarificationQuestion(skill, userInput) {
    const questions = [
      `您是想使用"${skill.name}"技能吗？此技能可以${skill.description.substring(0, 50)}...`,
      `我检测到您可能需要"${skill.name}"技能，是否要使用它？`,
      `"${skill.name}"技能可以帮您完成这个任务，需要我使用吗？`
    ];
    
    return questions[Math.floor(Math.random() * questions.length)];
  }

  /**
   * 生成技能调用请求
   */
  generateToolCall(skillName, parameters) {
    const skill = this.skillIndex.get(skillName);
    if (!skill) {
      throw new Error(`Skill not found: ${skillName}`);
    }
    
    return {
      id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'function',
      function: {
        name: skillName,
        arguments: JSON.stringify(parameters)
      },
      metadata: {
        skillId: skill.id,
        riskLevel: skill.riskLevel,
        requestedAt: new Date().toISOString()
      }
    };
  }

  /**
   * 解析LLM工具调用响应
   */
  parseToolCalls(llmResponse) {
    const toolCalls = [];
    
    // OpenAI格式
    if (llmResponse.tool_calls) {
      for (const call of llmResponse.tool_calls) {
        toolCalls.push({
          id: call.id,
          name: call.function.name,
          arguments: JSON.parse(call.function.arguments || '{}')
        });
      }
    }
    
    // Anthropic格式
    if (llmResponse.content && Array.isArray(llmResponse.content)) {
      for (const block of llmResponse.content) {
        if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input
          });
        }
      }
    }
    
    return toolCalls;
  }

  /**
   * 生成工具调用结果格式
   */
  formatToolResult(executionResult, executionId) {
    return {
      tool_call_id: executionId,
      output: {
        success: executionResult.success !== false,
        text: executionResult.text || executionResult.message || '',
        data: executionResult.data || executionResult.result,
        attachments: executionResult.attachments || [],
        executionId: executionId,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * 获取技能摘要（用于注入系统Prompt）
   */
  getSkillSummary(maxSkills = 10) {
    const skills = Array.from(this.skillIndex.values())
      .slice(0, maxSkills)
      .map(s => ({
        name: s.name,
        description: s.description.substring(0, 100),
        category: s.category,
        riskLevel: s.riskLevel
      }));
    
    return {
      totalSkills: this.skillIndex.size,
      skills,
      usage: `您可以调用以下技能: ${skills.map(s => s.name).join(', ')}。使用技能可以完成特定任务，如文档生成、数据分析等。`
    };
  }

  /**
   * 刷新技能索引
   */
  refreshIndex() {
    this.skillIndex.clear();
    this._buildSkillIndex();
  }

  /**
   * 记录推荐结果（用于学习）
   */
  recordRecommendationResult(skillName, userInput, wasAccepted, confidence = 0.5) {
    if (!this.config.learningEnabled) return;

    this.performanceStats.totalRecommendations++;

    if (wasAccepted) {
      this.performanceStats.acceptedRecommendations++;
      
      // Update accepted count
      const current = this.learningData.acceptedRecommendations.get(skillName) || 0;
      this.learningData.acceptedRecommendations.set(skillName, current + 1);

      // Update keyword weights
      const keywords = this._extractKeywords(userInput);
      for (const keyword of keywords) {
        const current = this.learningData.keywordWeights.get(keyword) || { accepted: 0, rejected: 0 };
        current.accepted++;
        this.learningData.keywordWeights.set(keyword, current);
      }

      // Update context mappings
      const contextKey = this._extractContextKey(userInput);
      const context = this.learningData.contextMappings.get(contextKey) || { skills: {} };
      context.skills[skillName] = (context.skills[skillName] || 0) + 1;
      this.learningData.contextMappings.set(contextKey, context);
    } else {
      this.performanceStats.rejectedRecommendations++;

      // Update rejected count
      const current = this.learningData.rejectedRecommendations.get(skillName) || 0;
      this.learningData.rejectedRecommendations.set(skillName, current + 1);
    }

    // Update average confidence
    const total = this.performanceStats.acceptedRecommendations + this.performanceStats.rejectedRecommendations;
    this.performanceStats.averageConfidence = 
      (this.performanceStats.averageConfidence * (total - 1) + confidence) / total;
  }

  /**
   * 记录技能执行结果
   */
  recordSkillExecutionResult(skillName, success, duration, rating) {
    const current = this.learningData.skillSuccessRates.get(skillName) || {
      total: 0,
      successful: 0,
      failed: 0,
      totalDuration: 0,
      avgDuration: 0,
      ratings: []
    };

    current.total++;
    if (success) {
      current.successful++;
    } else {
      current.failed++;
    }

    if (duration) {
      current.totalDuration += duration;
      current.avgDuration = current.totalDuration / current.total;
    }

    if (rating) {
      current.ratings.push(rating);
    }

    this.learningData.skillSuccessRates.set(skillName, current);
  }

  /**
   * 获取技能成功率
   */
  getSkillSuccessRate(skillName) {
    const data = this.learningData.skillSuccessRates.get(skillName);
    if (!data || data.total === 0) return 0.5;
    return data.successful / data.total;
  }

  /**
   * 获取推荐接受率
   */
  getRecommendationAcceptanceRate(skillName) {
    const accepted = this.learningData.acceptedRecommendations.get(skillName) || 0;
    const rejected = this.learningData.rejectedRecommendations.get(skillName) || 0;
    const total = accepted + rejected;
    
    if (total === 0) return null;
    return accepted / total;
  }

  /**
   * 获取自适应置信度阈值
   */
  getAdaptiveThreshold() {
    if (!this.config.adaptiveThreshold) {
      return this.config.confidenceThreshold;
    }

    const acceptanceRate = this.performanceStats.totalRecommendations > 0
      ? this.performanceStats.acceptedRecommendations / this.performanceStats.totalRecommendations
      : 0.5;

    // Adjust threshold based on acceptance rate
    // If acceptance is low, increase threshold to be more selective
    // If acceptance is high, lower threshold to be more inclusive
    let threshold = this.config.confidenceThreshold;
    
    if (acceptanceRate < 0.3) {
      threshold = Math.min(0.9, threshold + 0.1);
    } else if (acceptanceRate < 0.5) {
      threshold = Math.min(0.8, threshold + 0.05);
    } else if (acceptanceRate > 0.7) {
      threshold = Math.max(0.4, threshold - 0.05);
    }

    return threshold;
  }

  /**
   * 获取优化后的匹配分数（考虑学习数据）
   */
  getOptimizedMatchScore(skillIndex, inputLower, inputKeywords, conversationHistory) {
    // Get base score
    let score = this._calculateMatchScore(skillIndex, inputLower, inputKeywords, conversationHistory);

    if (!this.config.learningEnabled) {
      return score;
    }

    // Boost score for well-performing skills
    const successRate = this.getSkillSuccessRate(skillIndex.name);
    if (successRate > 0.8) {
      score *= 1.2; // Boost by 20%
    } else if (successRate < 0.5) {
      score *= 0.8; // Reduce by 20%
    }

    // Boost score for high acceptance rate skills
    const acceptanceRate = this.getRecommendationAcceptanceRate(skillIndex.name);
    if (acceptanceRate !== null) {
      if (acceptanceRate > 0.7) {
        score *= 1.15;
      } else if (acceptanceRate < 0.3) {
        score *= 0.85;
      }
    }

    // Adjust for keyword weights from learning
    for (const keyword of inputKeywords) {
      const weight = this.learningData.keywordWeights.get(keyword);
      if (weight && weight.accepted > weight.rejected) {
        const keywordScore = weight.accepted / (weight.accepted + weight.rejected);
        if (keywordScore > 0.6) {
          score *= 1.1;
        }
      }
    }

    // Cap at 1.0
    return Math.min(1.0, score);
  }

  /**
   * 分析推荐模式
   */
  analyzeRecommendationPatterns() {
    const patterns = {
      topAcceptedSkills: [],
      topRejectedSkills: [],
      highPerformingSkills: [],
      lowPerformingSkills: []
    };

    // Sort skills by acceptance rate
    const skillAcceptances = [];
    for (const [skillName] of this.learningData.acceptedRecommendations) {
      const rate = this.getRecommendationAcceptanceRate(skillName);
      const success = this.getSkillSuccessRate(skillName);
      skillAcceptances.push({
        name: skillName,
        acceptanceRate: rate,
        successRate: success,
        accepted: this.learningData.acceptedRecommendations.get(skillName),
        rejected: this.learningData.rejectedRecommendations.get(skillName) || 0
      });
    }

    skillAcceptances.sort((a, b) => (b.acceptanceRate || 0) - (a.acceptanceRate || 0));

    patterns.topAcceptedSkills = skillAcceptances.slice(0, 5);
    patterns.topRejectedSkills = skillAcceptances.slice(-5).reverse();

    // High/low performing skills
    const bySuccess = skillAcceptances
      .filter(s => s.successRate > 0)
      .sort((a, b) => b.successRate - a.successRate);

    patterns.highPerformingSkills = bySuccess.slice(0, 5);
    patterns.lowPerformingSkills = bySuccess.slice(-5).reverse();

    return patterns;
  }

  /**
   * 生成改进建议
   */
  generateImprovementSuggestions() {
    const suggestions = [];
    const patterns = this.analyzeRecommendationPatterns();

    // Low acceptance rate skills
    for (const skill of patterns.topRejectedSkills) {
      if ((skill.acceptanceRate || 0) < 0.3 && (skill.accepted + skill.rejected) >= 5) {
        suggestions.push({
          type: 'skill_metadata',
          priority: 'high',
          skill: skill.name,
          issue: `Low acceptance rate: ${((skill.acceptanceRate || 0) * 100).toFixed(1)}%`,
          suggestion: 'Review skill description and tags for better intent matching'
        });
      }
    }

    // Low success rate skills
    for (const skill of patterns.lowPerformingSkills) {
      if (skill.successRate < 0.5 && (skill.accepted + skill.rejected) >= 3) {
        suggestions.push({
          type: 'skill_quality',
          priority: 'high',
          skill: skill.name,
          issue: `Low success rate: ${(skill.successRate * 100).toFixed(1)}%`,
          suggestion: 'Review skill implementation for errors'
        });
      }
    }

    // Overall recommendation accuracy
    const total = this.performanceStats.acceptedRecommendations + this.performanceStats.rejectedRecommendations;
    if (total >= 10) {
      const accuracy = this.performanceStats.acceptedRecommendations / total;
      if (accuracy < 0.4) {
        suggestions.push({
          type: 'algorithm',
          priority: 'medium',
          issue: `Overall recommendation accuracy: ${(accuracy * 100).toFixed(1)}%`,
          suggestion: 'Consider reviewing the matching algorithm or adding more training data'
        });
      }
    }

    return suggestions;
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats() {
    const total = this.performanceStats.acceptedRecommendations + this.performanceStats.rejectedRecommendations;
    
    return {
      totalRecommendations: total,
      acceptedRecommendations: this.performanceStats.acceptedRecommendations,
      rejectedRecommendations: this.performanceStats.rejectedRecommendations,
      overallAccuracy: total > 0 ? this.performanceStats.acceptedRecommendations / total : 0,
      averageConfidence: this.performanceStats.averageConfidence,
      currentThreshold: this.getAdaptiveThreshold(),
      skillCount: this.skillIndex.size
    };
  }

  /**
   * 导出学习数据
   */
  exportLearningData() {
    return {
      acceptedRecommendations: Object.fromEntries(this.learningData.acceptedRecommendations),
      rejectedRecommendations: Object.fromEntries(this.learningData.rejectedRecommendations),
      skillSuccessRates: Object.fromEntries(this.learningData.skillSuccessRates),
      keywordWeights: Object.fromEntries(this.learningData.keywordWeights),
      performanceStats: this.performanceStats
    };
  }

  /**
   * 导入学习数据
   */
  importLearningData(data) {
    if (data.acceptedRecommendations) {
      this.learningData.acceptedRecommendations = new Map(Object.entries(data.acceptedRecommendations));
    }
    if (data.rejectedRecommendations) {
      this.learningData.rejectedRecommendations = new Map(Object.entries(data.rejectedRecommendations));
    }
    if (data.skillSuccessRates) {
      this.learningData.skillSuccessRates = new Map(Object.entries(data.skillSuccessRates));
    }
    if (data.keywordWeights) {
      this.learningData.keywordWeights = new Map(Object.entries(data.keywordWeights));
    }
    if (data.performanceStats) {
      this.performanceStats = { ...this.performanceStats, ...data.performanceStats };
    }
  }

  /**
   * 提取上下文关键词
   */
  _extractContextKey(text) {
    const keywords = this._extractKeywords(text);
    return keywords.slice(0, 3).join('_');
  }
}

module.exports = { SkillDiscovery };

module.exports = { SkillDiscovery };
