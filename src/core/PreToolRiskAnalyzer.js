const _fs = require('fs');
const _path = require('path');

const CRITICAL_PATHS = [
  'src/core/BrainSystem.js',
  'src/core/BrainBridge.js',
  'brain-bridge.js',
  'AGENTS.md'
];

const CONFIG_PATHS = [
  '.opencode/'
];

const GUARDRAIL_BASELINE = '.guardrail-baseline.json';

class PreToolRiskAnalyzer {
  constructor(options = {}) {
    this._lessonLib = options.lessonLib || null;
    this._audit = options.audit || null;
    this._baselineCache = null;
  }

  _loadBaseline() {
    if (this._baselineCache) {return this._baselineCache;}
    try {
      const cwd = process.cwd();
      const basePath = _path.join(cwd, GUARDRAIL_BASELINE);
      if (_fs.existsSync(basePath)) {
        const raw = JSON.parse(_fs.readFileSync(basePath, 'utf8'));
        const arr = Array.isArray(raw) ? raw : (raw && raw.perFile);
        const files = arr ? arr.map((e) => (e.file || '').replace(/\\/g, '/')) : [];
        this._baselineCache = new Set(files);
        return this._baselineCache;
      }
    } catch { /* baseline not available */ }
    this._baselineCache = new Set();
    return this._baselineCache;
  }

  analyze(toolName, args, lessons) {
    if (!toolName) {return { action: 'ALLOW', reason: 'no tool specified' };}

    const op = this._classifyOp(toolName, args);
    const targets = this._extractTargets(args);
    const fileRisk = targets.map((t) => this._classifyFile(t)).filter(Boolean);

    // BLOCK conditions — path traversal first
    const traversal = fileRisk.some((r) => r.traversal);
    if (traversal) {
      this._log('BLOCK', toolName, 'path traversal detected');
      return { action: 'BLOCK', reason: '\u8def\u5f84\u904d\u5386\u653b\u51fb', targets, traversal: true };
    }

    if (op === 'delete') {
      const critical = fileRisk.some((r) => r.level === 'critical');
      if (critical) {
        this._log('BLOCK', toolName, 'deleting critical file');
        return { action: 'BLOCK', reason: '\u7981\u6b62\u5220\u9664\u5173\u952e\u7cfb\u7edf\u6587\u4ef6', targets, lessonMatch: this._findMatch(lessons, 'delete') };
      }
      // 删除任意文件均为高风险 — 服务器写入 cwd，删 .env/config/数据文件不可逆
      if (targets.length > 0) {
        this._log('BLOCK', toolName, 'deleting file requires manual approval');
        return { action: 'BLOCK', reason: '\u5220\u9664\u6587\u4ef6\u9700\u624b\u52a8\u786e\u8ba4', targets, lessonMatch: this._findMatch(lessons, 'delete') };
      }
    }

    // BLOCK: shell 命令执行 — 任意 shell 执行均为高危险
    if (op === 'exec') {
      this._log('BLOCK', toolName, 'shell command execution');
      return { action: 'BLOCK', reason: '\u7981\u6b62\u6267\u884c shell \u547d\u4ee4', targets, exec: true };
    }

    // WARN conditions
    const warnings = [];
    if (op === 'write') {
      fileRisk.forEach((r) => {
        if (r.level === 'critical') {warnings.push(`\u4fee\u6539\u5173\u952e\u6587\u4ef6: ${r.path}`);}
        if (r.level === 'config') {warnings.push(`\u4fee\u6539\u914d\u7f6e\u6587\u4ef6: ${r.path}`);}
      });
    }
    if (op === 'delete') {
      // 删除任何文件都需确认（不只 critical）
      fileRisk.forEach((r) => {
        if (r.level === 'critical') {warnings.push(`\u5220\u9664\u5173\u952e\u6587\u4ef6: ${r.path}`);}
        if (r.level === 'config') {warnings.push('删除配置文件需确认备份');}
      });
      if (targets.length > 0 && warnings.length === 0) {
        warnings.push(`\u5220\u9664\u6587\u4ef6\u9700\u786e\u8ba4: ${targets.join(', ')}`);
      }
    }

    // Guardrail baseline check — warn if modifying a baselined file
    if (op === 'write' || op === 'delete') {
      const baseline = this._loadBaseline();
      if (baseline.size > 0) {
        targets.forEach((t) => {
          const norm = t.replace(/\\/g, '/');
          if (baseline.has(norm)) {
            warnings.push(`文件在防护基线中: ${norm}`);
          }
        });
      }
    }

    // Security lesson match — 学习到的教训驱动风险判断
    const secMatch = this._findMatch(lessons, 'security');
    if (secMatch && (op === 'write' || op === 'delete' || op === 'exec')) {
      const lessonText = secMatch.lesson || secMatch.problem || '';
      const isHighRisk = secMatch.priority === 'high' ||
        (secMatch.tags || []).some((t) => /security|danger|危险|高危|敏感/i.test(String(t))) ||
        /security|危险|高危|敏感|删除|覆盖|注入/i.test(String(lessonText));
      if (isHighRisk) {
        this._log('BLOCK', toolName, `high-risk lesson matched: ${secMatch.lesson || secMatch.id || ''}`);
        return {
          action: 'BLOCK',
          reason: `\u547d\u4e2d\u9ad8\u98ce\u9669\u6559\u8bad: ${(secMatch.lesson || secMatch.id || '').substring(0, 80)}`,
          targets,
          lessonMatch: secMatch,
          lessonDriven: true
        };
      }
      warnings.push(`\u76f8\u5173\u5b89\u5168\u6559\u8bad: ${secMatch.lesson || secMatch.id || ''}`);
    }

    if (warnings.length > 0) {
      this._log('WARN', toolName, warnings.join('; '));
      return { action: 'WARN', reason: warnings.join('; '), targets, warnings };
    }

    return { action: 'ALLOW', reason: 'ok', targets };
  }

