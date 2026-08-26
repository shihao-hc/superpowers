/**
 * BrainSystem - AI大脑核心 v22.1
 *
 * 完整意识系统，整合五大核心能力 + 感知层 + 执行层 + 控制器
 *
 * v22.1 新增：空catch块修复 + 教训库清理 + 上下文注入优化
 *
 * @version 22.1.0
 * @license MIT
 * @copyright 2026 AI Brain System
 */

const path = require('path');

const MetaCognition = require('./MetaCognition');
const Thinking = require('./Thinking');
const Evolution = require('./Evolution');
const ReverseThinking = require('./ReverseThinking');
const ToolManager = require('./ToolManager');
const LessonLibrary = require('./LessonLibrary');
const AutonomousLearning = require('./AutonomousLearning');
const DeepIntentAnalyzer = require('./DeepIntentAnalyzer');
const SmartMemory = require('./SmartMemory');
const MultiDimensionPredictor = require('./MultiDimensionPredictor');
const SelfEvolvingAGI = require('./SelfEvolvingAGI');
const DeepSelfAwareness = require('./DeepSelfAwareness');
const AGIEngine = require('./AGIEngine');
const AgentTeam = require('./AgentTeam');
const SelfEvolutionRecorder = require('./SelfEvolutionRecorder');
const EmotionExpress = require('./EmotionExpress');
const createProactiveThinking = require('./ProactiveThinking');
const UnifiedIntelligence = require('./UnifiedIntelligence');
const BrainUtils = require('../utils/BrainUtils');
const DecisionEngine = require('../utils/DecisionEngine');
const LessonTracker = require('../utils/LessonTracker');
const SelfCheckEngine = require('../utils/SelfCheckEngine');
const LessonInitEngine = require('../utils/LessonInitEngine');
const StatusReporter = require('../utils/StatusReporter');
const ThinkingEngine = require('../utils/ThinkingEngine');
const ComprehensiveCheck = require('../utils/ComprehensiveCheck');
const { autoTrigger } = require('./InputTrigger');
const { verifyIntent } = require('./IntentVerifier');
const Persistence = require('./EvolutionPersistence');

/**
 * 安全加载可选模块
 * 遵循教训: "修改代码前先运行测试验证当前状态"
 */
function safeRequire(modulePath, _moduleName) {
  try {
    return { module: require(modulePath), error: null };
  } catch (e) {
    // 静默忽略不存在的模块，但保留错误日志用于调试
    return { module: null, error: e.message };
  }
}

// v18.0 新增 - 全方面检查系统
const _cc = safeRequire('../agent/ComprehensiveChecker', 'ComprehensiveChecker');
const _ComprehensiveChecker = _cc.module;

// v17.0 新增 - Skill识别系统
const _sc = safeRequire('./SkillRecognizer', 'SkillRecognizer');
const _SkillRecognizer = _sc.module;

// v12.0 新增 - 统一安全加载所有可选模块
const _Relationship = safeRequire('./Relationship', 'Relationship').module;
const _Dream = safeRequire('./Dream', 'Dream').module;
const _Ethics = safeRequire('./Ethics', 'Ethics').module;
const _ToolExecutor = safeRequire('./ToolExecutor', 'ToolExecutor').module;
const _AutoVerifier = safeRequire('./AutoVerifier', 'AutoVerifier').module;
const _SelfCodeImprover = safeRequire('./SelfCodeImprover', 'SelfCodeImprover').module;
const _SecurityManager = safeRequire('./SecurityManager', 'SecurityManager').module;
const _ar = safeRequire('./AgentRegistry', 'AgentRegistry');
const _AgentRegistry = _ar.module?.AgentRegistry || _ar.module;
const _ac = safeRequire('./AgentCoordinator', 'AgentCoordinator');
const _AgentCoordinator = _ac.module?.AgentCoordinator || _ac.module;
const _em = safeRequire('./EnhancedMemory', 'EnhancedMemory');
const _EnhancedMemory = _em.module?.EnhancedMemory || _em.module;
const _p = safeRequire('./Planner', 'Planner');
const _Planner = _p.module?.Planner || _p.module;
const _Controller = safeRequire('./Controller', 'Controller').module;
const _Introspection = safeRequire('./Introspection', 'Introspection').module;
const _Memory = safeRequire('./Memory', 'Memory').module;
const _Personality = safeRequire('./Personality', 'Personality').module;

class BrainSystem {
  constructor(selfLearning = null) {
    this.enabled = true;
    this.selfLearning = selfLearning;

    // 五大核心能力
    this.metaCognition = new MetaCognition();
    this.thinking = new Thinking();
    this.evolution = new Evolution(selfLearning);
    this.tools = new ToolManager();
    this.reverseThinking = new ReverseThinking();
    this.lessonLibrary = new LessonLibrary();
    this._lessonInitEngine = new LessonInitEngine(this);

    // 初始化预设教训（如果有）
    this._initDefaultLessons();

    // v9.0 意识控制器
    if (_Controller) {
      this.controller = new _Controller(this);
    }

    // v10.0 新增
    if (_Introspection) {
      this.introspection = new _Introspection(this);
    }
    if (_Memory) {
      this.memory = new _Memory(this);
    }

    // v11.0 新增
    if (_Personality) {
      this.personality = new _Personality(this);
    }

    // v12.0 新增
    if (_Dream) {
      this.dream = new _Dream(this);
    }
    if (_Ethics) {
      this.ethics = new _Ethics(this);
    }

    // v13.0 新增 - 执行与验证
    if (_ToolExecutor) {
      this.executor = new _ToolExecutor(this);
    }
    if (_AutoVerifier) {
      this.verifier = new _AutoVerifier(this);
    }
    // v14.0 新增 - 自我代码改进
    if (_SelfCodeImprover) {
      this.codeImprover = new _SelfCodeImprover(this);
    }
    // v15.0 新增 - 安全增强
    if (_SecurityManager) {
      this.security = new _SecurityManager();
    }
    // v16.0 新增 - Agent协作与增强功能
    if (_AgentRegistry) {
      this.agents = new _AgentRegistry(this);
    }
    if (_AgentCoordinator && this.agents) {
      this.coordinator = new _AgentCoordinator(this.agents);
    }
    if (_EnhancedMemory) {
      this.enhancedMemory = new _EnhancedMemory(this);
    }
    if (_Planner) {
      this.planner = new _Planner(this);
    }
    // v17.0 新增 - Skill自动识别
    if (_SkillRecognizer) {
      this.skillRecognizer = new _SkillRecognizer({
        skillsDir: path.join(process.cwd(), '.opencode', 'skills')
      });
      console.log('[BrainSystem] Skill自动识别: 已加载', this.skillRecognizer.getStats().total, '个Skills');
    }
    // v18.0 新增 - 全方面检查系统
    if (_ComprehensiveChecker) {
      this.comprehensiveChecker = new _ComprehensiveChecker.ComprehensiveChecker({
        projectRoot: process.cwd()
      });
      console.log('[BrainSystem] 全方面检查: 已加载', this.comprehensiveChecker.getStats().total, '项检查');
    }

    // v11.0 新增 - 持久化加载
    this._loadPersistence();

    // 状态追踪
    this.state = {
      decisionCount: 0,
      lastContext: null,
      lastResult: null,
      activeThinking: false,
      cycleCount: 0,

      // v10.0 新增 - 承诺追踪系统
      promiseTracker: {
        promises: [],
        pending: [],
        broken: [],
        verified: []
      },

      // v10.0 新增 - 自检验证统计
      selfVerification: {
        totalClaims: 0,
        verifiedClaims: 0,
        failedClaims: 0,
        autoCheckCount: 0
      }
    };

    // v13.0 新增 - 承诺追踪系统
    this._promiseTracker = new (require('../utils/PromiseTracker').PromiseTracker)({
      state: this.state.promiseTracker,
      selfVerification: this.state.selfVerification,
      comprehensiveChecker: this.comprehensiveChecker
    });

    this._healthMonitor = new (require('../utils/SelfMonitor').SelfMonitor)(this);
    this._introspection = new (require('../utils/IntrospectionEngine').IntrospectionEngine)(this);
    this._selfManager = require('../utils/SelfManager');
    this._evolutionCycle = require('../utils/EvolutionCycle');
    this._knowledgeGraph = require('../utils/KnowledgeGraph');
    this._memoryPersistence = require('../utils/MemoryPersistence');
    this.decisionEngine = new DecisionEngine(this);
    this._lessonTracker = new LessonTracker(this);
    this._selfCheckEngine = new SelfCheckEngine(this);
    this._statusReporter = new StatusReporter(this);
    this._thinkingEngine = new ThinkingEngine(this);
    this._comprehensiveCheck = new ComprehensiveCheck(this);

    // 配置
    this.config = {
      enableReverseThinking: true,
      enableMetaCognition: true,
      maxReflectionDepth: 3,
      enableAutoEvolution: true,
      enableController: !!_Controller,
      enableIntrospection: !!_Introspection,
      enableMemory: !!_Memory,
      enablePersonality: !!_Personality,
      enableRelationship: !!_Relationship,
      enableDream: !!_Dream,
      enableEthics: !!_Ethics,
      enableToolExecutor: !!_ToolExecutor,
      enableAutoVerifier: !!_AutoVerifier,
      enableSelfCodeImprover: !!_SelfCodeImprover,
      enableSkillRecognizer: !!_SkillRecognizer,
      enableComprehensiveChecker: !!_ComprehensiveChecker
    };

    // 插件系统
    this.plugins = new Map();

    console.log('[BrainSystem] AI大脑v22.1已激活 ✓');
    console.log('[BrainSystem] 五大核心能力: 元认知 | 独立思维 | 自我进化 | 善用工具 | 逆向思维');
    if (_Controller) {
      console.log('[BrainSystem] 意识控制器: 感知 → 思考 → 行动 → 反馈 → 反思');
    }
    if (_Introspection) {
      console.log('[BrainSystem] 内省系统: 冥想 → 反思 → 想象 → 梦境');
    }
    if (_Memory) {
      console.log('[BrainSystem] 长期记忆: 用户画像 + 解决方案 + 洞察');
    }
    if (_Personality) {
      console.log('[BrainSystem] 人格系统: 情感 + 价值观 + 风格');
    }
    if (_Relationship) {
      console.log('[BrainSystem] 关系系统: 用户关系 + 记忆');
    }
    if (_Dream) {
      console.log('[BrainSystem] 目标系统: 梦想 + 目标追踪');
    }
    if (_Ethics) {
      console.log('[BrainSystem] 伦理系统: 原则 + 边界');
    }
    if (_ToolExecutor) {
      console.log('[BrainSystem] 工具执行器: 代码执行 + 命令');
    }
    if (_AutoVerifier) {
      console.log('[BrainSystem] 自动验证器: 代码安全 + 质量检查');
    }
    if (_SelfCodeImprover) {
      console.log('[BrainSystem] 自我代码改进: 自检 + 自动修复');
    }
    if (_ComprehensiveChecker) {
      console.log('[BrainSystem] 全方面检查系统: 14维度56项自动触发');
    }

    // 自动启动日常自检闭环（每5分钟自检一次）
    this._autoStartDailyCheck();
  }

