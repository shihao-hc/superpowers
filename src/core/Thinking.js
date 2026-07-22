/**
 * Thinking - 独立思维模块
 *
 * 质疑、分析、观点、联想、系统性
 */

class Thinking {
  constructor() {
    // 思维角度定义
    this.angles = {
      technical: {
        name: '技术角度',
        focus: ['实现', '架构', '性能', '安全', '扩展性'],
        questions: [
          '技术上如何实现？',
          '有什么技术风险？',
          '性能如何？'
        ]
      },
      business: {
        name: '业务角度',
        focus: ['价值', '成本', '用户', '市场'],
        questions: [
          '解决了什么问题？',
          '用户真正需要吗？',
          '投入产出比如何？'
        ]
      },
      user: {
        name: '用户角度',
        focus: ['体验', '易用', '需求'],
        questions: [
          '用户会怎么用？',
          '学习成本高吗？',
          '用户反馈如何？'
        ]
      },
      risk: {
        name: '风险角度',
        focus: ['失败', '问题', '隐患'],
        questions: [
          '最坏情况是什么？',
          '有哪些潜在问题？',
          '如何避免失败？'
        ]
      },
      alternative: {
        name: '替代方案',
        focus: ['其他', '对比', '选择'],
        questions: [
          '有没有更好的方案？',
          '竞品怎么做的？',
          '不做的后果是什么？'
        ]
      }
    };

    // 思维关联库
    this.associations = new Map();

    // 思考历史
    this.history = [];
  }

  /**
   * 多角度分析
   */
  multiAngle(problem) {
    const results = {};
    const problemText = typeof problem === 'string'
      ? problem
      : (problem.description || JSON.stringify(problem));

    for (const [angleKey, angleDef] of Object.entries(this.angles)) {
      results[angleKey] = this.analyzeFromAngle(problemText, angleKey, angleDef);
    }

    return results;
  }

  /**
   * 从特定角度分析
   */
  analyzeFromAngle(problem, angleKey, angleDef) {
    const analysis = {
      angle: angleDef.name,
      keyPoints: [],
      conclusion: '',
      reasoning: ''
    };

    // 关键词匹配
    for (const keyword of angleDef.focus) {
      if (problem.toLowerCase().includes(keyword.toLowerCase())) {
        analysis.keyPoints.push(keyword);
      }
    }

    // 生成分析结论
    if (analysis.keyPoints.length > 0) {
      analysis.conclusion = `从${angleDef.name}看，关键点是: ${analysis.keyPoints.join(', ')}`;
      analysis.reasoning = `问题中包含 ${angleDef.focus.join(', ')} 相关内容`;
    } else {
      analysis.conclusion = `从${angleDef.name}看，需要进一步考虑 ${angleDef.focus.join('、')}`;
      analysis.reasoning = angleDef.questions[0];
    }

    return analysis;
  }

  /**
   * 质疑精神：对假设提问
   */
  question(assumption) {
    const analysis = {
      original: assumption,
      questions: [],
      alternatives: [],
      conclusions: []
    };

    // 生成质疑问题
    analysis.questions = [
      `为什么${assumption}？`,
      `${assumption}一定成立吗？`,
      '有没有反例？',
      '如果反过来会怎样？'
    ];

    // 寻找替代假设
    analysis.alternatives = [
      `不是${assumption}`,
      `部分${assumption}`,
      `${assumption}的反面`
    ];

    // 总结
    analysis.conclusions = [
      { type: 'challenge', text: `${assumption} 需要更多证据支持` },
      { type: 'suggestion', text: `考虑替代假设: ${analysis.alternatives[0]}` },
      { type: 'action', text: '建议收集更多反例和证据' }
    ];

    // 添加到历史
    this.history.push({
      type: 'question',
      assumption,
      timestamp: Date.now()
    });

    return analysis;
  }

  /**
   * 创造性联想
   */
  associate(concept, lessons = []) {
    const associations = {
      concept,
      related: [],
      analogies: [],
      patterns: []
    };

    // 从教训库中寻找相关模式
    if (lessons && lessons.length > 0) {
      associations.patterns = lessons
        .filter((l) => this.isRelated(l.lesson, concept) || this.isRelated(l.problem, concept))
        .slice(0, 3)
        .map((l) => ({
          lesson: l.lesson,
          improvement: l.improvement
        }));
    }

    // 常见联想模式
    const analogies = [
      { from: '庖丁解牛', to: '复杂问题分解', relevance: 0.9 },
      { from: '橘子剥皮', to: '从外到内分析', relevance: 0.8 },
      { from: '逆向工程', to: '从结果反推', relevance: 0.85 },
      { from: '组合创新', to: '现有方案组合', relevance: 0.75 }
    ];

    associations.analogies = analogies.filter((a) =>
      this.isRelated(a.from, concept) || this.isRelated(a.to, concept)
    );

    // 如果没有找到匹配，返回通用联想
    if (associations.analogies.length === 0) {
      associations.analogies = analogies.slice(0, 2);
    }

    // 记录联想
    if (!this.associations.has(concept)) {
      this.associations.set(concept, []);
    }
    this.associations.get(concept).push(...associations.analogies);

    return associations;
  }

  /**
   * 判断两个概念是否相关
   */
  isRelated(text1, text2) {
    if (!text1 || !text2) {return false;}

    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);

    return words1.some((w) => words2.some((w2) => w2.includes(w) || w.includes(w2)));
  }

  /**
   * 系统性思维：分析因果链
   */
  causalChain(problem) {
    const chain = {
      problem,
      causes: [],
      effects: [],
      feedback: [],
      leveragePoints: []
    };

    // 简单因果分析
    chain.causes = [
      { level: 1, cause: '直接原因', description: '导致问题的直接因素' },
      { level: 2, cause: '间接原因', description: '影响直接原因的因素' },
      { level: 3, cause: '根本原因', description: '最深层的原因' }
    ];

    chain.effects = [
      { level: 1, effect: '直接影响', description: '问题的直接后果' },
      { level: 2, effect: '间接影响', description: '后果的连锁反应' }
    ];

    // 寻找杠杆点
    chain.leveragePoints = [
      { point: '根本原因', impact: 'high', description: '解决根本原因，一劳永逸' },
      { point: '关键链条', impact: 'medium', description: '打断关键链条，控制问题' }
    ];

    return chain;
  }

  /**
   * 第一性原理思考
   */
  firstPrinciples(problem) {
    const analysis = {
      problem,
      assumptions: [],
      breakdown: [],
      reconstruction: []
    };

    // 分解假设
    analysis.assumptions = [
      '现有方案是唯一的吗？',
      '行业惯例一定正确吗？',
      '用户需求是固定的吗？'
    ];

    // 分解问题为基本元素
    analysis.breakdown = [
      '问题的核心是什么？',
      '可以分解为哪些子问题？',
      '每个子问题的基本要素是什么？'
    ];

    // 从零重建
    analysis.reconstruction = [
      '如果从零开始，我会怎么做？',
      '有没有全新的解决方式？',
      '如何组合基本要素形成新方案？'
    ];

    return analysis;
  }

  /**
   * 获取思考历史
   */
  getHistory(limit = 20) {
    return this.history.slice(-limit);
  }

  /**
   * 获取关联数据
   */
  getAssociations(concept) {
    return this.associations.get(concept) || [];
  }
}

module.exports = Thinking;
