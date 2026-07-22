#!/usr/bin/env node
const { BrainBridge, backupBeforeWrite } = require('./src/core/BrainBridge');

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help') {
  console.log(JSON.stringify({
    usage: 'node brain-bridge.js <input> [taskType]',
    commands: {
      '--status': '显示大脑桥接状态',
      '--disable': '紧急停用',
      '--enable': '重新启用',
      '--reset': '重置断路器',
      '--backup <file>': '手动备份文件',
      '--diagnose <error>': '诊断错误匹配教训',
      '--daemon start|stop|status': '后台守护进程',
      '--pending': '查看待审核教训',
      '--approve <id>': '批准待审核教训',
      '--reject <id>': '拒绝待审核教训',
      '--decisions [n]': '查看最近决策记录',
      '--advise': '主动改进建议',
      '--help': '显示帮助'
    }
  }));
  process.exit(0);
}

if (args[0] === '--status') {
  const bridge = new BrainBridge();
  bridge.initialize();
  const status = bridge.getStatus();
  try {
    const fs = require('fs');
    const p = require('path').join(process.cwd(), '.opencode', 'evolution', 'proactive.json');
    if (fs.existsSync(p)) {
      const ps = JSON.parse(fs.readFileSync(p, 'utf8'));
      status.proactive = { interactionCount: ps.count || 0, topIntent: ps.topIntent || null };
    }
  } catch (e) { /* */ }
  console.log(JSON.stringify(status, null, 2));
  process.exit(0);
}

if (args[0] === '--disable') {
  const bridge = new BrainBridge();
  bridge.emergencyStop();
  console.log(JSON.stringify({ status: 'disabled', message: 'BrainSystem 已停用' }));
  process.exit(0);
}

if (args[0] === '--enable') {
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(process.cwd(), '.opencode', 'brain.config.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    cfg.enabled = true;
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    console.log(JSON.stringify({ status: 'enabled', message: 'BrainSystem 已启用' }));
  } catch (e) {
    console.log(JSON.stringify({ status: 'error', message: e.message }));
  }
  process.exit(0);
}

if (args[0] === '--reset') {
  const CircuitBreaker = require('./src/core/CircuitBreaker');
  const cb = new CircuitBreaker();
  cb.reset();
  console.log(JSON.stringify({ status: 'reset', message: '断路器已重置' }));
  process.exit(0);
}

if (args[0] === '--backup') {
  const result = backupBeforeWrite(args[1]);
  console.log(JSON.stringify({ status: result ? 'ok' : 'skipped', backup: result }));
  process.exit(0);
}

if (args[0] === '--diagnose') {
  const bridge = new BrainBridge();
  bridge.initialize();
  const results = bridge.diagnose(args[1] || '');
  console.log(JSON.stringify({ matches: results }));
  process.exit(0);
}

if (args[0] === '--daemon') {
  const action = args[1] || 'status';
  const { spawn } = require('child_process');
  const daemonPath = require('path').join(__dirname, 'src', 'daemon', 'index.js');
  if (action === 'start') {
    const child = spawn(process.execPath, [daemonPath, 'start'], { detached: true, stdio: 'ignore', env: { ...process.env } });
    child.unref();
    console.log(JSON.stringify({ status: 'launched', pid: child.pid }));
  } else if (action === 'stop' || action === 'status') {
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, [daemonPath, action], { encoding: 'utf8', timeout: 5000 });
    console.log(r.stdout.trim());
  } else {
    console.log(JSON.stringify({ status: 'error', message: 'unsupported action: ' + action }));
  }
  process.exit(0);
}

if (args[0] === '--pending') {
  try {
    const p = require('path').join(process.cwd(), '.opencode', 'evolution', 'pending-lessons.json');
    const fs = require('fs');
    if (!fs.existsSync(p)) { console.log(JSON.stringify({ pending: [] })); process.exit(0); }
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    console.log(JSON.stringify({ pending: data }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message }));
  }
  process.exit(0);
}

if (args[0] === '--approve') {
  const bridge = new BrainBridge();
  bridge.initialize();
  const learner = bridge.getLessonLearner();
  if (!learner) { console.log(JSON.stringify({ error: 'learner_unavailable' })); process.exit(1); }
  const result = learner.approveLesson(args[1], { lesson: args[2] || undefined, improvement: args[3] || undefined });
  console.log(JSON.stringify(result));
  process.exit(0);
}

if (args[0] === '--reject') {
  const bridge = new BrainBridge();
  bridge.initialize();
  const learner = bridge.getLessonLearner();
  if (!learner) { console.log(JSON.stringify({ error: 'learner_unavailable' })); process.exit(1); }
  const result = learner.rejectLesson(args[1]);
  console.log(JSON.stringify(result));
  process.exit(0);
}

if (args[0] === '--decisions') {
  try {
    const DecisionTracker = require('./src/core/DecisionTracker');
    const dt = new DecisionTracker();
    const limit = parseInt(args[1], 10) || 20;
    const history = dt.getHistory(limit);
    const stats = dt.getStats();
    console.log(JSON.stringify({ history, stats }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message }));
  }
  process.exit(0);
}

if (args[0] === '--advise') {
  try {
    const ProactiveAdvisor = require('./src/core/ProactiveAdvisor');
    const pa = new ProactiveAdvisor();
    const result = pa.getStatus();
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message }));
  }
  process.exit(0);
}

const input = args[0];
const taskType = args[1] || undefined;

const timeoutMs = 5000;
const timer = setTimeout(() => {
  console.log(JSON.stringify({
    intent: null, taskType: null, lessons: [], warnings: [],
    suggestions: [], proactive: {},
    source: 'brain-bridge-v1', error: 'timeout', durationMs: timeoutMs
  }));
  process.exit(0);
}, timeoutMs);

try {
  const bridge = new BrainBridge();
  const result = bridge.process(input, taskType);
  clearTimeout(timer);
  console.log(JSON.stringify(result));
} catch (e) {
  clearTimeout(timer);
  console.log(JSON.stringify({
    intent: null, taskType: null, lessons: [], warnings: [],
    suggestions: [], proactive: {},
    source: 'brain-bridge-v1', error: e.message, durationMs: 0
  }));
}