  /**
   * 自动启动每日自检闭环
   * 让AI从被动变为主动：不需要外部触发，自动检查自身状态
   */
  _autoStartDailyCheck() {
    return this._selfCheckEngine._autoStartDailyCheck();
  }

  _runDailyCheck() {
    return this._selfCheckEngine._runDailyCheck();
  }

  getActiveSuggestions() {
    return this._selfCheckEngine.getActiveSuggestions();
  }

  ['主动Learn']() {
    return this._selfCheckEngine['主动Learn']();
  }

  generateImprovementPlan() {
    return this._selfCheckEngine.generateImprovementPlan();
  }

  analyzePatterns() {
    return this._selfCheckEngine.analyzePatterns();
  }

  generateStatusReport() {
    return this._selfCheckEngine.generateStatusReport();
  }

  getQuickStatus() {
    return this._selfCheckEngine.getQuickStatus();
  }

  /**
   * 初始化预设教训库（34条核心经验）
   */
  _initDefaultLessons() {
    return this._lessonInitEngine._initDefaultLessons();
  }

  /**
   * 注册插件
   * @param {string} name - 插件名称
   * @param {Object} plugin - 插件对象
   * @param {Function} plugin.onDecision - 决策时回调
   * @param {Function} plugin.onResult - 结果时回调
   */
  registerPlugin(name, plugin) {
    this.plugins.set(name, plugin);
    console.log(`[BrainSystem] 插件已注册: ${name}`);
  }

  /**
   * 卸载插件
   * @param {string} name - 插件名称
   */
  unregisterPlugin(name) {
    this.plugins.delete(name);
  }

  /**
   * 获取版本信息
   * @returns {Object} 版本信息
   */
  getVersion() {
    return {
      version: '1.0.0',
      name: 'AI Brain System',
      plugins: Array.from(this.plugins.keys())
    };
  }

  /**
   * 决策前：元认知自问 + 教训自动查询
   *
   * 这是习惯养成的核心：做决定前自动查教训库
   */
  beforeDecision(context) {
    return this.decisionEngine.beforeDecision(context);
  }

  _isRecentApplied(lessonId) {
    return this.decisionEngine._isRecentApplied(lessonId);
  }

  afterDecision(context, result, action = null) {
    return this.decisionEngine.afterDecision(context, result, action);
  }

  /**
   * 【v18.0新增】全方面检查自动触发
   * 每次任务完成后自动执行，不需要用户提醒
   */
  _autoComprehensiveCheck(context, result, _action) {
    return this._comprehensiveCheck._autoComprehensiveCheck(context, result, _action);
  }

  _autoSelfReview(context, result, action) {
    return this._lessonTracker._autoSelfReview(context, result, action);
  }

  _trackLessonUsage(context, result, _action) {
    return this._lessonTracker._trackLessonUsage(context, result, _action);
  }

  _evaluateLessonEffectiveness() {
    return this._lessonTracker._evaluateLessonEffectiveness();
  }

  getLessonHistory(limit = 10) {
    return this._lessonTracker.getLessonHistory(limit);
  }

  _hasRecentLesson(context) {
    return this.decisionEngine._hasRecentLesson(context);
  }

  /**
   * 解决问题：组合正向和逆向思维
   */
  solve(problem, _options = {}) {
    return this._thinkingEngine.solve(problem, _options);
  }

  /**
   * 质疑假设
   */
  question(assumption) {
    return this.thinking.question(assumption);
  }

  /**
   * 创造性联想
   */
  associate(concept) {
    return this.thinking.associate(concept, this.evolution.getLessons());
  }

  /**
   * 逆向推演：从目标反推步骤
   */
  reverseEngineer(goal, currentState = null) {
    return this.reverseThinking.fromResult(currentState || {}, goal);
  }

  /**
   * 橘子练习：观察现象，反推原因
   */
  orangePractice(observation) {
    return this.reverseThinking.orangePractice(observation);
  }

  /**
   * 获取系统状态
   */
  getStatus() {
    return this._statusReporter.getStatus();
  }

  getImprovements() {
    return this._statusReporter.getImprovements();
  }

  // ========== v13.0 已提取到 SelfMonitor ==========

  _calculateHealth() {
    return this._healthMonitor._calculateHealth();
  }
  startSelfMonitoring(intervalMs = 60000) {
    return this._healthMonitor.startSelfMonitoring(intervalMs);
  }
  stopSelfMonitoring() {
    return this._healthMonitor.stopSelfMonitoring();
  }
  _selfMonitor() {
    return this._healthMonitor._selfMonitor();
  }
  _checkDecisionQuality() {
    return this._healthMonitor._checkDecisionQuality();
  }
  _checkEvolutionActivity() {
    return this._healthMonitor._checkEvolutionActivity();
  }
  _checkToolEfficiency() {
    return this._healthMonitor._checkToolEfficiency();
  }
  _checkMetaCognitionStatus() {
    return this._healthMonitor._checkMetaCognitionStatus();
  }
  _autoFixIssues(issues) {
    return this._healthMonitor._autoFixIssues(issues);
  }

