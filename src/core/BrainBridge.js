const path = require('path');
const fs = require('fs');
const CircuitBreaker = require('./CircuitBreaker');
const LoopGuard = require('./LoopGuard');
const AuditLogger = require('./AuditLogger');

function loadConfig() {
  const configPath = path.join(process.cwd(), '.opencode', 'brain.config.json');
  let config = {
    enabled: true, autoBridge: true, fullAuto: false,
    fullAutoWhitelist: ['ReadFile', 'WriteFile', 'EditFile'],
    circuitBreaker: { maxRetries: 3, resetAfterMs: 60000 },
    loopGuard: { maxHistory: 50, maxPerMinute: 3 },
    audit: { maxDays: 90 },
    backup: { maxBackups: 30, minDiskSpaceMB: 100 },
    learner: { enabled: true, minConfidence: 0.3, requireApproval: true, autoApprovalThreshold: 0.8 },
    diagnose: { enabled: true, maxResults: 3, minScore: 0.1 },
    daemon: { enabled: true, healthIntervalMs: 300000, cleanIntervalMs: 3600000 },
    proactive: { enabled: true, scanIntervalMs: 3600000 }
  };
  try {
    if (fs.existsSync(configPath)) {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { ...config, ...fileConfig, circuitBreaker: { ...config.circuitBreaker, ...(fileConfig.circuitBreaker || {}) }, loopGuard: { ...config.loopGuard, ...(fileConfig.loopGuard || {}) }, audit: { ...config.audit, ...(fileConfig.audit || {}) }, backup: { ...config.backup, ...(fileConfig.backup || {}) }, learner: { ...config.learner, ...(fileConfig.learner || {}) }, diagnose: { ...config.diagnose, ...(fileConfig.diagnose || {}) }, daemon: { ...config.daemon, ...(fileConfig.daemon || {}) }, proactive: { ...config.proactive, ...(fileConfig.proactive || {}) } };
    }
  } catch (e) { /* 使用默认值 */ }
  if (process.env.BRAIN_DISABLE === '1') {config.enabled = false;}
  return config;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {fs.mkdirSync(dir, { recursive: true });}
}

function backupBeforeWrite(filePath) {
  try {
    if (!fs.existsSync(filePath)) {return null;}
    const config = loadConfig();
    const backupDir = path.join(process.cwd(), '.opencode', 'backups');
    ensureDir(backupDir);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const relPath = path.relative(process.cwd(), filePath).replace(/[\\/]/g, '_');
    const backupFile = path.join(backupDir, `${ts}_${relPath}.bak`);
    fs.copyFileSync(filePath, backupFile);
    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.bak')).sort().reverse();
    if (files.length > config.backup.maxBackups) {
      files.slice(config.backup.maxBackups).forEach((f) => fs.unlinkSync(path.join(backupDir, f)));
    }
    return backupFile;
  } catch (e) {
    return null;
  }
}

class BrainBridge {
  constructor() {
    this._config = null;
    this._initialized = false;
    this._breaker = null;
    this._loopGuard = null;
    this._audit = null;
    this._brainSystem = null;
  }

  get enabled() { return this._config && this._config.enabled; }

  initialize() {
    if (this._initialized) {return;}
    this._config = loadConfig();
    if (!this.enabled) {return;}
    this._breaker = new CircuitBreaker(this._config.circuitBreaker);
    this._loopGuard = new LoopGuard(this._config.loopGuard);
    this._audit = new AuditLogger(this._config.audit);
    this._initialized = true;
  }

  _ensureBrain() {
    if (this._brainSystem) {return true;}
    try {
      this._brainSystem = require('./BrainSystem');
      return true;
    } catch (e) {
      if (this._audit) {this._audit.log({ level: 'error', module: 'bridge', action: 'brain_load_failed', error: e.message });}
      return false;
    }
  }

  process(input, taskType) {
    const start = Date.now();
    this.initialize();

    if (!this.enabled || !this._breaker.isAllowed()) {
      return this._emptyResult('disabled', start);
    }

    // 仅在需要执行时加载 BrainSystem
    if (!this._ensureBrain()) {
      return this._emptyResult('no_brain', start);
    }

    const loopCheck = this._loopGuard.check('brain-bridge', 'process');
    if (loopCheck.tripped) {
      this._audit.log({ level: 'warn', module: 'bridge', action: 'loop_tripped', detail: loopCheck });
      return { ...this._emptyResult('loop_guard', start), loopGuardTripped: true, blockedActions: [loopCheck.pattern] };
    }

    try {
      const result = this._execute(input, taskType, start);
      this._breaker.recordSuccess();
      this._audit.log({ level: 'info', module: 'bridge', action: 'success', durationMs: Date.now() - start });
      return result;
    } catch (e) {
      this._breaker.recordFailure();
      this._audit.log({ level: 'error', module: 'bridge', action: 'failed', error: e.message, durationMs: Date.now() - start });
      return this._emptyResult('error', start);
    }
  }

