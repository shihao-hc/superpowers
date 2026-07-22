/**
 * ReverseThinking - 逆向思维模块 (增强版)
 *
 * 从结果反推原理/架构/流程
 * 庖丁解牛启示：以无厚入有间
 *
 * 增强特性：
 * - 五问法 (Five Whys)
 * - 预演分析 (Premortem)
 * - 成功解剖 (Postmortem)
 * - 领域知识映射
 * - 结构化逆向推理
 *
 * @version 1.0.0
 * @license MIT
  * @copyright 2026 AI Brain System
  */

class ReverseThinking {
  constructor() {
    this.history = [];

    // 增强：领域知识映射
    this.domainKnowledge = {
      // 代码开发领域
      code: {
        keywords: ['代码', '程序', 'bug', '函数', '模块', '接口', 'api', '性能'],
        causes: {
          '性能问题': ['算法复杂度高', '数据库查询慢', '内存泄漏', 'I/O阻塞', '网络延迟'],
          '可靠性问题': ['异常未处理', '边界条件未检查', '并发竞争', '超时未设置'],
          '安全问题': ['输入未验证', 'SQL注入', 'XSS', '权限漏洞', '敏感信息泄露'],
          '维护性问题': ['代码耦合', '重复代码', '命名不规范', '文档缺失']
        }
      },
      // 架构设计领域
      architecture: {
        keywords: ['架构', '设计', '微服务', '单体', '扩展', 'scalability'],
        causes: {
          '性能瓶颈': ['单点瓶颈', '同步阻塞', '数据库热点', '缓存失效'],
          '可用性问题': ['单点故障', '降级缺失', '超时未设置', '重试风暴'],
          '可扩展性差': ['紧耦合', '垂直扩展', '配置硬编码', '状态外置缺失']
        }
      },
      // 数据系统领域
      data: {
        keywords: ['数据', '存储', '数据库', '查询', 'sql', 'nosql'],
        causes: {
          '查询慢': ['缺索引', '全表扫描', 'JOIN过多', '数据量过大', '锁竞争'],
          '数据不一致': ['分布式事务', '缓存双写', '主从延迟', '并发更新'],
          '数据丢失': ['备份缺失', '灾备不足', '删除未确认', '版本冲突']
        }
      },
      // 业务运营领域
      business: {
        keywords: ['用户', '转化', '留存', '增长', '运营', 'kpi'],
        causes: {
          '转化率低': ['入口埋点问题', '用户体验差', '价值主张不清', '信任度不足'],
          '留存率低': ['产品体验差', '核心价值未达成', '竞品替代', '用户预期偏差'],
          '用户流失': ['竞品吸引', '价格因素', '服务问题', '需求变化']
        }
      }
    };

    // 逆向分析模板
    this.templates = {
      problem: {
        question: '最终目标是什么？',
        reverse: '如果目标达成了，会是什么样子？',
        steps: '为了达到这个结果，需要哪些前置条件？'
      },
      solution: {
        question: '这个方案能解决什么问题？',
        reverse: '如果不解决会怎样？',
        steps: '解决这个问题需要什么代价？'
      },
      observation: {
        question: '我观察到了什么？',
        reverse: '这个现象背后可能的原因是什么？',
        steps: '如何验证这个原因？'
      }
    };
  }

  /**
   * 增强：从结果反推
   */
  fromResult(currentState, goal) {
    const analysis = {
      target: goal,
      current: currentState,
      gap: this.calculateGap(currentState, goal),
      reverseSteps: [],
      insights: [],
      fiveWhys: [],
      premortem: null,
      milestones: []
    };

    // 庖丁解牛式分解
    analysis.reverseSteps = this.reverseSteps(goal);

    // 五问法
    analysis.fiveWhys = this.fiveWhys(goal);

    // 预演分析
    analysis.premortem = this.premortem(goal);

    // 里程碑
    analysis.milestones = this.identifyMilestones(goal);

    // 洞察
    analysis.insights = [
      { type: 'key', text: `目标: ${goal}` },
      { type: 'gap', text: `差距: ${analysis.gap.description}` },
      { type: 'first', text: `第一步: ${analysis.reverseSteps[0] || '需要更多信息'}` },
      { type: 'why', text: `追问: ${analysis.fiveWhys[0] || '无'}` }
    ];

    this.history.push({
      type: 'fromResult',
      current: currentState,
      goal,
      timestamp: Date.now()
    });

    return analysis;
  }