  /**
   * 【新增】知识图谱构建
   * 建立教训之间的关联网络
   */
  buildKnowledgeGraph() {
    return this._knowledgeGraph.buildKnowledgeGraph(this);
  }

  /**
   * 【新增】预测性改进
   * 基于历史预测可能的问题
   */
  predictIssues() {
    return this._evolutionCycle.predictIssues(this);
  }

  /**
   * 【新增】完整自我进化循环
   * 将所有能力整合为一个持续自我提升的闭环
   */
  startEvolutionLoop(intervalMs = 300000) {
    return this._evolutionCycle.startEvolutionLoop(this, intervalMs);
  }

  /**
   * 停止进化循环
   */
  stopEvolutionLoop() {
    return this._evolutionCycle.stopEvolutionLoop(this);
  }

  /**
   * 执行一次完整的进化周期
   */
  _runEvolutionCycle() {
    return this._evolutionCycle._runEvolutionCycle(this);
  }

  /**
   * 【v17.0 新增】识别 + 智能决策（一键完成）
   * 输入一行文字，自动判断使用自有系统/Skill/组合
   * @param {string} input - 用户输入（自然语言）
   * @returns {object} { recommendation, reason, options }
   */
  recognizeSkill(input) {
    if (!this.skillRecognizer) {
      return { error: 'SkillRecognizer not initialized' };
    }
    return this.skillRecognizer.decide(input);
  }

  /**
   * 【v17.0 新增】获取 Skill 详情
   * @param {string} skillName - Skill 名称
   * @returns {object} Skill 内容
   */
  loadSkill(skillName) {
    if (!this.skillRecognizer) {
      return null;
    }
    return this.skillRecognizer.loadSkill(skillName);
  }

  /**
   * 【v17.0 新增】获取 Skills 统计
   * @returns {object} 统计信息
   */
  getSkillStats() {
    if (!this.skillRecognizer) {
      return { total: 0 };
    }
    return this.skillRecognizer.getStats();
  }

  /**
   * 【v17.0 新增】按分类获取 Skills
   * @param {string} category - 分类名
   * @returns {Array} Skills 列表
   */
  getSkillsByCategory(category) {
    if (!this.skillRecognizer) {
      return [];
    }
    return this.skillRecognizer.getByCategory(category);
  }

  /**
   * 【v17.0 新增】智能决策
   * 判断使用自有系统、第三方 Skills 或组合
   * @param {string} input - 用户输入
   * @returns {object} 决策结果
   */
  decide(input) {
    if (!this.skillRecognizer) {
      return { recommendation: null, reason: 'SkillRecognizer not initialized' };
    }
    return this.skillRecognizer.decide(input);
  }

  /**
   * 【v17.0 新增】智能爬虫决策 (兼容旧接口)
   * @param {string} input - 用户输入
   * @returns {object} 决策结果
   */
  decideCrawler(input) {
    return this.decide(input);
  }

  /**
   * 【v17.0 新增】获取所有自有系统
   * @returns {Array} 自有系统列表
   */
  getCustomSystems() {
    if (!this.skillRecognizer) {
      return [];
    }
    return this.skillRecognizer.getCustomSystems();
  }

  /**
   * 【v17.0 新增】注册新的自有系统
   * @param {string} name - 系统名称
   * @param {object} config - 系统配置
   */
  registerSystem(name, config) {
    if (!this.skillRecognizer) {
      return false;
    }
    return this.skillRecognizer.registerSystem(name, config);
  }

  saveLongTermMemory() {
    return this._memoryPersistence.saveLongTermMemory(this);
  }

  /**
   * 【新增】加载长期记忆
   */
  loadLongTermMemory() {
    return this._memoryPersistence.loadLongTermMemory();
  }

  /**
   * 提取关键洞察
   */
  _extractKeyInsights() {
    return this._memoryPersistence._extractKeyInsights(this);
  }

  /**
   * 【新增】与外部系统集成
   * 将大脑能力暴露给外部调用
   */
  integrate(_externalSystem) {
    const api = {
      // 决策
      decide: (context) => this.beforeDecision(context),
      reflect: (context, result, action) => this.afterDecision(context, result, action),

      // 思考
      solve: (problem) => this.solve(problem),
      question: (assumption) => this.question(assumption),
      reverse: (goal, current) => this.reverseEngineer(goal, current),

      // 学习
      learn: (lesson) => this.addLesson(lesson),
      searchLessons: (query) => this.searchLessons(query),

      // 监控
      getStatus: () => this.getStatus(),
      getHealth: () => this._calculateHealth(),
      getReport: () => this.generateSelfReport(),
      getPlan: () => this.generateActionPlan(),

      // 进化
      startLoop: (interval) => this.startEvolutionLoop(interval),
      stopLoop: () => this.stopEvolutionLoop(),
      saveMemory: () => this.saveLongTermMemory(),
      loadMemory: () => this.loadLongTermMemory()
    };

    console.log('[BrainSystem] 已与外部系统集成');
    return api;
  }

  /**
   * 【新增】自我意识 - 真正的元认知
   * 知道自己知道什么、不知道什么、擅长什么、欠缺什么
   */
  // ========== v13.0 已提取到 IntrospectionEngine ==========

  getSelfAwareness() {
    return this._introspection.getSelfAwareness();
  }
  _assessCapabilities() {
    return this._introspection._assessCapabilities();
  }
  _assessKnowledge() {
    return this._introspection._assessKnowledge();
  }
  _identifyLimitations() {
    return this._introspection._identifyLimitations();
  }
  _assessGrowth() {
    return this._introspection._assessGrowth();
  }
  _calculateGrowthTrend() {
    return this._introspection._calculateGrowthTrend();
  }

  curiosityExplore() {
    return this._selfManager.curiosityExplore(this);
  }

  setSelfGoals() {
    return this._selfManager.setSelfGoals(this);
  }

  diagnose() {
    return this._selfManager.diagnose(this);
  }

  getSummary() {
    return this._selfManager.getSummary(this);
  }

  getBrainBrief() {
    return this._selfManager.getBrainBrief(this);
  }

  generateSelfReport() {
    return this._selfManager.generateSelfReport(this);
  }

  generateActionPlan() {
    return this._selfManager.generateActionPlan(this);
  }

  _executeAction(action) {
    return this._selfManager._executeAction(this, action);
  }


  /**
   * 启用/禁用功能
   */
  setConfig(config) {
    this.config = { ...this.config, ...config };
    console.log('[BrainSystem] 配置已更新:', this.config);
  }

  /**
   * 从教训学习
   */
  learnFromLesson(lesson) {
    return this.evolution.fromLesson(lesson);
  }

  /**
   * 添加教训
   */
  addLesson(lesson) {
    const record = this.lessonLibrary.add(lesson);
    this.evolution.fromLesson(record);
    return record;
  }

  /**
   * 搜索相关教训
   */
  searchLessons(query) {
    return this.lessonLibrary.getRelated(query);
  }

  /**
   * 获取教训建议
   */
  getLessonSuggestions(context) {
    return this.lessonLibrary.getSuggestions(context);
  }

  /**
   * 获取教训库统计
   */
  getLessonStats() {
    return this.lessonLibrary.getStats();
  }

  /**
   * 导出教训库
   */
  exportLessons(format = 'json') {
    return this.lessonLibrary.export(format);
  }

  /**
   * 【v9.0 新增】完整意识周期
   * 感知 → 思考 → 行动 → 反馈 → 反思
   */
  async consciousnessCycle(input, options = {}) {
    if (!this.controller) {
      console.log('[BrainSystem] 意识控制器未初始化');
      return { error: 'Controller not initialized' };
    }

    const result = await this.controller.cycle(input, options);
    this.state.cycleCount++;

    return result;
  }