  _classifyOp(toolName, args) {
    // 提取工具名（去掉 server: 前缀，避免 s1:exec 无法匹配）
    let name = (toolName || '').toLowerCase();
    if (name.includes(':')) {name = name.split(':').pop();}
    const a = JSON.stringify(args || {}).toLowerCase();
    if (name.includes('delete') || name.includes('remove') || name.includes('unlink') || a.includes('delete')) {return 'delete';}
    if (name.includes('write') || name.includes('edit') || name.includes('create') || name.includes('modify') || a.includes('write') || a.includes('overwrite')) {return 'write';}
    if (name.includes('read') || name.includes('get') || name.includes('list') || name.includes('search')) {return 'read';}
    if (name.includes('shell') || name.includes('bash') || name.includes('terminal') || name.includes('exec_command') || name.includes('run_command') || name.includes('execute_command') || name === 'exec' || a.includes('"command"') || a.includes('"shell"') || a.includes('"exec"')) {return 'exec';}
    return 'unknown';
  }

  _extractTargets(args) {
    const targets = [];
    if (!args) {return targets;}
    const a = typeof args === 'string' ? args : JSON.stringify(args);
    // eslint-disable-next-line security/detect-unsafe-regex
    const fileMatches = a.match(/["']((?:[^"']*\/)?(?:src|\.opencode|AGENTS|\.\.)[^"']*)["']/gi);
    if (fileMatches) {fileMatches.forEach((m) => targets.push(m.replace(/["']/g, '')));}
    // Also find any path with '..' that might not have been caught
    const traversalMatches = a.match(/["'](\.\.[/\\][^"']*)["']/gi);
    if (traversalMatches) {traversalMatches.forEach((m) => {
      const p = m.replace(/["']/g, '');
      if (!targets.includes(p)) {targets.push(p);}
    });}
    // Extract explicit path-ish args (path/filePath/target/file) for op-aware target capture
    const argObj = typeof args === 'string' ? (() => { try {return JSON.parse(args);} catch {return null;} })() : args;
    if (argObj && typeof argObj === 'object') {
      for (const key of ['path', 'filePath', 'file', 'target', 'filename']) {
        if (typeof argObj[key] === 'string') {
          const p = argObj[key].replace(/\\/g, '/');
          if (!targets.includes(p)) {targets.push(p);}
        }
      }
    }
    return targets;
  }

  _classifyFile(filePath) {
    if (!filePath) {return null;}
    const normal = filePath.replace(/\\/g, '/');
    if (normal.includes('/../') || normal.startsWith('../')) {return { path: normal, level: 'critical', traversal: true };}
    if (CRITICAL_PATHS.some((p) => normal.includes(p))) {return { path: normal, level: 'critical' };}
    if (CONFIG_PATHS.some((p) => normal.includes(p))) {return { path: normal, level: 'config' };}
    if (normal.startsWith('.opencode/')) {return { path: normal, level: 'config' };}
    return null;
  }

  _findMatch(lessons, keyword) {
    if (!lessons || !Array.isArray(lessons)) {return null;}
    return lessons.find((l) =>
      l.category === keyword ||
      (l.tags || []).includes(keyword) ||
      (typeof l.lesson === 'string' && l.lesson.includes(keyword)) ||
      (typeof l.problem === 'string' && l.problem.includes(keyword))
    );
  }

  _log(action, tool, reason) {
    if (this._audit) {
      this._audit.log({ level: action === 'BLOCK' ? 'warn' : 'info', module: 'risk', action: `pre_tool_${action.toLowerCase()}`, tool, reason });
    }
  }
}

module.exports = PreToolRiskAnalyzer;
