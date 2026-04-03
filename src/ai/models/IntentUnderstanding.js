/**
 * Intent Understanding Engine
 * 意图理解与技能规划引擎
 * 将自然语言转换为技能调用
 */

const crypto = require('crypto');

class IntentUnderstanding {
  constructor() {
    this.intentPatterns = new Map();
    this.skillBindings = new Map();
    this.contextWindow = [];
    this.conversationHistory = new Map();
    
    this._initIntentPatterns();
    this._initSkillBindings();
  }

  _initIntentPatterns() {
    const patterns = [
      // 分析类
      {
        intent: 'analyze',
        patterns: ['分析', 'analyze', '诊断', '检查', '评估', 'review'],
        slots: ['target', 'scope'],
        priority: 1
      },
      // 生成类
      {
        intent: 'generate',
        patterns: ['生成', 'generate', '创建', '制作', 'produce', 'create'],
        slots: ['content_type', 'topic'],
        priority: 1
      },
      // 预测类
      {
        intent: 'predict',
        patterns: ['预测', 'predict', 'forecast', '预估', '展望'],
        slots: ['metric', 'timeframe'],
        priority: 2
      },
      // 优化类
      {
        intent: 'optimize',
        patterns: ['优化', 'optimize', '改进', '提升', 'improve'],
        slots: ['target', 'goal'],
        priority: 2
      },
      // 检索类
      {
        intent: 'search',
        patterns: ['搜索', 'search', '查找', '查询', 'find', 'lookup'],
        slots: ['query', 'source'],
        priority: 1
      },
      // 审核类
      {
        intent: 'audit',
        patterns: ['审核', 'audit', '审查', '合规', 'compliance', 'review'],
        slots: ['target', 'standard'],
        priority: 2
      },
      // 报告类
      {
        intent: 'report',
        patterns: ['报告', 'report', '报表', '总结', 'summarize', 'summary'],
        slots: ['period', 'format'],
        priority: 1
      },
      // 通知类
      {
        intent: 'notify',
        patterns: ['通知', 'notify', '发送', 'send', '提醒', 'alert'],
        slots: ['recipient', 'channel'],
        priority: 1
      }
    ];

    for (const p of patterns) {
      this.intentPatterns.set(p.intent, p);
    }
  }

  _initSkillBindings() {
    // 意图到技能的映射
    const bindings = {
      'analyze': {
        'image': ['medical-image-analysis', 'quality-control'],
        'document': ['contract-review', 'compliance-check'],
        'data': ['risk-assessment', 'learning-analytics'],
        'default': ['text-analyzer']
      },
      'generate': {
        'report': ['financial-report-gen', 'health-record-summary'],
        'document': ['document-drafting', 'legal-document-drafting'],
        'code': ['code-generator'],
        'content': ['text-generator'],
        'default': ['text-generator']
      },
      'predict': {
        'stock': ['stock-analysis', 'market-sentiment'],
        'maintenance': ['predictive-maintenance'],
        'demand': ['demand-forecast', 'inventory-forecast'],
        'churn': ['churn-prediction'],
        'default': ['predictive-model']
      },
      'optimize': {
        'portfolio': ['portfolio-opt'],
        'supply': ['supply-chain-optimization'],
        'process': ['process-optimization'],
        'inventory': ['inventory-optimization'],
        'default': ['optimizer']
      },
      'search': {
        'legal': ['legal-research'],
        'medical': ['medical-knowledge-search'],
        'default': ['web-search']
      },
      'audit': {
        'security': ['compliance-check'],
        'financial': ['audit-report'],
        'default': ['audit-tool']
      },
      'report': {
        'financial': ['financial-report-gen'],
        'health': ['health-record-summary'],
        'learning': ['learning-analytics'],
        'default': ['report-generator']
      },
      'notify': {
        'email': ['email-notification'],
        'slack': ['slack-notification'],
        'default': ['notification-service']
      }
    };

    for (const [intent, mappings] of Object.entries(bindings)) {
      this.skillBindings.set(intent, mappings);
    }
  }