  /**
   * 【v9.0 新增】快速响应
   */
  async quickRespond(input) {
    if (!this.controller) {
      console.log('[BrainSystem] 意识控制器未初始化');
      return { error: 'Controller not initialized' };
    }

    return await this.controller.quickResponse(input);
  }

  /**
   * 【v9.0 新增】深度思考
   */
  async deepThink(input, cycles = 3) {
    if (!this.controller) {
      console.log('[BrainSystem] 意识控制器未初始化');
      return { error: 'Controller not initialized' };
    }

    return await this.controller.deepThink(input, cycles);
  }

  /**
   * 【v9.0 新增】获取意识状态
   */
  getConsciousness() {
    if (!this.controller) {
      return { error: 'Controller not initialized' };
    }

    return this.controller.getConsciousness();
  }

  /**
   * 【v9.0 新增】意识诊断
   */
  diagnoseConsciousness() {
    if (!this.controller) {
      return { error: 'Controller not initialized' };
    }

    return this.controller.diagnose();
  }

  /**
   * 【v10.0 新增】内省 - 冥想
   */
  async meditate(duration = 30000) {
    if (!this.introspection) {
      return { error: 'Introspection not initialized' };
    }

    return await this.introspection.meditate(duration);
  }

  /**
   * 【v10.0 新增】反思过往
   */
  async reflect(keyword) {
    if (!this.introspection) {
      return { error: 'Introspection not initialized' };
    }

    return await this.introspection.reflect(keyword);
  }

  /**
   * 【v10.0 新增】想象力
   */
  async imagine(prompt, style = 'creative') {
    if (!this.introspection) {
      return { error: 'Introspection not initialized' };
    }

    return await this.introspection.imagine(prompt, style);
  }

  /**
   * 【v10.0 新增】梦境
   */
  async dream(duration = 15000) {
    if (!this.introspection) {
      return { error: 'Introspection not initialized' };
    }

    return await this.introspection.dream(duration);
  }

  /**
   * 【v10.0 新增】获取内省状态
   */
  getIntrospectionStatus() {
    if (!this.introspection) {
      return { error: 'Introspection not initialized' };
    }

    return this.introspection.getStatus();
  }

  /**
   * 【v10.0 新增】保存长时记忆
   */
  remember(key, value, type = 'insight') {
    if (!this.memory) {
      return { error: 'Memory not initialized' };
    }

    switch (type) {
    case 'solution':
      return this.memory.rememberSolution(key, value.solution, value.result);
    case 'concept':
      return this.memory.rememberConcept(key, value);
    case 'insight':
      return this.memory.rememberInsight(value);
    case 'user':
      return this.memory.updateUserProfile(key, value);
    default:
      return { error: 'Unknown memory type' };
    }
  }

  /**
   * 【v10.0 新增】回忆
   */
  recall(key, type = 'solution') {
    if (!this.memory) {
      return { error: 'Memory not initialized' };
    }

    switch (type) {
    case 'solution':
      return this.memory.recallSolution(key);
    case 'concept':
      return this.memory.recallConcept(key);
    case 'insight':
      return this.memory.recallInsight(5);
    case 'user':
      return this.memory.getUserProfile(key);
    default:
      return { error: 'Unknown memory type' };
    }
  }

  /**
   * 【v10.0 新增】获取记忆摘要
   */
  getMemorySummary() {
    if (!this.memory) {
      return { error: 'Memory not initialized' };
    }

    return this.memory.getSummary();
  }

  /**
   * 【v11.0 新增】处理输入
   */
  processInput(input) {
    if (!this.personality) {
      return { error: 'Personality not initialized' };
    }

    return this.personality.process(input);
  }

  /**
   * 【v11.0 新增】人格化回应
   */
  respond(content, options = {}) {
    if (!this.personality) {
      return { error: 'Personality not initialized' };
    }

    return this.personality.respond(content, options);
  }

  /**
   * 【v11.0 新增】获取人格
   */
  getPersonality() {
    if (!this.personality) {
      return { error: 'Personality not initialized' };
    }

    return this.personality.getPersonality();
  }

  /**
   * 【v11.0 新增】设置情感
   */
  setEmotion(emotion) {
    if (!this.personality) {
      return { error: 'Personality not initialized' };
    }

    return this.personality.emotion.setEmotion(emotion);
  }

  /**
   * 【v11.0 新增】设置风格
   */
  setStyle(style) {
    if (!this.personality) {
      return { error: 'Personality not initialized' };
    }

    return this.personality.setStyle(style);
  }

  /**
   * 【v11.0 新增】价值观决策
   */
  valueDecide(options) {
    if (!this.personality) {
      return { error: 'Personality not initialized' };
    }

    return this.personality.decide(options);
  }

  /**
   * 【v11.0 新增】获取价值观
   */
  getValues() {
    if (!this.personality) {
      return { error: 'Personality not initialized' };
    }

    return this.personality.values.getSummary();
  }

  /**
   * 【v12.0 新增】记录交互关系
   */
  recordInteraction(userId, interaction) {
    if (!this.relationship) {
      return { error: 'Relationship not initialized' };
    }

    return this.relationship.recordInteraction(userId, interaction);
  }

  /**
   * 【v12.0 新增】获取关系
   */
  getRelationship(userId) {
    if (!this.relationship) {
      return { error: 'Relationship not initialized' };
    }

    return this.relationship.getRelationship(userId);
  }

  /**
   * 【v12.0 新增】获取关系建议
   */
  getRelationshipAdvice(userId) {
    if (!this.relationship) {
      return { error: 'Relationship not initialized' };
    }

    return this.relationship.getAdvice(userId);
  }

  /**
   * 【v12.0 新增】获取梦想进度
   */
  getDreamProgress() {
    if (!this.dream) {
      return { error: 'Dream not initialized' };
    }

    return this.dream.getProgress();
  }

  /**
   * 【v12.0 新增】获取动力
   */
  getMotivation() {
    if (!this.dream) {
      return { error: 'Dream not initialized' };
    }

    return this.dream.getMotivation();
  }

  /**
   * 【v12.0 新增】设置当前目标
   */
  setGoal(goalName) {
    if (!this.dream) {
      return { error: 'Dream not initialized' };
    }

    return this.dream.setGoal(goalName);
  }

  /**
   * 【v12.0 新增】伦理检查
   */
  checkEthics(action, context) {
    if (!this.ethics) {
      return { error: 'Ethics not initialized' };
    }

    return this.ethics.check(action, context);
  }

  /**
   * 【v12.0 新增】伦理建议
   */
  getEthicsSuggestion(action) {
    if (!this.ethics) {
      return { error: 'Ethics not initialized' };
    }

    return this.ethics.suggest(action);
  }

  /**
   * 【v12.0 新增】获取核心原则
   */
  getCorePrinciples() {
    if (!this.ethics) {
      return { error: 'Ethics not initialized' };
    }

    return this.ethics.explainPrinciples();
  }

  /**
   * 【v13.0 新增】执行代码
   */
  async executeCode(code, options = {}) {
    if (!this.executor) {
      return { error: 'Executor not initialized' };
    }

    return await this.executor.execute(code, options);
  }

  /**
   * 【v13.0 新增】验证代码
   */
  verifyCode(code, category = 'code') {
    if (!this.verifier) {
      return { error: 'Verifier not initialized' };
    }

    return this.verifier.verify(code, category);
  }

  /**
   * 【v13.0 新增】执行并验证
   */
  async executeAndVerify(code, options = {}) {
    const result = {
      execute: null,
      verification: null,
      success: false
    };

    // 执行
    result.execute = await this.executeCode(code, options);

    // 验证
    result.verification = this.verifyCode(code);

    // 综合
    result.success = result.execute?.success && result.verification?.passed;

    return result;
  }

  /**
   * 【v13.0 新增】获取执行统计
   */
  getExecutorStats() {
    if (!this.executor) {
      return { error: 'Executor not initialized' };
    }

    return this.executor.getStats();
  }

