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

// Manual name->test mappings (for when toKebab doesn't match the test name exactly)
const manualToTest = {
  'DataMaskingEngine': 'data-masking',
  'UltraWorkUtils': 'ultrawork-utils',
  'HookIndex': 'hooks-index',
  'modelLicenseChecker': 'model-license-checker',
};

// Entry/special files to exclude
const neverTest = new Set([
  'BrainSystem', 'UltraWorkCLI', 'DAGEngine', 'DAGEngineAdvanced', 'Coordinator',
  'OpenAPIGenerator', 'ChatWebSocketHandler', 'GameWebSocket', 'brain-full-check',
  'launch-router', 'learnEval', 'learnEvalFinal', 'learnEvalMonitoring',
  'index', 'IntegrationTests',
]);

// Hard I/O patterns (files that do actual I/O)
const ioPatterns = [
  ['fs', /require\(['\u0060"]fs['\u0060"]\)/],
  ['http', /require\(['\u0060"]http['\u0060"]\)/],
  ['https', /require\(['\u0060"]https['\u0060"]\)/],
  ['net', /require\(['\u0060"]net['\u0060"]\)/],
  ['child_process', /require\(['\u0060"]child_process['\u0060"]\)/],
  ['express', /require\(['\u0060"]express['\u0060"]\)/],
  ['ws', /require\(['\u0060"]ws['\u0060"]\)/],
  ['discord', /discord\./i],
  ['playwright', /playwright/i],
  ['puppeteer', /puppeteer/i],
  ['redis', /redis/i],
  ['mongodb', /mongodb/i],
  ['pg', /\bpg\b/i],
  ['mysql', /mysql/i],
];

// I/O method patterns (files that call I/O operations)
const ioMethodPatterns = [
  [/\.listen\(/, '.listen()'],
  [/router\.(?:get|post|put|delete)\b/, 'router.*'],
  [/app\.(?:get|post|put|delete|use)\b/, 'app.*'],
  [/new\s+WebSocket\b/, 'new WebSocket'],
  [/ws\.on\(/, 'ws.on'],
];

function walkDir(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.endsWith('.js') && !entry.endsWith('.test.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

const srcFiles = walkDir('src');

// Line counts
const lineCounts = {};
const fileContents = {};
for (const file of srcFiles) {
  const c = fs.readFileSync(file, 'utf-8');
  fileContents[file] = c;
  lineCounts[file] = c.split('\n').length;
}

const results = { covered: [], io: [], entry: [], small: [], pureUncovered: [] };

for (const file of srcFiles) {
  const baseName = path.basename(file, '.js');
  const dir = path.dirname(file);
  const relDir = dir.replace(/\\/g, '/').replace(/^.*?\/src\//, '');
  const lineCount = lineCounts[file];
  
  // Check test coverage
  let testName = toKebab(baseName);
  if (manualToTest[baseName]) testName = manualToTest[baseName];
  
  let isCovered = testFiles.has(testName);
  
  // BrainSystem has inline test
  if (baseName === 'BrainSystem') isCovered = true;
  
  if (isCovered) {
    results.covered.push({ file, lines: lineCount, test: testName });
    continue;
  }
  
  if (lineCount < 50) {
    results.small.push(file);
    continue;
  }
  
  // Check for excluded files
  if (neverTest.has(baseName)) {
    results.entry.push({ file, lines: lineCount, reason: 'never-test' });
    continue;
  }
  
  // Directory-based exclusions
  const inEntryDir = relDir.startsWith('server') || relDir.startsWith('docs') || relDir.startsWith('social') || relDir.startsWith('daemon');
  const isMiddleware = relDir.startsWith('middleware');
  const isChat = relDir.startsWith('chat');
  const isMultiagentEx = file.includes('multiagent\\examples');
  
  if (inEntryDir || isMiddleware || isChat || isMultiagentEx) {
    results.entry.push({ file, lines: lineCount, reason: 'dir: ' + relDir });
    continue;
  }
  
  const content = fileContents[file];
  
  // Check for I/O
  let ioMatch = null;
  for (const [name, re] of ioPatterns) {
    if (re.test(content)) {
      ioMatch = name;
      break;
    }
  }
  
  if (!ioMatch) {
    for (const [re, desc] of ioMethodPatterns) {
      if (re.test(content)) {
        ioMatch = desc;
        break;
      }
    }
  }
  
  if (ioMatch) {
    results.io.push({ file, lines: lineCount, io: ioMatch });
    continue;
  }
  
  // Gather metadata
  const classMatch = content.match(/class\s+(\w+)/);
  const deps = [];
  const stdDeps = ['events', 'crypto', 'path', 'util', 'url', 'stream', 'os', 'zlib', 'assert', 'buffer', 'string_decoder'];
  for (const dep of stdDeps) {
    const re = new RegExp("require\\(['\u0060\"]" + dep + "['\u0060\"]\\)");
    if (re.test(content)) deps.push(dep);
  }
  const hasExports = /module\.exports|export\s+/.test(content);
  
  results.pureUncovered.push({
    file,
    lines: lineCount,
    className: classMatch ? classMatch[1] : null,
    deps: deps.length > 0 ? deps.join(', ') : 'none',
    hasExports
  });
}

// Summary
console.log('=== SUMMARY ===');
console.log('Covered by test: ' + results.covered.length);
console.log('Filtered - I/O (' + results.io.length + '):');
for (const f of results.io) {
  const short = f.file.replace(/\\/g, '/').replace(/^.*?\/src\//, 'src/');
  console.log('  ' + short + ' (' + f.lines + ' lines) - ' + f.io);
}
console.log('Filtered - Entry/Special (' + results.entry.length + '):');
for (const f of results.entry) {
  const short = f.file.replace(/\\/g, '/').replace(/^.*?\/src\//, 'src/');
  console.log('  ' + short + ' (' + f.lines + ' lines) - ' + f.reason);
}
console.log('Filtered - Small (<50): ' + results.small.length);
console.log('UNCOVERED PURE-LOGIC: ' + results.pureUncovered.length);

// Group by directory
const byDir = {};
for (const f of results.pureUncovered) {
  const d = path.dirname(f.file).replace(/\\/g, '/').replace(/^.*?\/src\//, '');
  if (!byDir[d]) byDir[d] = [];
  byDir[d].push(f);
}

console.log('\n=== UNCOVERED PURE-LOGIC FILES ===');
for (const [dir, files] of Object.entries(byDir).sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log('\n## ' + dir + '/ (' + files.length + ' files)');
  files.sort((a, b) => b.lines - a.lines);
  for (const f of files) {
    const shortPath = f.file.replace(/\\/g, '/').replace(/^.*?\/src\//, '');
    const cls = f.className || 'N/A';
    const expectedTest = toKebab(f.className || path.basename(f.file, '.js'));
    console.log('  ' + shortPath + ' (' + f.lines + ' lines) class=' + cls + ' test=' + expectedTest);
  }
}