  // 理解用户意图
  async understand(message, context = {}) {
    const { userId, history = [], attachments = [] } = context;

    // 1. 意图识别
    const intent = this._recognizeIntent(message);

    // 2. 槽位提取
    const slots = this._extractSlots(message, intent);

    // 3. 上下文补全
    const completedSlots = this._completeFromContext(slots, userId);

    // 4. 技能匹配
    const skills = this._matchSkills(intent, slots, attachments);

    // 5. 参数生成
    const parameters = this._generateParameters(intent, slots, skills);

    // 6. 技能链规划（如需要）
    const chain = await this._planSkillChain(intent, skills, parameters);

    // 保存对话历史
    this._saveHistory(userId, { intent, slots, skills, message });

    return {
      intent: intent.name,
      confidence: intent.confidence,
      slots: completedSlots,
      skills,
      parameters,
      chain,
      suggestion: this._generateSuggestion(intent, skills)
    };
  }

  _recognizeIntent(message) {
    const lowerMessage = message.toLowerCase();
    let bestMatch = { name: 'unknown', confidence: 0, priority: 99 };

    for (const [name, pattern] of this.intentPatterns.entries()) {
      for (const p of pattern.patterns) {
        if (lowerMessage.includes(p.toLowerCase())) {
          const confidence = this._calculateConfidence(lowerMessage, p);
          if (confidence > bestMatch.confidence || 
              (confidence === bestMatch.confidence && pattern.priority < bestMatch.priority)) {
            bestMatch = { name, confidence, priority: pattern.priority, pattern: p };
          }
        }
      }
    }

    return bestMatch;
  }

  _calculateConfidence(message, pattern) {
    const patternLen = pattern.length;
    const matchLen = message.split(pattern.toLowerCase())[0]?.length || 0;
    
    // 越靠前的匹配置信度越高
    const positionBonus = 1 - (matchLen / message.length) * 0.3;
    
    // 模式长度越长置信度越高
    const lengthBonus = Math.min(patternLen / 10, 0.3);
    
    return Math.min(0.5 + positionBonus + lengthBonus, 1);
  }

  _extractSlots(message, intent) {
    const slots = {};
    const pattern = intent.pattern || '';

    // 基于关键词提取槽位
    const slotExtractors = {
      'target': /分析|评估|检查|analyze|review|of|关于/gi,
      'scope': /范围|scope|包含|including|所有/gi,
      'content_type': /报告|报表|文档|pdf|excel|document|report/gi,
      'topic': /主题|topic|关于|关于.*的/gi,
      'metric': /指标|metric|数据|data|销售额|用户数/gi,
      'timeframe': /本周|月|季度|季度|year|month|week|最近/gi,
      'query': /搜索|查找|search|找/gi,
      'period': /周期|期间|period|从.*到|between/gi,
      'format': /格式|format|pdf|excel|json|html/gi
    };

    for (const [slotName, extractor] of Object.entries(slotExtractors)) {
      const matches = message.match(extractor);
      if (matches) {
        slots[slotName] = matches.map(m => m.trim()).filter(Boolean);
      }
    }

    // 从附件推断槽位
    if (message.includes('x光') || message.includes('x-ray') || message.includes('ct') || message.includes('mri')) {
      slots.target = slots.target || [];
      slots.target.push('medical_image');
    }

    if (message.includes('合同') || message.includes('contract')) {
      slots.content_type = slots.content_type || [];
      slots.content_type.push('contract');
    }

    return slots;
  }