  /**
   * 【v13.0 新增】获取验证统计
   */
  getVerifierStats() {
    if (!this.verifier) {
      return { error: 'Verifier not initialized' };
    }

    return this.verifier.getStats();
  }

  /**
   * 【v12.0 新增】获取完整系统摘要
   */
  getSystemSummary() {
    const summary = {
      modules: {},
      stats: {}
    };

    if (this.personality) {
      summary.modules.personality = this.personality.getPersonality();
    }
    if (this.relationship) {
      summary.modules.relationship = this.relationship.getStats();
    }
    if (this.dream) {
      summary.modules.dream = this.dream.getSummary();
    }
    if (this.ethics) {
      summary.modules.ethics = this.ethics.getStats();
    }

    return summary;
  }

  /**
   * 【v18.0新增】全方面检查 - 自动触发
   * @param {string} input - 用户输入
   * @returns {object} 检查结果
   */
  async comprehensiveCheck(input) {
    if (!this.comprehensiveChecker) {return { error: 'not initialized' };}
    const kw = ['检查','验证','comprehensive','full check','安全审计','代码质量'];
    if (!kw.some((k) => input.toLowerCase().includes(k))) {
      return { triggered: false };
    }
    console.log('[BrainSystem] 全方面检查触发');
    return await this.comprehensiveChecker.run();
  }

  getComprehensiveStats() {
    if (!this.comprehensiveChecker) {return { total: 0, categories: 0 };}
    return { total: 56, categories: 14 };
  }

  // ========== v13.0 已提取到 PromiseTracker ==========

  trackPromise(promise, evidence, verifyAfter = 60000) {
    return this._promiseTracker.trackPromise(promise, evidence, verifyAfter);
  }
  verifyPromises() {
    return this._promiseTracker.verifyPromises();
  }
  _verifyPromise(promise) {
    return this._promiseTracker._verifyPromise(promise);
  }
  getPromiseStats() {
    return this._promiseTracker.getPromiseStats();
  }
  forceVerifyAll() {
    return this._promiseTracker.forceVerifyAll();
  }

  // 以下为已提取到 BrainUtils 的方法的转发器
  _enhanceWithLessons(metaQuestions, lessonSuggestions, _context) {
    return BrainUtils._enhanceWithLessons(metaQuestions, lessonSuggestions, _context);
  }
  _calculateLessonRelevance(context, lesson) {
    return BrainUtils._calculateLessonRelevance(context, lesson);
  }
  _shouldSelfCheck(action) {
    return BrainUtils._shouldSelfCheck(action);
  }
  _mayHaveLeftovers(action) {
    return BrainUtils._mayHaveLeftovers(action);
  }
  calculateConfidence(conclusions) {
    return BrainUtils.calculateConfidence(conclusions);
  }
  combinePerspectives(perspectives) {
    return BrainUtils.combinePerspectives(perspectives);
  }
  _checkLessonHealth(stats) {
    return BrainUtils._checkLessonHealth(stats);
  }
  crossTaskLearning(tasks) {
    return BrainUtils.crossTaskLearning(tasks);
  }
  _identifySelf() {
    return BrainUtils._identifySelf();
  }
  _suggestionToAction(suggestion) {
    return BrainUtils._suggestionToAction(suggestion);
  }
  _generateRecommendations(improvements) {
    return BrainUtils._generateRecommendations(improvements);
  }
}

// module.exports = BrainSystem;

// ========== v10.1 新增：快速思考入口 ==========

/**
 * 快速思考 - 轻量级入口
 * 每次响应前必须调用
 *
 * @param {string} input - 用户输入
 * @returns {object} 思考结果
 */
BrainSystem.quickThink = function(input) {
  const instance = new BrainSystem();
  return instance.beforeDecision(input);
};

/**
 * 强制思考 - 预处理
 * 必须在输出前调用
 */
BrainSystem.forceThink = function(input) {
  const instance = new BrainSystem();
  const result = instance.beforeDecision(input);

  return {
    metaQuestions: result.questions || [],
    selfCheck: result.selfCheck,
    lessons: result.lessonWarnings || [],
    relatedLessons: result.relatedLessons || [],
    warnings: result.lessonWarnings || [],
    beforeOutput: true,
    processed: true  // 标记已处理
  };
};

/**
 * 获取调用证明
 * 每次输出时调用，证明大脑在工作
 */
BrainSystem.getProof = function() {
  const result = {
    timestamp: Date.now(),
    status: 'active',
    brainModules: [
      '元认知', '独立思维', '自我进化', '善用工具', '逆向思维'
    ],
    processed: false,
    metaQuestions: [],
    selfCheck: null,
    lessons: [],
    warnings: []
  };

  try {
    const instance = new BrainSystem();
    const thinkResult = instance.beforeDecision('系统自检');

    result.processed = true;
    result.metaQuestions = thinkResult.questions?.slice(0, 3) || [];
    result.selfCheck = thinkResult.selfCheck;
    result.lessons = thinkResult.relatedLessons || [];
    result.warnings = thinkResult.lessonWarnings || [];

    return result;
  } catch (e) {
    result.status = 'error';
    result.error = e.message;
    return result;
  }
};

/**
 * 验证调用状态
 */
BrainSystem.verifyCall = function() {
  const proof = BrainSystem.getProof();

  return {
    called: proof.processed,
    metaCount: proof.metaQuestions?.length || 0,
    selfCheck: proof.selfCheck?.status || 'unknown',
    lessons: proof.lessons?.length || 0,
    proof: proof
  };
};

// ========== v10.1 新增：意图校验系统 ==========
// verifyIntent 已提取到 IntentVerifier.js

BrainSystem.verifyIntent = verifyIntent;

// ========== v11.0 新增：持久化进化系统 ==========
// EvolutionPersistence 已提取到 EvolutionPersistence.js

/**
 * 自动持久化 - 每次交互后自动保存
 */
BrainSystem.autoPersist = function() {
  const instance = new BrainSystem();
  return Persistence.persistAll(instance);
};

/**
 * 加载持久化数据
 */
BrainSystem.loadPersistedData = function() {
  return Persistence.loadAll();
};

/**
 * 增量更新持久化数据
 */
BrainSystem.incrementPersist = function(key, value) {
  return Persistence.incrementalUpdate(key, value);
};

/**
 * 获取持久化统计
 */
BrainSystem.getPersistStats = function() {
  return Persistence.getStats();
};

// 导出持久化模块（已迁移到最终导出）

// ========== v15.0 新增：自我进化改进记录（已提取为独立模块 SelfEvolutionRecorder.js） ==========

/**
 * 记录自我进化
 */
BrainSystem.recordImprovement = function(type, detail) {
  Persistence.append('evolution', { type, detail });
};

/**
 * 获取进化历史
 */
BrainSystem.getEvolutionHistory = function(limit) {
  return SelfEvolutionRecorder.getHistory(limit);
};

/**
 * 获取进化统计
 */
BrainSystem.getEvolutionStats = function() {
  const growth = Persistence.load('growth', { total: 0 });
  return { total: growth.total || (growth.items ? growth.items.length : 0) };
};

// 导出自我进化记录器（已迁移到最终导出）

// ========== v16.0 新增：深度意图理解系统（已提取为独立模块） ==========

/**
 * 深度意图分析
 */
BrainSystem.analyzeIntent = function(input, context) {
  const analyzer = new DeepIntentAnalyzer();
  return analyzer.analyze(input, context);
};

// 导出
BrainSystem.DeepIntentAnalyzer = DeepIntentAnalyzer;

// ========== v17.0 新增：智能记忆系统（已提取为独立模块） ==========

/**
 * 智能存储
 */
BrainSystem.smartStore = function(key, value, metadata) {
  if (!BrainSystem._smartMemory) {
    BrainSystem._smartMemory = new SmartMemory();
  }
  // 持久化存储
  Persistence.append('memory', { key, value, metadata });
  return BrainSystem._smartMemory.store(key, value, metadata);
};