  /**
   * 五问法 - 连续追问5个为什么
   */
  fiveWhys(problem) {
    const whys = [
      '为什么会出现这个问题？',
      '为什么会这样？',
      '为什么这是关键的？',
      '为什么需要解决这个问题？',
      '为什么这是最佳方案？'
    ];

    const answers = [];

    // 基于领域知识推断答案
    const domainAnswer = this.getDomainCause(problem);

    for (let i = 0; i < whys.length; i++) {
      const isDomainMatch = i < domainAnswer.length;
      answers.push({
        question: whys[i],
        answer: isDomainMatch ? domainAnswer[i] : null,
        depth: i + 1
      });
    }

    return answers;
  }

  /**
   * 预演分析 - 假设失败了，分析原因
   */
  premortem(goal) {
    return {
      scenario: `假设 '${goal}' 失败了，原因可能是：`,
      potentialFailures: [
        { reason: '资源不足', probability: 'medium', mitigation: '提前评估资源需求' },
        { reason: '技术难度超出预期', probability: 'medium', mitigation: '原型验证技术可行性' },
        { reason: '需求变更', probability: 'high', mitigation: '敏捷迭代，频繁验证' },
        { reason: '团队能力不足', probability: 'low', mitigation: '培训或引入专家' },
        { reason: '外部依赖问题', probability: 'medium', mitigation: '识别关键依赖' }
      ],
      mitigation: this.suggestMitigations(goal),
      insight: '提前想清楚失败原因，防患于未然'
    };
  }

  /**
   * 识别关键里程碑
   */
  identifyMilestones(goal) {
    const milestones = [
      { name: '启动阶段', check: '目标和范围是否清晰？' },
      { name: '验证阶段', check: '核心假设是否验证？' },
      { name: '实施阶段', check: '进度和质量问题？' },
      { name: '交付阶段', check: '用户是否满意？' },
      { name: '复盘阶段', check: '学到了什么？' }
    ];

    return milestones.map((m) => ({
      ...m,
      ready: this.assessMilestone(goal, m.name)
    }));
  }

  /**
   * 评估里程碑准备度
   */
  assessMilestone(goal, milestone) {
    const readiness = {
      '启动阶段': 'goal' in { goal },
      '验证阶段': true,
      '实施阶段': true,
      '交付阶段': true,
      '复盘阶段': true
    };

    return readiness[milestone] || false;
  }

  /**
   * 增强：分析问题（逆向）
   */
  analyze(problem) {
    const problemText = typeof problem === 'string'
      ? problem
      : (problem.description || JSON.stringify(problem));

    const analysis = {
      problem: problemText,
      fiveWhys: this.fiveWhys(problemText),
      causes: this.findCauses(problemText),
      alternatives: this.findAlternatives(problemText),
      premortem: this.premortem(problemText),
      successAnalysis: this.successAnalysis(problemText),
      conclusion: '',
      recommendations: []
    };

    // 生成结构化结论
    analysis.conclusion = this.generateConclusion(analysis);

    // 生成建议
    analysis.recommendations = this.generateRecommendations(analysis);

    return analysis;
  }

  /**
   * 成功分析 - 假设成功了，分析为什么
   */
  successAnalysis(problem) {
    return {
      scenario: `假设 '${problem}' 成功了，可能是因为：`,
      successFactors: [
        { factor: '找准了核心问题', weight: 'high' },
        { factor: '方案切实可行', weight: 'high' },
        { factor: '执行到位', weight: 'medium' },
        { factor: '资源充足', weight: 'medium' },
        { factor: '时机合适', weight: 'low' }
      ],
      keyLearnings: [
        '成功不是偶然，是系统和努力的产物',
        '复制成功需要理解成功的真正原因'
      ]
    };
  }

  /**
   * 生成结论
   */
  generateConclusion(analysis) {
    const parts = [];

    // 五问法总结
    const rootCause = analysis.fiveWhys.find((w) => w.answer !== null);
    if (rootCause) {
      parts.push(`根本原因: ${rootCause.answer}`);
    }

    // 原因总结
    if (analysis.causes.length > 0) {
      parts.push(`可能原因: ${analysis.causes.slice(0, 3).join(', ')}`);
    }

    // 替代方案
    if (analysis.alternatives.length > 0) {
      parts.push(`替代思路: ${analysis.alternatives[0].text}`);
    }

    return parts.length > 0 ? parts.join(' | ') : '需要更多信息';
  }