  _completeFromContext(slots, userId) {
    const history = this.conversationHistory.get(userId) || [];
    const completed = { ...slots };

    // 从历史中补全缺失的槽位
    if (history.length > 0) {
      const lastInteraction = history[history.length - 1];
      
      if (!completed.period && lastInteraction.slots?.period) {
        completed.period = lastInteraction.slots.period;
        completed._fromContext = 'period';
      }
      if (!completed.format && lastInteraction.slots?.format) {
        completed.format = lastInteraction.slots.format;
        completed._fromContext = 'format';
      }
    }

    return completed;
  }

  _matchSkills(intent, slots, attachments) {
    const bindings = this.skillBindings.get(intent.name);
    if (!bindings) return [];

    const skills = [];

    // 基于槽位匹配
    for (const [key, skillList] of Object.entries(bindings)) {
      if (slots.target?.some(t => t.toLowerCase().includes(key)) ||
          slots.content_type?.some(c => c.toLowerCase().includes(key)) ||
          slots.topic?.some(t => t.toLowerCase().includes(key))) {
        skills.push(...skillList);
      }
    }

    // 基于附件类型匹配
    for (const attachment of attachments) {
      const type = attachment.type || 'default';
      if (bindings[type]) {
        skills.push(...bindings[type]);
      }
    }

    // 默认技能
    if (skills.length === 0 && bindings.default) {
      skills.push(...bindings.default);
    }

    // 去重
    return [...new Set(skills)];
  }

  _generateParameters(intent, slots, skills) {
    const parameters = {};

    // 根据意图类型生成参数
    switch (intent.name) {
      case 'analyze':
        parameters.target = slots.target?.[0] || 'document';
        parameters.scope = slots.scope?.[0] || 'full';
        parameters.depth = slots.target?.includes('详细') ? 'deep' : 'standard';
        break;

      case 'generate':
        parameters.format = slots.format?.[0] || slots.content_type?.[0] || 'pdf';
        parameters.template = slots.topic?.[0] || 'standard';
        parameters.includeCharts = true;
        break;

      case 'predict':
        parameters.timeframe = slots.timeframe?.[0] || 'next_week';
        parameters.confidenceLevel = 0.95;
        break;

      case 'report':
        parameters.period = slots.period?.[0] || 'current_week';
        parameters.format = slots.format?.[0] || 'pdf';
        parameters.includeSummary = true;
        break;

      default:
        parameters.rawInput = slots;
    }

    // 从技能要求推断参数
    if (skills.length > 0) {
      parameters.primarySkill = skills[0];
    }

    return parameters;
  }

  async _planSkillChain(intent, skills, parameters) {
    // 检查是否需要多步骤技能链
    const chainRules = {
      'analyze': {
        steps: ['data-collector', skills[0] || 'analyzer', 'report-generator'],
        condition: (p) => p.depth === 'deep'
      },
      'generate': {
        steps: [skills[0] || 'generator', 'formatter', 'exporter'],
        condition: (p) => p.format !== 'json'
      },
      'report': {
        steps: ['data-collector', skills[0] || 'analyzer', 'report-generator', 'notification-service'],
        condition: (p) => p.sendNotification
      },
      'predict': {
        steps: ['data-collector', 'predictor', 'visualizer', 'notifier'],
        condition: () => true
      }
    };

    const rule = chainRules[intent.name];
    if (rule && rule.condition(parameters)) {
      return {
        enabled: true,
        steps: rule.steps,
        estimatedTime: rule.steps.length * 30, // 每步30秒估算
        parallelizable: false
      };
    }

    return {
      enabled: false,
      steps: skills,
      estimatedTime: skills.length * 15
    };
  }

  _generateSuggestion(intent, skills) {
    const suggestions = {
      'analyze': '建议上传分析对象（如文档、图片、数据）以获得更准确的分析结果',
      'generate': '可以指定输出格式（PDF/Excel/HTML）和模板类型',
      'predict': '请提供历史数据和预测时间范围',
      'report': '可以指定报告周期和是否需要定时发送',
      'search': '可以使用自然语言描述搜索条件',
      'audit': '请确认审计标准和范围',
      'notify': '可以指定通知渠道（邮件/Slack/钉钉）'
    };

    const base = suggestions[intent.name] || '请提供更多详细信息';
    const skillInfo = skills.length > 0 
      ? `将使用: ${skills.slice(0, 2).join(', ')}` 
      : '';

    return [base, skillInfo].filter(Boolean).join('。');
  }