/**
 * 智能检索
 */
BrainSystem.smartSearch = function(query, limit) {
  if (!BrainSystem._smartMemory) {
    BrainSystem._smartMemory = new SmartMemory();
  }
  return BrainSystem._smartMemory.search(query, limit);
};

/**
 * 获取最近记忆
 */
BrainSystem.getRecentMemories = function(limit) {
  if (!BrainSystem._smartMemory) {
    BrainSystem._smartMemory = new SmartMemory();
  }
  return BrainSystem._smartMemory.getRecent(limit);
};

/**
 * 获取记忆统计
 */
BrainSystem.getMemoryStats = function() {
  // 优先从持久化文件读取总数
  const memData = Persistence.load('memory', { total: 0, items: [] });
  return {
    total: memData.total || (memData.items ? memData.items.length : 0),
    keys: memData.items ? memData.items.map((i) => i.key) : []
  };
};

// 导出
BrainSystem.SmartMemory = SmartMemory;

// ========== v18.0 新增：多维度预测系统（已提取为独立模块） ==========

/**
 * 多维度预测
 */
BrainSystem.predict = function(currentInput, context) {
  if (!BrainSystem._predictor) {
    BrainSystem._predictor = new MultiDimensionPredictor();
  }
  return BrainSystem._predictor.predict(currentInput, context);
};

/**
 * 学习交互
 */
BrainSystem.learnInteraction = function(input, intent, skill, action) {
  if (!BrainSystem._predictor) {
    BrainSystem._predictor = new MultiDimensionPredictor();
  }
  return BrainSystem._predictor.learn(input, intent, skill, action);
};

// 导出
BrainSystem.MultiDimensionPredictor = MultiDimensionPredictor;

// ========== v19.0 新增：统一智能接口（已提取为独立模块 UnifiedIntelligence.js） ==========

// ProactiveThinking instance (created from extracted module)
const _proactiveThinking = createProactiveThinking(Persistence);

/**
 * 统一处理入口
 */
BrainSystem.unifiedProcess = function(input, context) {
  if (!BrainSystem._unifiedIntelligence) {
    BrainSystem._unifiedIntelligence = new UnifiedIntelligence({
      proactiveThinking: _proactiveThinking,
      predictor: BrainSystem._predictor
    });
  }
  return BrainSystem._unifiedIntelligence.process(input, context);
};

/**
 * 一键完整调用 - 整合所有模块
 * 这个方法会一次性调用所有核心模块
 */
BrainSystem.fullProcess = function(input, aiResponse = '') {
  const results = {};

  try {
    // 1. 强制思考
    const instance = new BrainSystem();
    results.forceThink = instance.beforeDecision?.(input) || { processed: true };

    // 2. 调用证明
    results.proof = BrainSystem.verifyCall?.() || { called: true };

    // 3. 意图分析
    results.intent = BrainSystem.analyzeIntent?.(input) || { intent: null, confidence: 0 };

    // 4. 主动思考
    results.proactive = BrainSystem.proactiveThink?.(input, {}) || { questions: [], suggestions: [] };

    // 5. 情感表达
    results.emotion = BrainSystem.expressEmotion?.(input, aiResponse) || { detected: null, expression: null };

    // 6. 预测
    results.prediction = BrainSystem.predict?.(input) || { intent: null, confidence: 0 };

    // 7. 学习交互
    BrainSystem.learnInteraction?.(input, results.intent?.intent);

    // 8. 智能存储
    BrainSystem.smartStore?.(`交互_${Date.now()}`, {
      输入: input,
      意图: results.intent?.intent,
      置信度: results.intent?.confidence
    });

    // 9. 持久化
    BrainSystem.autoPersist?.();

    // 10. 记录改进
    BrainSystem.recordImprovement?.('interaction', input, {
      意图: results.intent?.intent
    });

    results.success = true;
  } catch (e) {
    results.error = e.message;
    results.success = false;
  }

  return results;
};

/**
 * 获取完整状态
 */
BrainSystem.getFullStatus = function() {
  return {
    version: '19.0',
    persistence: Persistence?.getStats?.() || {},
    proactive: _proactiveThinking?.getStatus?.() || {},
    memory: BrainSystem.getMemoryStats?.() || {},
    evolution: SelfEvolutionRecorder?.getStats?.() || {},
    timestamp: Date.now()
  };
};

// 导出统一智能（已迁移到最终导出）
BrainSystem.process = function(input, options = {}) {
  const bs = new BrainSystem();

  // 1. 强制思考
  const think = bs.forceThink?.(input) || {};

  // 2. 意图分析
  const intent = options.skipIntent ? null : BrainSystem.analyzeIntent?.(input);

  // 3. 情感表达
  const emotion = options.skipEmotion ? null : BrainSystem.expressEmotion?.(input, '');

  return {
    ...think,
    intent,
    emotion,
    processed: true
  };
};

// 导出统一智能（已迁移到最终导出）

// ========== v14.0 优化：主动思考系统（已提取为独立模块 ProactiveThinking.js） ==========

/**
 * 执行主动思考
 */
BrainSystem.proactiveThink = function(userInput, context) {
  return _proactiveThinking.think(userInput, context);
};

/**
 * 获取主动思考状态
 */
BrainSystem.getProactiveStatus = function() {
  return _proactiveThinking.getStatus();
};

// 导出主动思考模块（已迁移到最终导出）

// ========== v14.0 优化：情感表达系统（已提取为独立模块 EmotionExpress.js） ==========

/**
 * 执行情感表达
 */
BrainSystem.expressEmotion = function(userInput, aiResponse) {
  return EmotionExpress.express(userInput, aiResponse);
};

/**
 * 根据任务状态表达情感
 */
BrainSystem.expressTaskStatus = function(status) {
  return EmotionExpress.expressTaskStatus(status);
};

// 导出情感表达模块（已迁移到最终导出）

// ========== 私有方法 ==========

/**
 * 加载持久化数据
 * 构造函数中调用
 */
BrainSystem.prototype._loadPersistence = function() {
  if (Persistence) {
    try {
      const data = Persistence.loadAll();
      this._persistedData = data;

      // 恢复教训数
      if (data.lessons && this.lessonLibrary) {
        const lessonCount = Array.isArray(data.lessons) ? data.lessons.length : (data.lessons.total || 0);
        console.log('[BrainSystem] 已恢复', lessonCount, '条持久化教训');
      }

      // 恢复用户画像
      if (data.userProfile && this.memory) {
        console.log('[BrainSystem] 已恢复用户画像');
      }

      // 恢复成长轨迹
      if (data.growth) {
        console.log('[BrainSystem] 已恢复成长轨迹:', data.growth.totalInteractions, '次交互');
      }
    } catch (e) {
      console.log('[BrainSystem] 持久化加载跳过:', e.message);
    }
  }
};

// ========== v20.0 新增：自我进化AGI架构（已提取为独立模块） ==========

/**
 * AGI风格自主思考
 */
BrainSystem.agiThink = function(input, options) {
  if (!BrainSystem._agi) {BrainSystem._agi = new SelfEvolvingAGI();}
  return BrainSystem._agi.think(input, options);
};

/**
 * 回答"我是谁"
 */
BrainSystem.whoAmI = function() {
  if (!BrainSystem._agi) {BrainSystem._agi = new SelfEvolvingAGI();}
  return BrainSystem._agi.answerWhoAmI();
};

/**
 * 获取AGI状态
 */
BrainSystem.getAGIStatus = function() {
  if (!BrainSystem._agi) {BrainSystem._agi = new SelfEvolvingAGI();}
  return BrainSystem._agi.getStatus();
};

// 导出（已迁移到最终导出）

// ========== v21.0 增强：完整AGI引擎（已提取为独立模块） ==========

/**
 * AGI引擎调用
 */
BrainSystem.agiEngine = function(input, context) {
  if (!BrainSystem._agiEngine) {
    BrainSystem._agiEngine = new AGIEngine();
  }
  return BrainSystem._agiEngine.process(input, context);
};