  _execute(input, taskType, startTime) {
    if (!this._brainSystem) {return this._emptyResult('no_brain', startTime || Date.now());}

    // 仅做轻量分析：analyzeIntent，跳过大闭环
    let intentType = null;
    let intentConfidence = 0;
    try {
      const ir = this._brainSystem.analyzeIntent ? this._brainSystem.analyzeIntent(input) : {};
      if (ir) {
        intentType = ir.intent || null;
        intentConfidence = ir.confidence || 0;
      }
    } catch (e) { /* */ }
    const resolvedType = taskType || this._resolveTaskType(intentType || input, input);

    let lessons = [];
    let warnings = [];
    try {
      const LessonReminder = require('./LessonReminder');
      const relevant = LessonReminder.getRelevantLessons(resolvedType, 5);
      lessons = relevant.map((l) => ({
        id: l.id || '',
        title: l.lesson || '',
        priority: l.priority || 'medium',
        category: l.category || '',
        effectiveness: l.effectiveness || 0
      }));
      warnings = relevant
        .filter((l) => l.priority === 'high' && (!l.useCount || l.useCount < 1))
        .map((l) => `${l.id}: ${l.lesson}`);
    } catch (e) { /* 教训加载不影响主流程 */ }

    // 从缓存文件读取主动状态，避免触发 BrainSystem 大闭环
    let proactive = {};
    try {
      const saved = JSON.parse(require('fs').readFileSync(require('path').join(process.cwd(), '.opencode', 'evolution', 'proactive.json'), 'utf8'));
      proactive = {
        interactionCount: saved.count || 0,
        topIntent: saved.topIntent || null
      };
    } catch (e) { /* */ }

    // Phase C: 运行时决策上下文
    let decisionContext = null;
    try {
      const DecisionContext = require('./DecisionContext');
      const dc = new DecisionContext({ audit: this._audit });
      decisionContext = dc.generate(input, resolvedType, lessons, { interactionCount: proactive.interactionCount, topIntent: proactive.topIntent });
    } catch (e) { /* decision context 不影响主流程 */ }

    // Phase C: 记录决策
    try {
      const DecisionTracker = require('./DecisionTracker');
      const dt = new DecisionTracker({ audit: this._audit });
      dt.record({ input, taskType: resolvedType, decision: 'processed', riskLevel: decisionContext ? decisionContext.riskLevel : 'low', lessonsApplied: lessons.filter((l) => l.priority === 'high').map((l) => l.id) });
    } catch (e) { /* 决策记录不影响主流程 */ }

    return {
      intent: { type: intentType, confidence: intentConfidence },
      taskType: resolvedType,
      lessons: lessons,
      warnings: warnings.slice(0, 3),
      suggestions: [],
      proactive: proactive,
      decisionContext: decisionContext,
      source: 'brain-bridge-v1',
      durationMs: Date.now() - (startTime || Date.now())
    };
  }