  /**
   * 生成建议
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    // 基于五问法
    const rootCause = analysis.fiveWhys.find((w) => w.answer !== null);
    if (rootCause) {
      recommendations.push({
        type: 'fix',
        text: `针对根本原因 "${rootCause.answer}" 制定解决方案`
      });
    }

    // 基于预演分析
    if (analysis.premortem?.mitigation) {
      recommendations.push({
        type: 'prevent',
        text: `预防失败: ${analysis.premortem.mitigation[0]}`
      });
    }

    // 基于成功分析
    recommendations.push({
      type: 'inspire',
      text: '参考成功因素的优先级配置资源'
    });

    return recommendations;
  }

  /**
   * 获取领域原因
   */
  getDomainCause(text) {
    const lower = text.toLowerCase();

    // 匹配领域
    for (const [_domain, config] of Object.entries(this.domainKnowledge)) {
      const matches = config.keywords.filter((k) => lower.includes(k));
      if (matches.length > 0) {
        const causes = [];
        for (const [problem, reasons] of Object.entries(config.causes)) {
          if (lower.includes(problem) || matches.some((m) => lower.includes(m))) {
            causes.push(...reasons);
          }
        }
        return causes.slice(0, 5);
      }
    }

    return [
      '需求理解不准确',
      '方案设计有缺陷',
      '执行过程有偏差',
      '验证不充分',
      '资源分配不当'
    ];
  }

  /**
   * 增强：逆向推理
   */
  reverseInfer(observation) {
    const causes = this.findCauses(observation);
    const deepCauses = this.deepSearchCauses(observation);

    return {
      observation,
      causes,
      deepCauses,
      conclusion: causes.length > 0
        ? `可能原因: ${causes.join(', ')}`
        : '需要更多信息来确定原因',
      reasoning: '基于观察到的现象，从结果反推可能的原因',
      verification: this.suggestVerification(causes)
    };
  }

  /**
   * 深度搜索原因
   */
  deepSearchCauses(observation) {
    const deepCauses = [];
    const causes = this.findCauses(observation);

    // 对每个原因继续追问
    for (const cause of causes.slice(0, 2)) {
      const subCauses = this.getDomainCause(cause);
      if (subCauses.length > 0) {
        deepCauses.push({
          cause,
          subCauses: subCauses.slice(0, 3)
        });
      }
    }

    return deepCauses;
  }

  /**
   * 建议验证方法
   */
  suggestVerification(causes) {
    return causes.map((cause) => {
      if (cause.includes('性能')) {return `${cause}: 通过性能测试验证`;}
      if (cause.includes('数据')) {return `${cause}: 通过数据对比验证`;}
      if (cause.includes('安全')) {return `${cause}: 通过安全扫描验证`;}
      return `${cause}: 通过代码审查验证`;
    });
  }

  /**
   * 增强：寻找可能的原因
   */
  findCauses(observation) {
    const causes = [];
    const obsLower = observation.toLowerCase();

    // 常见问题-原因映射（扩展版）
    const causeMap = [
      // 性能类
      { keywords: ['慢', '延迟', '卡顿', '卡', '延迟', '性能'],
        causes: ['性能问题', '资源不足', '网络延迟', '算法复杂度高', '数据库查询慢'] },
      // 错误类
      { keywords: ['错', '错误', '失败', 'bug', '异常'],
        causes: ['逻辑错误', '数据问题', '配置错误', '异常未捕获', '边界条件'] },
      // 空值类
      { keywords: ['空', '没有', '缺失', 'null', 'undefined', 'none'],
        causes: ['数据未加载', '查询条件错误', '权限问题', '初始化遗漏'] },
      // 崩溃类
      { keywords: ['崩', '崩溃', 'crash', '宕机'],
        causes: ['内存泄漏', '异常未捕获', '资源耗尽', '死循环', '栈溢出'] },
      // 安全类
      { keywords: ['安全', '漏洞', '注入', 'xss', 'csrf'],
        causes: ['输入未验证', 'SQL注入', 'XSS攻击', '权限漏洞', '敏感信息泄露'] },
      // 架构类
      { keywords: ['扩展', 'scalability', '瓶颈', '耦合'],
        causes: ['单点瓶颈', '紧耦合', '垂直扩展限制', '状态管理问题'] },
      // 数据类
      { keywords: ['数据', '一致', '同步', '延迟'],
        causes: ['缓存不一致', '主从延迟', '分布式事务', '并发更新冲突'] }
    ];

    for (const { keywords, causes: possibleCauses } of causeMap) {
      if (keywords.some((k) => obsLower.includes(k))) {
        causes.push(...possibleCauses);
      }
    }

    // 补充领域知识
    const domainCauses = this.getDomainCause(observation);
    causes.push(...domainCauses);

    return [...new Set(causes)]; // 去重
  }