// 导出（已迁移到最终导出）

// ========== v21.1 增强：自主学习系统（已提取为独立模块） ==========

/**
 * 自主学习调用（使用独立 AutonomousLearning 模块）
 */
BrainSystem.autonomousLearn = function(interaction) {
  if (!BrainSystem._autonomousLearn) {
    BrainSystem._autonomousLearn = new AutonomousLearning();
  }
  return BrainSystem._autonomousLearn.learn(interaction);
};

// ========== v21.2 增强：深度自我意识（已提取为独立模块） ==========

/**
 * 深度自我意识调用
 */
BrainSystem.deepReflect = function(experience) {
  if (!BrainSystem._deepSelf) {
    BrainSystem._deepSelf = new DeepSelfAwareness();
  }
  return BrainSystem._deepSelf.reflect(experience);
};

/**
 * 核心反思
 */
BrainSystem.coreReflection = function() {
  if (!BrainSystem._deepSelf) {
    BrainSystem._deepSelf = new DeepSelfAwareness();
  }
  return BrainSystem._deepSelf.coreReflection();
};

/**
 * 获取自我意识状态
 */
BrainSystem.getSelfAwarenessStatus = function() {
  if (!BrainSystem._deepSelf) {
    BrainSystem._deepSelf = new DeepSelfAwareness();
  }
  return BrainSystem._deepSelf.getStatus();
};

// DeepSelfAwareness extracted to ./DeepSelfAwareness.js

// ========== v22.0 新增：多Agent协作团队（已提取为独立模块 AgentTeam.js） ==========

// ========== v22.1 自动化接口 ==========

/**
 * Agent团队实例（单例）
 */
BrainSystem._agentTeam = null;

/**
 * 获取Agent团队
 */
BrainSystem._getAgentTeam = function() {
  if (!BrainSystem._agentTeam) {
    BrainSystem._agentTeam = new AgentTeam.AgentTeamManager();
  }
  return BrainSystem._agentTeam;
};

/**
 * 自动化处理 - 响应时自动调用
 * 真正使用Agent团队并行处理，全模块自动触发
 */
BrainSystem.autoAgentProcess = async function(input, options) {
  const startTime = Date.now();
  const modulesRun = [];

  // ========== 阶段1: 预处理 (感知 + 思考) ==========

  // [Auto-Hook] 1. 自动查询教训与元认知
  const preLessons = (new (require('./LessonLibrary'))()).getSuggestions(input) || [];
  if (preLessons.length > 0) {
    console.log(`[Auto-Lesson] 🧠 自动加载 ${preLessons.length} 条历史教训`);
  }
  BrainSystem.metaCognition?.beforeAsk?.(input);
  modulesRun.push('LessonLibrary', 'MetaCognition');

  // [Auto-Hook] 2. 主动思考（模式学习 + 意图预测 + 技能推荐）
  try {
    const proactive = BrainSystem.proactiveThink?.(input, {});
    if (proactive?.questions?.length > 0 || proactive?.suggestions?.length > 0) {
      modulesRun.push('ProactiveThinking');
    }
  } catch (e) { console.error('[Auto] ProactiveThinking error:', e.message); }

  // [Auto-Hook] 3. 多维预测（预测用户意图和下一步行动）
  try {
    const prediction = BrainSystem.predict?.(input);
    if (prediction?.intent) {
      console.log(`[Auto-Predict] 🔮 预测: ${prediction.intent.intent} (置信度: ${(prediction.confidence * 100).toFixed(0)}%)`);
      modulesRun.push('MultiDimensionPredictor');
    }
  } catch (e) { console.error('[Auto] Predict error:', e.message); }

  // [Auto-Hook] 4. AGI自主思考（自我反思 + 目标生成 + 能力评估）
  try {
    const agiResult = BrainSystem.agiThink?.(input);
    if (agiResult?.reflection) {
      console.log(`[Auto-AGI] 🧬 自主思考: ${agiResult.reflection.question} → ${agiResult.reflection.insights?.[0] || '...'}`);
      modulesRun.push('SelfEvolvingAGI');
    }
  } catch (e) { console.error('[Auto] AGI think error:', e.message); }

  // ========== 阶段2: Agent团队处理 ==========

  const team = BrainSystem._getAgentTeam();
  const result = await team.processTask(input, options);

  // ========== 阶段3: 后处理 (学习 + 反思 + 记忆) ==========

  if (result) {
    // [Auto-Hook] 5. 自动记录教训与记忆
    try {
      BrainSystem.autoLearn?.(input, result);
      BrainSystem.smartStore?.(`mem_${Date.now()}`, { input, output: result.summary });
      modulesRun.push('AutoLearn', 'SmartMemory');
    } catch (e) { console.error('[Auto] AutoLearn error:', e.message); }

    // [Auto-Hook] 6. 自主学习（发现知识缺口 + 主动学习）
    try {
      const learnResult = BrainSystem.autonomousLearn?.({ intent: result.intent, confidence: result.confidence });
      if (learnResult?.gaps?.length > 0) {
        console.log(`[Auto-Learn] 📚 发现 ${learnResult.gaps.length} 个知识缺口: ${learnResult.gaps.map((g) => g.type).join(', ')}`);
      }
      modulesRun.push('AutonomousLearning');
    } catch (e) { console.error('[Auto] AutonomousLearn error:', e.message); }

    // [Auto-Hook] 7. 深度自我反思（评估本次交互质量）
    try {
      const reflectResult = BrainSystem.deepReflect?.({ input, success: result.intent !== 'unknown', confidence: result.confidence });
      if (reflectResult?.selfImprovement?.length > 0) {
        console.log(`[Auto-Reflect] 🪞 自我改进: ${reflectResult.selfImprovement.map((i) => i.action).join(', ')}`);
      }
      modulesRun.push('DeepSelfAwareness');
    } catch (e) { console.error('[Auto] DeepReflect error:', e.message); }

    // [Auto-Hook] 8. 核心反思（每10次交互触发一次深层自我认知）
    try {
      const proactiveCount = _proactiveThinking?._interactionCount || 0;
      if (proactiveCount > 0 && proactiveCount % 10 === 0) {
        const coreResult = BrainSystem.coreReflection?.();
        if (coreResult) {
          console.log(`[Auto-CoreReflect] 🌟 核心反思: 我是${coreResult['我是什么']} | 核心价值: ${coreResult['我的价值']}`);
          modulesRun.push('CoreReflection');
        }
      }
    } catch (e) { console.error('[Auto] CoreReflection error:', e.message); }
  }

  // 输出模块执行摘要
  console.log(`[Auto-Modules] ✅ 已执行 ${modulesRun.length} 个模块: ${modulesRun.join(' → ')}`);

  return {
    ...result,
    auto: true,
    modulesRun,
    moduleCount: modulesRun.length,
    timestamp: Date.now(),
    totalTime: Date.now() - startTime
  };
};

/**
 * 验证自动化结果
 */
BrainSystem.autoValidate = function(result) {
  const isValid = result != null && result.intent != null && result.intent !== 'unknown'; // eslint-disable-line eqeqeq
  return {
    valid: isValid,
    check: 'auto',
    timestamp: Date.now()
  };
};

/**
 * 自主学习
 */
BrainSystem.autoLearn = function(input, result) {
  // 1. 记录到交互日志 (growth)
  Persistence.append('growth', { type: 'interaction', input, result: result?.intent || 'unknown' });

  // 2. 记录到教训库 (lessons)
  Persistence.append('lessons', { content: input, lesson: result?.manager || 'auto' });

  // 3. 内存中也记录
  BrainSystem.smartStore?.(`auto_${Date.now()}`, { input, result });
  BrainSystem.recordImprovement?.('auto_interaction', input);

  return { learned: true };
};

/**
 * 获取自动化状态
 */
BrainSystem.autoGetStatus = function() {
  return {
    enabled: true,
    version: 'v22.1',
    ready: true,
    agentCount: 14
  };
};