  _saveHistory(userId, data) {
    const history = this.conversationHistory.get(userId) || [];
    history.push({
      ...data,
      timestamp: Date.now()
    });

    // 保持最近10条
    if (history.length > 10) {
      history.shift();
    }

    this.conversationHistory.set(userId, history);
  }

  // 多模态理解
  async understandMultimodal(content, context = {}) {
    const { type, data, caption } = content;

    let intent = { name: 'unknown', confidence: 0 };
    let matchedSkills = [];
    let parameters = {};

    switch (type) {
      case 'image':
        const imageAnalysis = await this._analyzeImage(data);
        intent = imageAnalysis.intent;
        matchedSkills = imageAnalysis.skills;
        parameters = { imageData: data, ...imageAnalysis.details };
        break;

      case 'audio':
        const speechResult = await this._transcribeAndUnderstand(data);
        intent = speechResult.intent;
        matchedSkills = speechResult.skills;
        parameters = { transcript: speechResult.text, ...speechResult.parameters };
        break;

      case 'video':
        const videoAnalysis = await this._analyzeVideo(data);
        intent = videoAnalysis.intent;
        matchedSkills = videoAnalysis.skills;
        parameters = { videoFrames: videoAnalysis.frames, ...videoAnalysis.details };
        break;

      case 'document':
        const docResult = await this._understandDocument(data);
        intent = docResult.intent;
        matchedSkills = docResult.skills;
        parameters = { document: data, ...docResult.details };
        break;
    }

    // 合并caption信息
    if (caption) {
      const captionIntent = this._recognizeIntent(caption);
      if (captionIntent.confidence > intent.confidence) {
        intent = captionIntent;
      }
    }

    return {
      contentType: type,
      intent: intent.name,
      confidence: intent.confidence,
      skills: matchedSkills,
      parameters,
      summary: this._generateSummary(type, intent, matchedSkills)
    };
  }

  async _analyzeImage(imageData) {
    // 模拟图像分析
    const analysis = {
      xray: { intent: 'analyze', skills: ['medical-image-analysis'], details: { modality: 'x-ray' } },
      ct: { intent: 'analyze', skills: ['medical-image-analysis'], details: { modality: 'ct' } },
      mri: { intent: 'analyze', skills: ['medical-image-analysis'], details: { modality: 'mri' } },
      product: { intent: 'inspect', skills: ['quality-control'], details: { type: 'product' } },
      document: { intent: 'analyze', skills: ['ocr', 'document-classifier'], details: { type: 'document' } }
    };

    // 简化判断 - 实际应使用图像识别模型
    return analysis.document;
  }

  async _transcribeAndUnderstand(audioData) {
    // 模拟语音转文字和理解
    return {
      text: '分析本周销售数据并生成报告',
      intent: 'report',
      skills: ['sales-analyzer', 'report-generator'],
      parameters: { period: 'this_week', format: 'pdf' }
    };
  }

  async _analyzeVideo(videoData) {
    // 模拟视频分析
    return {
      frames: videoData.frames || 10,
      intent: 'analyze',
      skills: ['video-analyzer'],
      details: { duration: videoData.duration, scene: 'meeting' }
    };
  }

  async _understandDocument(docData) {
    // 模拟文档理解
    return {
      intent: 'analyze',
      skills: ['document-classifier', 'nlp-analyzer'],
      details: { type: docData.type || 'text', pages: docData.pages || 1 }
    };
  }