  _resolveTaskType(text, originalInput) {
    // 1. 精确匹配 intent
    const t = (text || '').toLowerCase().trim();
    if (t === 'security_check') {return 'security';}
    if (t === 'code_create' || t === 'code_edit' || t === 'code_review') {return 'code';}
    if (t === 'test_write' || t === 'test_run') {return 'test';}
    if (t === 'bug_fix') {return 'fix';}
    if (t === 'refactor' || t === 'optimize') {return 'refactor';}
    if (t === 'learn' || t === 'research') {return 'test';}
    if (t === 'deploy') {return 'deploy';}
    if (t === 'review') {return 'review';}

    // 2. fallback: 匹配原始输入关键词（按长度降序匹配，避免短词抢优先）
    const raw = (originalInput || text || '').toLowerCase();
    const rawMap = {
      '调试': 'fix', '异常': 'fix', '错误': 'fix', 'bug': 'fix', 'debug': 'fix',
      '安全': 'security', '审计': 'security', '漏洞': 'security',
      '测试': 'test', 'test': 'test',
      '部署': 'deploy', '发布': 'deploy',
      '审查': 'review',
      '优化': 'refactor', '性能': 'refactor', '重构': 'refactor',
      '函数': 'code', '代码': 'code',
      '写': 'code'
    };
    const sortedKeys = Object.keys(rawMap).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
      if (raw.includes(key)) {return rawMap[key];}
    }
    return 'default';
  }

  _emptyResult(reason, startTime) {
    return {
      intent: null, taskType: null, lessons: [], warnings: [],
      suggestions: [], proactive: {},
      source: 'brain-bridge-v1', error: reason, durationMs: Date.now() - startTime
    };
  }

  getStatus() {
    this.initialize();
    return {
      enabled: this.enabled,
      fullAuto: this._config ? !!this._config.fullAuto : false,
      breakerState: this._breaker ? this._breaker.state : 'UNKNOWN',
      breakerFailures: this._breaker ? this._breaker.failureCount : 0,
      loopTripped: this._loopGuard ? this._loopGuard.isTripped : false,
      initialized: this._initialized,
      hasBrain: !!this._brainSystem
    };
  }

  autoExecute(toolName, args) {
    this.initialize();
    if (!this.enabled) {return { executed: false, reason: 'disabled' };}
    if (!this._config || !this._config.fullAuto) {return { executed: false, reason: 'fullAuto_disabled' };}
    if (!this._breaker.isAllowed()) {return { executed: false, reason: 'breaker_open' };}

    const loopCheck = this._loopGuard.check('brain-bridge', 'autoExecute');
    if (loopCheck.tripped) {return { executed: false, reason: 'loop_guard', pattern: loopCheck.pattern };}

    // 风险分析
    const PreToolRiskAnalyzer = require('./PreToolRiskAnalyzer');
    const ra = new PreToolRiskAnalyzer({ audit: this._audit });
    const risk = ra.analyze(toolName, args, []);

    // BLOCK → 不执行
    if (risk.action === 'BLOCK') {
      if (this._audit) {this._audit.log({ level: 'warn', module: 'bridge', action: 'autoExecute_blocked', toolName, reason: risk.reason });}
      return { executed: false, reason: 'blocked_by_risk', risk };
    }

    // WARN → 检查白名单
    if (risk.action === 'WARN') {
      const whitelist = this._config.fullAutoWhitelist || [];
      const allowed = whitelist.some(function(w) { return toolName && toolName.toLowerCase().includes(w.toLowerCase()); });
      if (!allowed) {
        if (this._audit) {this._audit.log({ level: 'info', module: 'bridge', action: 'autoExecute_whitelist_skip', toolName });}
        return { executed: false, reason: 'not_in_whitelist', risk };
      }
    }

    // ALLOW (或 WARN + 在白名单中) → 执行
    try {
      const ToolExecutor = require('./ToolExecutor');
      const exe = new ToolExecutor();
      const result = exe.execute(args, { type: toolName });

      this._breaker.recordSuccess();
      if (this._audit) {this._audit.log({ level: 'info', module: 'bridge', action: 'autoExecute_success', toolName, durationMs: Date.now() - loopCheck.ts || Date.now() });}

      return { executed: true, result };
    } catch (e) {
      this._breaker.recordFailure();
      if (this._audit) {this._audit.log({ level: 'error', module: 'bridge', action: 'autoExecute_failed', toolName, error: e.message });}
      return { executed: false, reason: 'execution_error', error: e.message };
    }
  }

  emergencyStop() {
    this._config = loadConfig();
    this._config.enabled = false;
    try {
      const configPath = path.join(process.cwd(), '.opencode', 'brain.config.json');
      const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      existing.enabled = false;
      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));
    } catch (e) { /* */ }
    if (this._audit) {this._audit.log({ level: 'warn', module: 'bridge', action: 'emergency_stop' });}
  }

  backup(filePath) {
    return backupBeforeWrite(filePath);
  }

  diagnose(errorMessage, limit) {
    this.initialize();
    try {
      const AutoDiagnose = require('./AutoDiagnose');
      const diag = new AutoDiagnose({ audit: this._audit });
      const results = diag.diagnose(errorMessage, limit);
      if (this._audit) {this._audit.log({ level: 'info', module: 'bridge', action: 'diagnose', matches: results.length });}
      return results;
    } catch (e) {
      if (this._audit) {this._audit.log({ level: 'error', module: 'bridge', action: 'diagnose_failed', error: e.message });}
      return [];
    }
  }

  getLessonLearner() {
    try {
      const LessonLearner = require('./LessonLearner');
      const learnerCfg = (this._config && this._config.learner) || {};
      return new LessonLearner({ audit: this._audit, autoApprovalThreshold: learnerCfg.autoApprovalThreshold || 0.8, requireApproval: learnerCfg.requireApproval !== false });
    } catch (e) {
      return null;
    }
  }
}

module.exports = { BrainBridge, loadConfig, backupBeforeWrite };
