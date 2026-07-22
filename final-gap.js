const fs = require('fs');
const path = require('path');

const testFiles = new Set(
  fs.readdirSync('tests/unit')
    .filter(f => f.endsWith('.test.js'))
    .map(f => f.replace('.test.js', ''))
);

function toKebab(str) {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch >= 'A' && ch <= 'Z') {
      const next = i + 1 < str.length ? str[i + 1] : '';
      const prev = i > 0 ? str[i - 1] : '';
      if (prev && prev >= 'a' && prev <= 'z') {
        result += '-' + ch.toLowerCase();
      } else if (prev && prev >= 'A' && prev <= 'Z' && next && next >= 'a' && next <= 'z') {
        result += '-' + ch.toLowerCase();
      } else {
        result += ch.toLowerCase();
      }
    } else {
      result += ch;
    }
  }
  return result;
}

const manualToTest = {
  'DataMaskingEngine': 'data-masking',
  'UltraWorkUtils': 'ultrawork-utils',
  'HookIndex': 'hooks-index',
  'modelLicenseChecker': 'model-license-checker',
};

const neverTest = new Set([
  'BrainSystem', 'UltraWorkCLI', 'DAGEngine', 'DAGEngineAdvanced', 'Coordinator',
  'OpenAPIGenerator', 'ChatWebSocketHandler', 'GameWebSocket', 'brain-full-check',
  'launch-router', 'learnEval', 'learnEvalFinal', 'learnEvalMonitoring', 'electronStub',
  'index', 'IntegrationTests',
]);

const entryDirs = ['server', 'docs', 'social', 'daemon'];

function walkDir(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      results.push(...walkDir(full));
    } else if (entry.endsWith('.js') && !entry.endsWith('.test.js')) {
      results.push(full);
    }
  }
  return results;
}

const bt = String.fromCharCode(96);

const ioPatterns = [
  new RegExp("require\\(['" + bt + "\"]fs['" + bt + "\"]\\)"),
  new RegExp("require\\(['" + bt + "\"]http['" + bt + "\"]\\)"),
  new RegExp("require\\(['" + bt + "\"]https['" + bt + "\"]\\)"),
  new RegExp("require\\(['" + bt + "\"]net['" + bt + "\"]\\)"),
  new RegExp("require\\(['" + bt + "\"]child_process['" + bt + "\"]\\)"),
  new RegExp("require\\(['" + bt + "\"]express['" + bt + "\"]\\)"),
  new RegExp("require\\(['" + bt + "\"]ws['" + bt + "\"]\\)"),
  /discord/i,
  /playwright/i,
  /puppeteer/i,
  /redis/i,
  /mongodb/i,
  /\bpg\b/i,
  /mysql/i,
];

const srcFiles = walkDir('src');
const uncovered = [];

for (const file of srcFiles) {
  const base = path.basename(file, '.js');
  const dir = path.dirname(file);
  const relDir = dir.replace(/\\/g, '/').replace(/^.*?\/src\//, '');
  const c = fs.readFileSync(file, 'utf-8');
  const lines = c.split('\n').length;

  const tn = manualToTest[base] || toKebab(base);
  if (testFiles.has(tn)) continue;
  if (base === 'BrainSystem') continue;
  if (lines < 50) continue;
  if (neverTest.has(base)) continue;

  if (entryDirs.some(d => relDir.startsWith(d))) continue;
  if (relDir.startsWith('middleware') || relDir.startsWith('chat')) continue;
  if (file.indexOf('multiagent\\examples') >= 0) continue;

  let hasIO = false;
  for (const re of ioPatterns) {
    if (re.test(c)) { hasIO = true; break; }
  }
  if (hasIO) continue;

  if (base === 'DynamicScraper') continue;
  if (base === 'PlatformBridge' && relDir === 'integration') continue;
  if (base === 'templates' && relDir.indexOf('industry') >= 0) continue;

  const classMatch = c.match(/class\s+(\w+)/);
  const cls = classMatch ? classMatch[1] : null;
  const deps = [];
  const stdDeps = ['events', 'crypto', 'path', 'util', 'url', 'stream', 'os', 'zlib', 'assert', 'buffer'];
  for (const dep of stdDeps) {
    const re = new RegExp("require\\(['" + bt + "\"]" + dep + "['" + bt + "\"]\\)");
    if (re.test(c)) deps.push(dep);
  }

  const testName = toKebab(cls || base);

  // Simple why
  let why = '';
  const allStdDeps = ['events', 'crypto', 'path', 'util', 'url', 'stream', 'os', 'zlib', 'assert', 'buffer', 'string_decoder', 'punycode'];
  const cRequires = c.match(/require\(['"][^')]+['"]\)/g) || [];
  const extModules = [];
  for (const r of cRequires) {
    const m = r.match(/require\(['"]([^.'"\/]+)['"]\)/);
    if (m && !allStdDeps.includes(m[1]) && !extModules.includes(m[1]) && m[1] !== fs && m[1] !== path && !m[1].startsWith('.') && !m[1].startsWith('/')) {
      extModules.push(m[1]);
    }
  }
  if (extModules.length > 0) {
    why = 'Depends on npm packages: ' + extModules.join(', ') + ' (not I/O)';
  } else if (deps.length > 0) {
    why = 'Uses stdlib (' + deps.join(', ') + ') only, no I/O';
  } else {
    why = 'Zero dependencies, pure algorithmic logic';
  }

  uncovered.push({
    file: file.replace(/\\/g, '/'),
    lines,
    className: cls || 'module/function',
    depsStr: deps.length > 0 ? deps.join(', ') : 'none',
    testName,
    why
  });
}

const byDir = {};
for (const f of uncovered) {
  const d = f.file.replace(/^.*?\/src\//, '').replace(/\/[^\/]+$/, '');
  if (!byDir[d]) byDir[d] = [];
  byDir[d].push(f);
}

for (const dir of Object.keys(byDir).sort()) {
  const files = byDir[dir].sort((a, b) => b.lines - a.lines);
  console.log('## ' + dir + '/ (' + files.length + ' files)');
  console.log('');
  for (const f of files) {
    const short = f.file.replace(/^.*?\/src\//, 'src/');
    console.log('### ' + short + ' (' + f.lines + ' lines)');
    console.log('Deps: ' + f.depsStr);
    console.log('Exports: ' + f.className);
    console.log('Test name: ' + f.testName);
    console.log('Why pure: ' + f.why);
    console.log('');
  }
}

console.log('=== SUMMARY ===');
console.log('Total uncovered pure-logic files: ' + uncovered.length);
