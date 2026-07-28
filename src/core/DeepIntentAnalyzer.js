/**
 * DeepIntentAnalyzer - 深度意图分析器
 * 分析用户输入的意图，提供精准分类和建议
 */

class DeepIntentAnalyzer {
  constructor() {
    this._intentPatterns = this._buildIntentPatterns();
    this._contextStack = [];
    this._currentIntent = null;
    this._confidence = 0;
  }

  _buildIntentPatterns() {
    return {
      code: {
        keywords: ['代码', '写', '函数', '类', '模块', '实现', 'algorithm'],
        patterns: [
          { regex: /写.*(函数|方法|类)/i, intent: 'code_create' },
          { regex: /实现.*(算法|功能)/i, intent: 'code_implement' },
          { regex: /优化.*(代码|性能)/i, intent: 'code_optimize' }
        ]
      },
      learn: {
        keywords: ['学习', '研究', '分析', '理解', '掌握', '教程'],
        patterns: [
          { regex: /(如何|怎么|方法)/i, intent: 'learn_method' },
          { regex: /(原理|机制)/i, intent: 'learn_principle' }
        ]
      },
      task: {
        keywords: ['做', '完成', '处理', '执行', '任务'],
        patterns: [
          { regex: /帮我.*(做|完成)/i, intent: 'task_execute' },
          { regex: /处理.*(文件|数据)/i, intent: 'task_process' }
        ]
      },
      question: {
        keywords: ['什么', '为什么', '如何', '怎么', '?', '？'],
        patterns: [
          { regex: /是.*意思/i, intent: 'question_meaning' },
          { regex: /为什么/i, intent: 'question_why' }
        ]
      },
      debug: {
        keywords: ['bug', '错误', '异常', '崩溃', '调试', '修复', 'fix'],
        patterns: [
          { regex: /修复.*bug/i, intent: 'debug_fix' },
          { regex: /(为什么|原因).*错误/i, intent: 'debug_cause' }
        ]
      },
      security: {
        keywords: ['安全', '审计', '漏洞', '风险', 'scan'],
        patterns: [
          { regex: /安全.*审计/i, intent: 'security_audit' },
          { regex: /漏洞.*扫描/i, intent: 'security_scan' }
        ]
      },
      optimize: {
        keywords: ['优化', '性能', '速度', '提升', '改进'],
        patterns: [
          { regex: /性能.*优化/i, intent: 'optimize_performance' },
          { regex: /(加载|响应).*慢/i, intent: 'optimize_speed' }
        ]
      },
      create: {
        keywords: ['创建', '生成', '设计', '制作', '写'],
        patterns: [
          { regex: /创建.*(文件|项目)/i, intent: 'create_file' },
          { regex: /生成.*(代码|测试)/i, intent: 'create_code' }
        ]
      }
    };
  }

  analyze(input, context = {}) {
    if (!input) { return { intent: null, confidence: 0 }; }

    const lowerInput = input.toLowerCase();

    let bestMatch = this._matchPatterns(lowerInput);

    if (!bestMatch || bestMatch.confidence < 0.5) {
      bestMatch = this._keywordMatch(lowerInput);
    }

    if (bestMatch && context.lastIntent) {
      if (context.lastIntent === bestMatch.intent) {
        bestMatch.confidence = Math.min(0.95, bestMatch.confidence + 0.2);
      }
    }

    this._currentIntent = bestMatch?.intent || null;
    this._confidence = bestMatch?.confidence || 0;
    this._contextStack.push({ input, intent: this._currentIntent, timestamp: Date.now() });

    if (this._contextStack.length > 10) {
      this._contextStack.shift();
    }

    return {
      intent: this._currentIntent,
      confidence: this._confidence,
      method: bestMatch?.method || 'unknown',
      suggestions: this._getSuggestions(this._currentIntent)
    };
  }

  _matchPatterns(input) {
    let bestMatch = null;

    for (const [category, data] of Object.entries(this._intentPatterns)) {
      for (const pattern of data.patterns) {
        if (pattern.regex.test(input)) {
          bestMatch = {
            intent: pattern.intent,
            confidence: 0.8,
            method: 'pattern',
            category
          };
          break;
        }
      }
      if (bestMatch) { break; }
    }

    return bestMatch;
  }

  _keywordMatch(input) {
    let bestMatch = null;
    let bestScore = 0;

    for (const [category, data] of Object.entries(this._intentPatterns)) {
      let score = 0;
      for (const keyword of data.keywords) {
        if (input.includes(keyword)) {
          score += 1;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          intent: category,
          confidence: Math.min(0.7, score * 0.2),
          method: 'keyword',
          category
        };
      }
    }

    return bestMatch;
  }

  _getSuggestions(intent) {
    const skillMap = {
      code_create: ['TDD', 'test-generation'],
      code_implement: ['code-review'],
      code_optimize: ['performance-optimization'],
      learn_method: ['learning'],
      learn_principle: ['learning'],
      task_execute: ['workflow-engine'],
      task_process: ['automation'],
      question_meaning: ['search'],
      question_why: ['learning'],
      debug_fix: ['systematic-debugging'],
      debug_cause: ['systematic-debugging'],
      security_audit: ['security-audit'],
      security_scan: ['security-audit'],
      optimize_performance: ['performance-optimization'],
      optimize_speed: ['performance-optimization'],
      create_file: ['file-templates'],
      create_code: ['test-generation']
    };

    return skillMap[intent] || [];
  }

  getCurrentIntent() {
    return { intent: this._currentIntent, confidence: this._confidence };
  }

  getContextHistory() {
    return this._contextStack;
  }
}

module.exports = DeepIntentAnalyzer;
