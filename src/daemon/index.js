#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const O_DIR = path.join(process.cwd(), '.opencode');
const BACKUP_DIR = path.join(O_DIR, 'backups');
const EVO_DIR = path.join(O_DIR, 'evolution');
const PID_FILE = path.join(process.cwd(), '.opencode', 'daemon.pid');

class Daemon {
  constructor() {
    this._watcher = null;
    this._healthTimer = null;
    this._cleanTimer = null;
    this._proactiveTimer = null;
    this._running = false;
    this._audit = null;
    this.securityWatcher = null;
    this._config = this._loadConfig();
    if (this._config.audit) {
      const AuditLogger = require('../core/AuditLogger');
      this._audit = new AuditLogger(this._config.audit);
    }
  }

  _loadConfig() {
    const configPath = path.join(O_DIR, 'brain.config.json');
    try {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    } catch (e) { /* */ }
    return {
      daemon: { healthIntervalMs: 300000, cleanIntervalMs: 3600000 },
      backup: { maxBackups: 30, minDiskSpaceMB: 100 }
    };
  }

  start() {
    if (this._running) {
      console.log(JSON.stringify({ status: 'already_running' }));
      return;
    }

    this._ensureDirs();
    this._savePid();

    this._watcher = fs.watch(O_DIR, { recursive: true }, (eventType, filename) => {
      if (filename && !filename.includes('audit') && !filename.includes('daemon')) {
        this._log('info', 'file_change', { event: eventType, file: filename });
      }
    });

    const hInterval = (this._config.daemon && this._config.daemon.healthIntervalMs) || 300000;
    this._healthTimer = setInterval(() => this._healthCheck(), hInterval);

    const cInterval = (this._config.daemon && this._config.daemon.cleanIntervalMs) || 3600000;
    this._cleanTimer = setInterval(() => this._cleanBackups(), cInterval);

    // 主动扫描: 定期调用 ProactiveAdvisor
    if (this._config.proactive && this._config.proactive.enabled !== false) {
      const pInterval = (this._config.proactive && this._config.proactive.scanIntervalMs) || 3600000;
      this._proactiveTimer = setInterval(() => this._proactiveScan(), pInterval);
      this._log('info', 'daemon_proactive_start', { scanIntervalMs: pInterval });
    }

    this._running = true;
    this._log('info', 'daemon_start', { healthIntervalMs: hInterval, cleanIntervalMs: cInterval });
    console.log(JSON.stringify({ status: 'started', pid: process.pid }));

    if (!process.argv.includes('--no-security')) {
      const { startSecurityMonitor } = require('./securityMonitor');
      this.securityWatcher = startSecurityMonitor({
        blockOnHigh: process.env.NODE_ENV === 'production'
      });
    }
  }

  _proactiveScan() {
    try {
      const ProactiveAdvisor = require('../core/ProactiveAdvisor');
      const pa = new ProactiveAdvisor();
      const result = pa.scan();
      if (result && result.length > 0) {
        this._log('info', 'proactive_scan', { suggestions: result.length, types: result.map(function(r) { return r.type; }).join(',') });
      }
    } catch (e) {
      this._log('error', 'proactive_scan_failed', { error: e.message });
    }
  }

  stop() {
    if (this._watcher) { this._watcher.close(); this._watcher = null; }
    if (this._healthTimer) { clearInterval(this._healthTimer); this._healthTimer = null; }
    if (this._cleanTimer) { clearInterval(this._cleanTimer); this._cleanTimer = null; }
    if (this._proactiveTimer) { clearInterval(this._proactiveTimer); this._proactiveTimer = null; }
    if (this.securityWatcher) {
      const { stopSecurityMonitor } = require('./securityMonitor');
      stopSecurityMonitor(this.securityWatcher);
      this.securityWatcher = null;
    }
    this._running = false;
    this._removePid();
    this._log('info', 'daemon_stop', {});
    console.log(JSON.stringify({ status: 'stopped' }));
  }

  status() {
    return {
      running: this._running,
      pid: process.pid,
      health: this._running ? 'ok' : 'stopped',
      backups: this._countBackups(),
      diskSpaceMB: this._diskSpace(),
      uptime: process.uptime()
    };
  }

  _ensureDirs() {
    [BACKUP_DIR, EVO_DIR].forEach((d) => { if (!fs.existsSync(d)) {fs.mkdirSync(d, { recursive: true });} });
  }

  _savePid() {
    try {
      fs.writeFileSync(PID_FILE, String(process.pid));
    } catch (e) { /* */ }
  }

  _removePid() {
    try { if (fs.existsSync(PID_FILE)) {fs.unlinkSync(PID_FILE);} } catch (e) { /* */ }
  }

  static readPid() {
    try {
      if (fs.existsSync(PID_FILE)) {return parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);}
    } catch (e) { /* */ }
    return null;
  }

  _healthCheck() {
    const health = {
      ts: new Date().toISOString(),
      diskSpaceMB: this._diskSpace(),
      backupCount: this._countBackups()
    };

    if (health.diskSpaceMB < 100) {
      this._log('warn', 'low_disk', health);
    }

    if (health.backupCount > 50) {
      this._cleanBackups();
    }

    return health;
  }

  _cleanBackups() {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {return;}
      const files = fs.readdirSync(BACKUP_DIR)
        .filter((f) => f.endsWith('.bak'))
        .map((f) => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);

      const maxBackups = (this._config.backup && this._config.backup.maxBackups) || 30;
      if (files.length <= maxBackups) {return;}

      const toRemove = files.slice(maxBackups);
      toRemove.forEach((f) => fs.unlinkSync(path.join(BACKUP_DIR, f.name)));
      this._log('info', 'backup_clean', { removed: toRemove.length, kept: maxBackups });
    } catch (e) {
      this._log('error', 'backup_clean_failed', { error: e.message });
    }
  }

  _diskSpace() {
    try {
      const stats = fs.statfsSync(O_DIR);
      return Math.round(stats.bfree * stats.bsize / (1024 * 1024));
    } catch (e) {
      return -1;
    }
  }

  _countBackups() {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {return 0;}
      return fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.bak')).length;
    } catch (e) { return 0; }
  }

  _log(level, action, data) {
    if (this._audit) {
      this._audit.log({ level, module: 'daemon', action, ...data });
    }
  }
}

function startDaemon() {
  const d = new Daemon();
  d.start();
  process.on('SIGINT', () => { d.stop(); process.exit(0); });
  process.on('SIGTERM', () => { d.stop(); process.exit(0); });
  process.on('uncaughtException', (e) => {
    d._log('error', 'uncaught', { error: e.message });
  });
}

function stopDaemon() {
  const pid = Daemon.readPid();
  if (!pid) {
    console.log(JSON.stringify({ status: 'not_running' }));
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    console.log(JSON.stringify({ status: 'stopping', pid }));
  } catch (e) {
    console.log(JSON.stringify({ status: 'error', message: e.message }));
  }
}

function statusDaemon() {
  const d = new Daemon();
  const s = d.status();
  s.pidFile = Daemon.readPid();
  console.log(JSON.stringify(s, null, 2));
}

const action = process.argv[2];
if (action === 'start') {startDaemon();}
else if (action === 'stop') {stopDaemon();}
else if (action === 'status') {statusDaemon();}
else {
  console.log(JSON.stringify({
    usage: 'node src/daemon/index.js <action>',
    actions: { start: '启动守护进程', stop: '停止守护进程', status: '查看状态' }
  }));
}