  _generateSummary(type, intent, skills) {
    const typeNames = {
      'image': '图片',
      'audio': '音频',
      'video': '视频',
      'document': '文档'
    };

    return `识别到${typeNames[type] || type}内容，意图: ${intent.name}，将使用: ${skills.join(', ')}`;
  }
}

class SkillChainExecutor {
  constructor() {
    this.chains = new Map();
    this.executionHistory = new Map();
  }

  // 创建技能链
  createChain(config) {
    const chain = {
      id: `chain_${crypto.randomBytes(8).toString('hex')}`,
      name: config.name,
      description: config.description,
      steps: config.steps.map((step, index) => ({
        id: `step_${index}`,
        skill: step.skill,
        action: step.action,
        parameters: step.parameters || {},
        dependsOn: step.dependsOn || [],
        timeout: step.timeout || 30000,
        retry: step.retry || 3,
        condition: step.condition
      })),
      parallel: config.parallel || false,
      onError: config.onError || 'stop',
      createdAt: Date.now(),
      status: 'draft'
    };

    this.chains.set(chain.id, chain);
    return chain;
  }

  // 执行技能链
  async execute(chainId, initialInput, context = {}) {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain not found: ${chainId}`);
    }

    const execution = {
      id: `exec_${crypto.randomBytes(8).toString('hex')}`,
      chainId,
      status: 'running',
      startTime: Date.now(),
      steps: [],
      input: initialInput,
      output: null,
      error: null
    };

    try {
      // 解析依赖关系，构建执行计划
      const executionPlan = this._buildExecutionPlan(chain.steps);

      // 执行步骤
      let currentOutput = initialInput;
      
      for (const stepGroup of executionPlan) {
        if (chain.parallel) {
          // 并行执行
          const results = await Promise.all(
            stepGroup.map(step => this._executeStep(step, currentOutput, context))
          );
          currentOutput = results;
        } else {
          // 串行执行
          for (const step of stepGroup) {
            const result = await this._executeStep(step, currentOutput, context);
            currentOutput = result.output;
            
            execution.steps.push({
              stepId: step.id,
              skill: step.skill,
              status: 'completed',
              duration: result.duration,
              output: result.output
            });

            // 检查条件
            if (step.condition && !this._evaluateCondition(step.condition, currentOutput)) {
              execution.steps[execution.steps.length - 1].status = 'skipped';
              execution.steps[execution.steps.length - 1].reason = 'Condition not met';
            }
          }
        }
      }

      execution.status = 'completed';
      execution.output = currentOutput;
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;

    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;
      execution.endTime = Date.now();
    }

    this._saveExecution(execution);
    return execution;
  }

  _buildExecutionPlan(steps) {
    const plan = [];
    const executed = new Set();
    
    // 简单的拓扑排序
    while (executed.size < steps.length) {
      const currentBatch = [];
      
      for (const step of steps) {
        if (executed.has(step.id)) continue;
        
        // 检查依赖是否都已执行
        const depsSatisfied = step.dependsOn.every(dep => executed.has(dep));
        
        if (depsSatisfied) {
          currentBatch.push(step);
        }
      }

      if (currentBatch.length === 0 && executed.size < steps.length) {
        throw new Error('Circular dependency detected');
      }

      plan.push(currentBatch);
      currentBatch.forEach(step => executed.add(step.id));
    }

    return plan;
  }

  async _executeStep(step, input, context) {
    const startTime = Date.now();
    let attempts = 0;
    let lastError;

    while (attempts < step.retry) {
      try {
        // 实际执行技能
        const output = await this._callSkill(step.skill, step.action, {
          ...step.parameters,
          input,
          context
        });

        return {
          output,
          duration: Date.now() - startTime,
          attempts: attempts + 1
        };
      } catch (error) {
        lastError = error;
        attempts++;
        
        if (attempts < step.retry) {
          await this._delay(1000 * attempts); // 指数退避
        }
      }
    }

    throw lastError;
  }

  async _callSkill(skill, action, params) {
    // 实际实现会调用技能执行器
    return {
      result: `Executed ${skill}:${action}`,
      data: params.input
    };
  }

  _evaluateCondition(condition, data) {
    if (typeof condition === 'function') {
      return condition(data);
    }
    
    if (typeof condition === 'string') {
      try {
        return this._safeEvaluate(condition, data);
      } catch {
        return false;
      }
    }

    return true;
  }

  _safeEvaluate(expression, data) {
    const allowedPattern = /^[\w\s.<>=!&|()]+$/;
    if (!allowedPattern.test(expression)) {
      return false;
    }

    const valueMap = new Map(Object.entries(data));
    
    const resolveValue = (token) => {
      if (valueMap.has(token)) {
        return valueMap.get(token);
      }
      if (token === 'true') return true;
      if (token === 'false') return false;
      if (token === 'null') return null;
      if (token === 'undefined') return undefined;
      const num = Number(token);
      if (!isNaN(num) && token.trim() !== '') return num;
      return token;
    };

    const tokens = expression.match(/(\w+|\d+\.?\d*|[<>=!&|()]+)/g) || [];
    
    let result = resolveValue(tokens[0]);
    for (let i = 1; i < tokens.length; i += 2) {
      const op = tokens[i];
      const nextVal = resolveValue(tokens[i + 1]);
      
      switch (op) {
        case '==': result = result == nextVal; break;
        case '===': result = result === nextVal; break;
        case '!=': result = result != nextVal; break;
        case '!==': result = result !== nextVal; break;
        case '>': result = result > nextVal; break;
        case '>=': result = result >= nextVal; break;
        case '<': result = result < nextVal; break;
        case '<=': result = result <= nextVal; break;
        case '&&': result = result && nextVal; break;
        case '||': result = result || nextVal; break;
        case '&': result = result & nextVal; break;
        case '|': result = result | nextVal; break;
        default: break;
      }
    }
    
    return !!result;
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _saveExecution(execution) {
    const history = this.executionHistory.get(execution.chainId) || [];
    history.push(execution);
    
    // 保持最近100条
    if (history.length > 100) {
      history.shift();
    }
    
    this.executionHistory.set(execution.chainId, history);
  }

  getExecutionHistory(chainId) {
    return this.executionHistory.get(chainId) || [];
  }
}

// 预定义技能链模板
const SKILL_CHAIN_TEMPLATES = {
  'stock-analysis-report': {
    name: '股票分析报告',
    description: '分析股票走势并生成报告',
    steps: [
      { skill: 'stock-analysis', action: 'analyze', dependsOn: [] },
      { skill: 'risk-assessment', action: 'assess', dependsOn: ['step_0'] },
      { skill: 'financial-report-gen', action: 'generate', dependsOn: ['step_1'] },
      { skill: 'email-notification', action: 'send', dependsOn: ['step_2'] }
    ]
  },
  'patient-workup': {
    name: '患者初诊工作流',
    description: '完整的患者初诊评估流程',
    steps: [
      { skill: 'symptom-checker', action: 'check', dependsOn: [] },
      { skill: 'medical-image-analysis', action: 'analyze', dependsOn: ['step_0'] },
      { skill: 'health-record-summary', action: 'generate', dependsOn: ['step_1'] }
    ]
  },
  'weekly-sales-report': {
    name: '周销售报告',
    description: '生成每周销售数据报告',
    steps: [
      { skill: 'data-collector', action: 'collect', dependsOn: [], parameters: { type: 'sales' } },
      { skill: 'demand-forecast', action: 'analyze', dependsOn: ['step_0'] },
      { skill: 'customer-segmentation', action: 'analyze', dependsOn: ['step_0'] },
      { skill: 'report-generator', action: 'generate', dependsOn: ['step_1', 'step_2'] }
    ],
    parallel: true
  }
};

module.exports = { IntentUnderstanding, SkillChainExecutor, SKILL_CHAIN_TEMPLATES };
