const chokidar = require('chokidar');
const path = require('path');
const { scanFiles } = require('../../scripts/security-scan');

const ROOT = path.resolve(__dirname, '../..');
const WATCH_DIRS = [
  path.join(ROOT, 'src'),
  path.join(ROOT, 'server'),
  path.join(ROOT, 'scripts')
];
const IGNORE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /dist/,
  /coverage/,
  /test\//,
  /tests\//,
  /\.test\./,
  /\.spec\./
];

function isIgnored(filePath) {
  return IGNORE_PATTERNS.some((p) => p.test(filePath));
}

const DEBOUNCE_MS = 300;
let debounceTimer = null;
const pendingFiles = new Set();
let _blockOnHigh = false;

function flushScan() {
  const files = [...pendingFiles].filter((f) => !isIgnored(f) && f.endsWith('.js'));
  pendingFiles.clear();
  if (files.length === 0) { return; }
  try {
    const results = scanFiles(files);
    const highs = results.filter((r) => r.severity === 'HIGH');
    const mediums = results.filter((r) => r.severity === 'MEDIUM');
    if (highs.length > 0) {
      console.error(`\x1b[31m🔴 [SECURITY] ${highs.length} HIGH severity issue(s) found:\x1b[0m`);
      highs.forEach((h) => console.error(`  ${h.file}:${h.message}`));
      if (_blockOnHigh) {
        console.error(`\x1b[31m🔴 [SECURITY] Blocking due to ${highs.length} HIGH issue(s)\x1b[0m`);
      }
    }
    if (mediums.length > 0) {
      console.log(`\x1b[33m🟡 [SECURITY] ${mediums.length} MEDIUM severity issue(s) found\x1b[0m`);
    }
  } catch (err) {
    console.error(`\x1b[31m[SECURITY] Scan error: ${err.message}\x1b[0m`);
  }
}

/**
 * 启动安全文件监控
 * @param {object} [options]
 * @param {boolean} [options.blockOnHigh=false] - HIGH 违规是否阻塞
 * @returns {import('chokidar').FSWatcher}
 */
function startSecurityMonitor(options = {}) {
  _blockOnHigh = options.blockOnHigh === true;
  const watcher = chokidar.watch(WATCH_DIRS, {
    ignored: IGNORE_PATTERNS,
    ignoreInitial: true,
    persistent: true
  });

  const onFileEvent = (filePath) => {
    pendingFiles.add(filePath);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flushScan, DEBOUNCE_MS);
  };

  watcher.on('change', onFileEvent);
  watcher.on('add', onFileEvent);

  console.log(`\x1b[36m🔒 Security monitor active (watching ${WATCH_DIRS.length} dirs)\x1b[0m`);
  return watcher;
}

function stopSecurityMonitor(watcher) {
  if (watcher) { watcher.close(); }
}

module.exports = { startSecurityMonitor, stopSecurityMonitor };