  /**
   * 建议缓解措施
   */
  suggestMitigations(_goal) {
    return [
      '制定详细的实施计划',
      '设置关键检查点',
      '准备应急预案',
      '定期回顾和调整'
    ];
  }

  /**
   * 反推步骤
   */
  reverseSteps(goal) {
    const steps = [];

    // 庖丁解牛式分解
    steps.push(`明确最终状态: ${goal}`);
    steps.push('识别关键里程碑和检查点');
    steps.push('找到第一个需要解决的问题');
    steps.push('确定需要的资源和能力');
    steps.push('从当前状态出发');

    return steps;
  }

  /**
   * 计算差距
   */
  calculateGap(current, target) {
    if (!current || !target) {
      return { description: '无法计算差距', severity: 'unknown' };
    }

    const gap = {
      description: `从 ${current} 到 ${target}`,
      severity: 'medium',
      estimated: '需要更多上下文',
      metrics: {}
    };

    if (typeof current === 'number' && typeof target === 'number') {
      const diff = target - current;
      gap.description = `差距: ${Math.abs(diff)}`;
      gap.severity = Math.abs(diff) > 100 ? 'high' : 'medium';
      gap.metrics.diff = diff;
      gap.metrics.percentage = `${(diff / current * 100).toFixed(2)}%`;
    }

    return gap;
  }

  /**
   * 寻找替代方案
   */
  findAlternatives(_problem) {
    return [
      { type: 'avoid', text: '不解决这个问题可以吗？也许问题本身不是关键' },
      { type: 'simplify', text: '有没有更简单的解决方案？不要过度工程' },
      { type: 'reverse', text: '把问题变成机会怎么样？换个角度看问题' },
      { type: 'delay', text: '一定要现在解决吗？也许可以稍后处理' },
      { type: 'delegate', text: '一定要自己解决吗？也许可以外包或求助' }
    ];
  }

  /**
   * 橘子练习（增强版）
   */
  orangePractice(observation) {
    return {
      observation,
      traditional: '直接尝试解决',
      reverse: this.orangeReverseAnalyze(observation),
      insight: '通过间接观察推断本质，不走弯路'
    };
  }

  /**
   * 橘子逆向分析（增强版）
   */
  orangeReverseAnalyze(_observation) {
    const external = {
      '颜色': '通过颜色判断成熟度/状态',
      '重量': '掂重量判断水分/复杂度',
      '气味': '闻气味判断新鲜度/问题类型',
      '触感': '按压判断软硬/紧急程度'
    };

    return {
      method: '庖丁解牛法',
      approach: '以无厚入有间',
      steps: Object.entries(external).map(([feature, meaning]) =>
        `观察${feature} → ${meaning}`
      ),
      conclusion: '不直接尝，也能判断橘子甜酸 - 间接方法有时更有效'
    };
  }

  /**
   * 问题分解反推（增强版）
   */
  decomposeReverse(problem) {
    const subProblems = this.decompose(problem);
    const rootCause = this.fiveWhys(problem);

    return subProblems.map((sp, i) => ({
      problem: sp,
      solutions: this.findSolutions(sp),
      reversePriority: this.prioritize(sp, i),
      relatedWhy: rootCause[i]?.answer || null
    }));
  }

  /**
   * 分解问题
   */
  decompose(_problem) {
    return [
      '核心问题是什么？（本质）',
      '相关问题有哪些？（关联）',
      '哪些是表象，哪些是本质？（区分）',
      '问题的边界在哪里？（范围）'
    ];
  }

  /**
   * 寻找解决方案
   */
  findSolutions(_subProblem) {
    return [
      { type: 'direct', text: '直接解决 - 正面攻克问题' },
      { type: 'indirect', text: '绕过解决 - 绕过障碍达到目标' },
      { type: 'accept', text: '接受问题 - 有时候问题是可接受的' },
      { type: 'transform', text: '转化问题 - 把问题变成机会' }
    ];
  }

  /**
   * 优先级排序（增强版）
   */
  prioritize(problem, index) {
    const priorities = ['high', 'high', 'medium', 'medium'];
    return {
      urgency: priorities[index] || 'medium',
      importance: index === 0 ? 'high' : 'medium',
      recommendation: index === 0 ? '优先解决核心问题' : '后续跟进'
    };
  }

  /**
   * 获取历史
   */
  getHistory(limit = 10) {
    return this.history.slice(-limit);
  }
}

module.exports = ReverseThinking;