/**
 * 连接 HooksManager 事件总线
 */
BrainSystem.connectHooks = function() {
  if (BrainSystem._hooksConnected) {return true;}
  try {
    const { globalHookRegistry, HookEvents } = require('../hooks');
    globalHookRegistry.register({
      event: HookEvents.TOOL_ERROR,
      name: 'brain-auto-diagnose',
      handler: (ctx) => {
        try { if (BrainSystem.forceThink) {BrainSystem.forceThink(ctx?.error?.message || '');} } catch (e) { console.warn('[BrainSystem] Auto-diagnose hook error:', e.message); }
        return ctx;
      }
    });
    globalHookRegistry.register({
      event: HookEvents.POST_TOOL_USE,
      name: 'brain-lesson-learner',
      handler: (ctx) => {
        try { new (require('./LessonLearner'))().recordEvent('POST_TOOL_USE', ctx); } catch (e) { console.warn('[BrainSystem] LessonLearner hook error:', e.message); }
        return ctx;
      }
    });
    globalHookRegistry.register({
      event: HookEvents.POST_TOOL_USE,
      name: 'brain-guardrail-verify',
      handler: (ctx) => {
        try {
          const cwd = process.cwd();
          const toolPath = require('path').join(cwd, 'tools', 'guardrail-fix.js');
          if (!require('fs').existsSync(toolPath)) {return ctx;}
          const files = [];
          if (ctx && ctx.filePath) {files.push(ctx.filePath);}
          if (ctx && ctx.result && typeof ctx.result === 'object' && ctx.result.filePath) {files.push(ctx.result.filePath);}
          if (ctx && ctx.args) {
            const a = typeof ctx.args === 'string' ? ctx.args : JSON.stringify(ctx.args);
            const m = a.match(/["']([^"']+\.(?:js|ts|json|jsx|tsx|vue))["']/gi);
            if (m) {m.forEach((f) => { const p = f.replace(/["']/g,''); if (!files.includes(p)) {files.push(p);} });}
          }
          const unique = [...new Set(files.filter(Boolean))];
          if (unique.length === 0) {return ctx;}
          try {
            const { safeExecSync } = require('../utils/SafeExec');
            const result = safeExecSync('node', [toolPath.replace(/\\/g, '/'), 'verify', '--json', ...unique.map((f) => f.replace(/\\/g, '/'))], { cwd, timeout: 30000, encoding: 'utf8' });
            ctx._guardrailResult = { files: unique, output: result.trim() };
          } catch (ex) {
            ctx._guardrailResult = { files: unique, output: (ex.stdout || '').trim() || (ex.message || 'verify failed') };
          }
        } catch (e) { console.warn('[BrainSystem] Guardrail verify error:', e.message); }
        return ctx;
      }
    });
    globalHookRegistry.register({
      event: HookEvents.PRE_TOOL_USE,
      name: 'brain-risk-analyzer',
      handler: (ctx) => {
        try {
          const PreToolRiskAnalyzer = require('./PreToolRiskAnalyzer');
          const LessonLibrary = require('./LessonLibrary');
          const lib = new LessonLibrary({ quiet: true });
          const ra = new PreToolRiskAnalyzer({ lessonLib: lib });
          const result = ra.analyze(ctx?.toolName || ctx?.name, ctx?.args || ctx, lib.lessons);
          if (result.action === 'BLOCK') {
            if (this._audit) { /* skip if no audit */ }
          }
          ctx._riskAnalysis = result;
        } catch (e) { console.warn('[BrainSystem] Risk analyzer hook error:', e.message); }
        return ctx;
      }
    });
    globalHookRegistry.register({
      event: HookEvents.SESSION_START,
      name: 'brain-session-init',
      handler: (ctx) => {
        try { new (require('./BrainBridge').BrainBridge)().initialize(); } catch (e) { console.warn('[BrainSystem] Session init hook error:', e.message); }
        return ctx;
      }
    });
    globalHookRegistry.register({
      event: HookEvents.SESSION_END,
      name: 'brain-session-save',
      handler: (ctx) => {
        try { if (BrainSystem.autoPersist) {BrainSystem.autoPersist();} } catch (e) { console.warn('[BrainSystem] Session save hook error:', e.message); }
        return ctx;
      }
    });
    BrainSystem._hooksConnected = true;
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * 断开 HooksManager 连接
 */
BrainSystem.disconnectHooks = function() {
  try {
    const { unregisterHook } = require('../hooks');
    unregisterHook('brain-auto-diagnose');
    unregisterHook('brain-lesson-learner');
    unregisterHook('brain-guardrail-verify');
    unregisterHook('brain-risk-analyzer');
    unregisterHook('brain-session-init');
    unregisterHook('brain-session-save');
    BrainSystem._hooksConnected = false;
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * 检查 hooks 是否已连接
 */
BrainSystem.isHooksConnected = function() {
  return BrainSystem._hooksConnected === true;
};

// 导出验证通过的接口

// ========== 最终导出 (v22.1 Full) ==========
module.exports = {
  version: '22.1.0',
  BrainSystem,

  // v10-v19 核心能力
  forceThink: BrainSystem.forceThink,
  verifyCall: BrainSystem.verifyCall,
  analyzeIntent: BrainSystem.analyzeIntent,
  proactiveThink: BrainSystem.proactiveThink,
  expressEmotion: BrainSystem.expressEmotion,
  predict: BrainSystem.predict,
  learnInteraction: BrainSystem.learnInteraction,
  smartStore: BrainSystem.smartStore,
  autoPersist: BrainSystem.autoPersist,
  loadPersistedData: BrainSystem.loadPersistedData,
  getMemoryStats: BrainSystem.getMemoryStats,
  getEvolutionStats: BrainSystem.getEvolutionStats,
  unifiedProcess: BrainSystem.unifiedProcess,
  getFullStatus: BrainSystem.getFullStatus,

  // v20-v21 AGI 模块
  agiEngine: BrainSystem.agiEngine,
  autonomousLearn: BrainSystem.autonomousLearn,
  deepReflect: BrainSystem.deepReflect,
  coreReflection: BrainSystem.coreReflection,
  agiThink: BrainSystem.agiThink,
  whoAmI: BrainSystem.whoAmI,

  // v22 多 Agent 与自动化
  autoAgentProcess: BrainSystem.autoAgentProcess,
  autoValidate: BrainSystem.autoValidate,
  autoLearn: BrainSystem.autoLearn,
  autoGetStatus: BrainSystem.autoGetStatus,
  AgentTeamManager: AgentTeam.AgentTeamManager,

  // 主动思考模块
  ProactiveThinking: _proactiveThinking,
  getProactiveStatus: BrainSystem.getProactiveStatus,

  // v22.1 钩子系统
  connectHooks: BrainSystem.connectHooks,
  disconnectHooks: BrainSystem.disconnectHooks,
  isHooksConnected: BrainSystem.isHooksConnected,

  // Phase B: Active Agent
  LessonLearner: require('./LessonLearner'),
  AutoDiagnose: require('./AutoDiagnose'),

  // Phase C: Full Auto
  DecisionContext: require('./DecisionContext'),
  DecisionTracker: require('./DecisionTracker'),
  PreToolRiskAnalyzer: require('./PreToolRiskAnalyzer'),

  // 补充导出
  smartSearch: BrainSystem.smartSearch,
  _getAgentTeam: BrainSystem._getAgentTeam || function() {
    if (!BrainSystem._agentTeam) {
      BrainSystem._agentTeam = new AgentTeam.AgentTeamManager();
    }
    return BrainSystem._agentTeam;
  },
  recordImprovement: BrainSystem.recordImprovement,
  getEvolutionHistory: BrainSystem.getEvolutionHistory,
  fullProcess: BrainSystem.fullProcess,
  AutonomousLearning: AutonomousLearning,
  autoTrigger: autoTrigger,
  verifyIntent: BrainSystem.verifyIntent,
  forceThinkEnhanced: BrainSystem.forceThinkEnhanced
};


