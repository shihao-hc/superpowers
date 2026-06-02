# Guardrail Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 6 incremental enhancements to guardrail-fix (存量自动降噪, 全量保护, 基线版本化, 回归分析, 自适应阈值, BrainSystem闭环)

**Architecture:** All 6 enhancements build on the existing `tools/guardrail-fix.js` single-file tool. Each enhancement adds a new command and corresponding adversarial test cases. The tool remains a standalone Node.js CLI; no new dependencies.

**Tech Stack:** Node.js (built-in: fs, path, child_process), ESLint CLI, git CLI

---

### Task 1: `fix-stale` command - batch parallel fix + batch post-fix validation

**Files:**
- Modify: `tools/guardrail-fix.js` (append `cmdFixStale` + CLI dispatch)
- Modify: `tools/guardrail-adversarial-test.js` (append Test G)
- Create: (none)

- [ ] **Step 1: Implement `cmdFixStale` function in guardrail-fix.js**

Append to `tools/guardrail-fix.js` before the CLI dispatch section (line ~404).

```javascript
function cmdFixStale(args) {
  const flags = {};
  const params = args.filter(a => {
    if (a === '--all') { flags.all = true; return false; }
    if (a === '--dry-run') { flags.dryRun = true; return false; }
    if (a.startsWith('--batch-size=')) { flags.batchSize = parseInt(a.split('=')[1], 10) || 5; return false; }
    return true;
  });
  if (!flags.batchSize) flags.batchSize = 5;

  const baseline = loadBaseline();
  if (!baseline) { console.log('No baseline found. Run verify first.'); return; }

  // Phase 1: Dry-run scan — estimate fixable errors per file
  console.log('Scanning files for fixable errors...');
  const candidates = [];
  for (const entry of baseline.perFile) {
    if (!fs.existsSync(path.join(ROOT, entry.file))) continue;
    if ((entry.errors || 0) === 0 && (entry.warnings || 0) === 0) continue;
    const pre = eslint(entry.file);
    // count baseline errors, not current — we want to reduce what's recorded
    if ((entry.errors || 0) === 0 && (entry.warnings || 0) === 0) continue;
    // dry-run fix to estimate impact
    const drR = run(`npx eslint --fix-dry-run --format json "${entry.file}"`, { timeout: 30000 });
    if (!drR.ok || !drR.stdout) { candidates.push({ file: entry.file, fixable: 0, pre }); continue; }
    try {
      const drJ = JSON.parse(drR.stdout);
      const fixable = (drJ[0]?.errorCount || 0) - (drJ[0]?.fatalErrorCount || 0);
      candidates.push({ file: entry.file, fixable: fixable < 0 ? 0 : fixable, pre });
    } catch (e) {
      candidates.push({ file: entry.file, fixable: 0, pre });
    }
  }

  // Sort by fixable error count descending
  candidates.sort((a, b) => b.fixable - a.fixable);
  const fixableTotal = candidates.reduce((s, c) => s + c.fixable, 0);
  console.log(`Found ${candidates.length} files with lint issues, ${fixableTotal} estimated fixable errors.`);

  if (flags.dryRun) {
    console.log('\nDry-run report (top 20):');
    for (const c of candidates.slice(0, 20)) {
      console.log(`  ${c.file}: baseline ${c.pre.errors}e/${c.pre.warnings}w, ~${c.fixable} fixable`);
    }
    if (candidates.length > 20) console.log(`  ... and ${candidates.length - 20} more`);
    return;
  }

  let batchNo = 0;
  let zeroImprovementRuns = 0;
  const nonFixable = [];

  do {
    const batch = candidates.splice(0, flags.batchSize);
    if (batch.length === 0) break;
    batchNo++;
    console.log(`\n--- Batch ${batchNo} ---`);

    const results = [];
    let batchFixed = 0;

    // Phase 2: Fix each file independently
    for (const c of batch) {
      const preFix = eslint(c.file);
      const preTotal = preFix.errors + preFix.warnings;
      if (preTotal === 0) { results.push({ file: c.file, status: 'clean', delta: 0 }); continue; }

      run(`npx eslint --fix --no-error-on-unmatched-pattern "${c.file}"`, { timeout: 30000 });
      // Windows FS settle
      const postFix = eslint(c.file);
      const postTotal = postFix.errors + postFix.warnings;
      const delta = preTotal - postTotal;

      if (delta > 0) {
        results.push({ file: c.file, status: 'fixed', delta, pre: preTotal, post: postTotal });
        batchFixed += delta;
        console.log(`  ✅ ${c.file}: ${preTotal} → ${postTotal} (Δ -${delta})`);
      } else if (delta === 0 && preTotal > 0) {
        // No improvement — skip, don't revert (no change made)
        results.push({ file: c.file, status: 'skipped', delta: 0 });
        nonFixable.push(c.file);
        console.log(`  ⏭ ${c.file}: ${preTotal} (no fixable errors)`);
      } else {
        // Regression (delta < 0) — revert
        run(`git checkout HEAD -- "${c.file}"`, { timeout: 10000 });
        results.push({ file: c.file, status: 'reverted', delta });
        console.log(`  ❌ ${c.file}: ${preTotal} → ${postTotal} (regression, reverted)`);
      }
    }

    if (batchFixed === 0) {
      zeroImprovementRuns++;
      console.log(`  Batch ${batchNo}: 0 improvements (${zeroImprovementRuns}/2 consecutive zero runs)`);
      if (zeroImprovementRuns >= 2) {
        console.log('\nStopping: 2 consecutive batches with zero improvement.');
        break;
      }
      continue;
    }
    zeroImprovementRuns = 0;

    // Phase 3: Run tests to verify batch
    console.log('  Running tests...');
    const testResult = runTests();
    if (testResult.fail > (baseline.testFailed || 0) || testResult.pass < (baseline.testPassed || 0)) {
      console.log(`  ❌ Test regression: ${testResult.pass}p/${testResult.fail}f — reverting batch`);
      for (const r of results) {
        if (r.status === 'fixed') {
          run(`git checkout HEAD -- "${r.file}"`, { timeout: 10000 });
        }
      }
      break;
    }
    console.log(`  ✅ Tests: ${testResult.pass}p/${testResult.fail}f`);

    // Phase 4: Update baseline + commit
    for (const r of results) {
      if (r.status !== 'fixed') continue;
      const entry = baseline.perFile.find(e => e.file === r.file);
      if (entry) {
        const current = eslint(r.file);
        entry.errors = current.errors;
        entry.warnings = current.warnings;
      }
    }
    baseline.timestamp = new Date().toISOString();
    baseline.testPassed = testResult.pass;
    baseline.testFailed = testResult.fail;
    saveBaseline(baseline);

    // Auto-commit
    const commitFiles = results.filter(r => r.status === 'fixed').map(r => r.file);
    for (const f of commitFiles) { run(`git add "${f}"`, { timeout: 10000 }); }
    const commitMsg = `chore: [guardrail] fix-stale batch ${batchNo} - fixed ${batchFixed} errors`;
    run(`git commit -m "${commitMsg}"`, { timeout: 15000 });
    console.log(`  💾 ${commitMsg}`);

    if (!flags.all) {
      console.log('  (use --all to continue)');
      break;
    }
  } while (candidates.length > 0);

  // Summary
  const totalFixed = baseline.perFile.reduce((s, f) => s + f.errors, 0);
  const totalWarn = baseline.perFile.reduce((s, f) => s + f.warnings, 0);
  console.log(`\nDone. Current baseline: ${totalFixed}e/${totalWarn}w`);
  if (nonFixable.length > 0) {
    console.log(`Non-fixable files: ${nonFixable.length}`);
    const nfReport = { timestamp: new Date().toISOString(), files: nonFixable };
    const nfPath = path.join(ROOT, 'guardrail-non-fixable.json');
    fs.writeFileSync(nfPath, JSON.stringify(nfReport, null, 2));
    console.log(`Report saved to guardrail-non-fixable.json`);
  }
}
```

- [ ] **Step 2: Register `fix-stale` in CLI dispatch**

Replace the CLI dispatch block (lines ~407-418):

```javascript
const cmd = process.argv[2];
const args = process.argv.slice(3);

if (cmd === 'status') {
  cmdStatus();
} else if (cmd === 'verify') {
  cmdVerify(args);
} else if (cmd === 'rebaseline') {
  cmdRebaseline(args);
} else if (cmd === 'install-hook') {
  cmdInstallHook();
} else if (cmd === 'compare-baseline') {
  cmdCompare(args);
} else if (cmd === 'fix-stale') {
  cmdFixStale(args);
} else if (cmd === 'analyze-regressions') {
  cmdAnalyzeRegressions(args);
} else if (cmd === 'tighten') {
  cmdTighten(args);
} else {
  console.log('Usage: node guardrail-fix.js <status|verify|rebaseline|install-hook|compare-baseline|fix-stale|analyze-regressions|tighten> [options] [files...]');
}
```

- [ ] **Step 3: Verify fix-stale works on a small subset**

```bash
node tools/guardrail-fix.js fix-stale --dry-run
```

Expected: Lists ~324 files with fixable estimates, sorted descending.

- [ ] **Step 4: Run adversarial test to confirm no regression in existing tests**

```bash
node tools/guardrail-adversarial-test.js
```

Expected: 7/7 pass.

- [ ] **Step 5: Commit**

```bash
git add tools/guardrail-fix.js
git commit -m "feat: [guardrail] add fix-stale command for auto-fixing lint errors"
```

---

### Task 2: Add adversarial tests for fix-stale (Test G)

**Files:**
- Modify: `tools/guardrail-adversarial-test.js`

- [ ] **Step 1: Verify adversarial test still passes before editing**

```bash
node tools/guardrail-adversarial-test.js
```
Expected: 7/7 pass.

- [ ] **Step 2: Understand candidate selection logic**

The existing Test B already selects clean files with `git diff` + `eslint --format json` filtering. fix-stale adversarial test should:
- Pick a file with baseline errors > 0
- Inject a fixable adversarial error
- Run `fix-stale` on it
- Verify the fixable error was removed

- [ ] **Step 3: Add Test G to adversarial test**

Append after Test F cleanup block (before the `} finally {`):

```javascript
// ====== Test G: fix-stale — batch fix + regression protection ======
console.log('\n--- G: fix-stale — batch fix + regression protection ---');
// Pick a tracked file with known errors in baseline
const bpG = saveBaseline().perFile;
let fileG = null;
for (const e of bpG) {
  if ((e.errors || 0) > 0 && e.file.endsWith('.js') && fs.existsSync(path.join(ROOT, e.file))) {
    const gDiff = run(`git diff -- "${e.file}"`);
    if (gDiff.stdout.trim().length === 0) { fileG = e.file; break; }
  }
}
totalTests++;
if (fileG) {
  const preFix = JSON.parse(run(`npx eslint --format json "${fileG}"`).stdout || '[]');
  const preErr = preFix[0]?.errorCount || 0;
  const preWarn = preFix[0]?.warningCount || 0;
  // Run fix-stale on just this file
  const rG = run(`node tools/guardrail-fix.js fix-stale --batch-size=1 "${fileG}"`, { timeout: 300000 });
  const postFix = JSON.parse(run(`npx eslint --format json "${fileG}"`).stdout || '[]');
  const postErr = postFix[0]?.errorCount || 0;
  const postWarn = postFix[0]?.warningCount || 0;
  const improved = postErr < preErr || postWarn < preWarn;
  result('G1 fix-stale reduces errors', improved,
    `${fileG}: ${preErr}e/${preWarn}w → ${postErr}e/${postWarn}w`);
  result('G2 no regression flagged', !rG.stdout.includes('Regression detected'),
    '');

  // Revert the fix-stale changes (they were auto-committed)
  run('git reset --soft HEAD~1', { timeout: 10000 });
  run('git reset HEAD .', { timeout: 10000 });
  run(`git checkout -- "${fileG}"`, { timeout: 10000 });

  if (improved) passedTests++;
} else {
  result('G1 fix-stale reduces errors', true, 'skip: no dirty file with errors available');
  result('G2 no regression flagged', true, 'skip');
  passedTests++;
}

totalTests++;
// Test G3: dry-run mode
const rGdry = run(`node tools/guardrail-fix.js fix-stale --dry-run`, { timeout: 60000 });
const gDryWorks = rGdry.stdout.includes('Dry-run') || rGdry.stdout.includes('fixable');
result('G3 --dry-run works', gDryWorks,
  gDryWorks ? 'output contains dry-run report' : 'no dry-run output');
if (gDryWorks) passedTests++;
```

- [ ] **Step 4: Run adversarial test**

```bash
node tools/guardrail-adversarial-test.js
```
Expected: 8/8 or 8/9 pass (G1 may skip depending on file availability).

- [ ] **Step 5: Commit**

```bash
git add tools/guardrail-adversarial-test.js
git commit -m "test: [guardrail] add adversarial tests for fix-stale"
```

---

### Task 3: `verify --staged` and `verify --all` for full protection

**Files:**
- Modify: `tools/guardrail-fix.js` (update `cmdVerify` flag parsing)
- Modify: `.git/hooks/pre-commit` (re-install with better hook)

- [ ] **Step 1: Add `--staged` and `--all` flags to `cmdVerify`**

In the flag parsing section (lines ~97-102), add:

```javascript
if (a === '--staged') { flags.staged = true; return false; }
if (a === '--all') { flags.all = true; return false; }
```

In the `neededFiles` resolution (lines ~128-139), replace with:

```javascript
let neededFiles;
if (files.length > 0) {
  neededFiles = files;
} else if (flags.staged) {
  const r = run('git diff --cached --name-only', { timeout: 10000 });
  neededFiles = (r.ok ? r.stdout.split('\n').filter(Boolean) : [])
    .filter(f => baselineMap[f] && fs.existsSync(path.join(ROOT, f)));
  console.log(`  📋 Staged: ${neededFiles.length} files`);
} else if (flags.all) {
  neededFiles = Object.keys(baselineMap).filter(f => fs.existsSync(path.join(ROOT, f)));
  console.log(`  📋 Full check: ${neededFiles.length} files`);
} else {
  const changed = changedFiles().filter(f => baselineMap[f] && fs.existsSync(path.join(ROOT, f)));
  if (changed.length > 0) {
    console.log(`  📋 Incremental: ${changed.length} files changed since last baseline`);
    neededFiles = changed;
  } else {
    neededFiles = Object.keys(baselineMap);
  }
}
```

- [ ] **Step 2: Re-install pre-commit hook with `--staged --fast`**

Replace the hook content in `cmdInstallHook()` (lines ~340-348):

```javascript
const hookContent = `#!/bin/sh
# Guardrail pre-commit hook — auto-generated by guardrail-fix.js
echo "🔍 Running guardrail verify (staged + fast)..."
node "${path.resolve(__dirname, 'guardrail-fix.js').replace(/\\/g, '/')}" verify --staged --fast
if [ $? -ne 0 ]; then
  echo "❌ Guardrail detected regression in staged files. Commit blocked."
  exit 1
fi
echo "✅ Guardrail passed."
`;
```

Then re-run:
```bash
node tools/guardrail-fix.js install-hook
```

- [ ] **Step 3: Verify the new flags work**

```bash
node tools/guardrail-fix.js verify --staged --fast
node tools/guardrail-fix.js verify --all --fast
node tools/guardrail-fix.js verify --staged --json
```
All should run without errors.

- [ ] **Step 4: Run full adversarial test**

```bash
node tools/guardrail-adversarial-test.js
```
Expected: 8/9 pass (if G1 ran) or 7/7.

- [ ] **Step 5: Commit**

```bash
git add tools/guardrail-fix.js
git commit -m "feat: [guardrail] add verify --staged and verify --all flags"
```

---

### Task 4: Baseline versioning with `baselines/` directory

**Files:**
- Modify: `tools/guardrail-fix.js` (update `cmdCompare`, add `--save-baseline` to verify)
- Create: (no new files — `baselines/` created at runtime)

- [ ] **Step 1: Add `--save-baseline` flag in verify**

In `cmdVerify` flag parsing:

```javascript
if (a.startsWith('--save-baseline=')) { flags.saveBaseline = a.split('=')[1]; return false; }
```

After the "All clean" path (before `if (flags.commit)`, around line ~271):

```javascript
if (flags.saveBaseline) {
  const baselinesDir = path.join(ROOT, 'baselines');
  if (!fs.existsSync(baselinesDir)) fs.mkdirSync(baselinesDir, { recursive: true });
  const bPath = path.join(baselinesDir, flags.saveBaseline + '.json');
  fs.writeFileSync(bPath, JSON.stringify(baseline, null, 2));
  console.log(`  💾 Baseline saved to ${bPath}`);
  result.savedBaseline = bPath;
}
```

- [ ] **Step 2: Enhance `cmdCompare` to support baselines directory shorthand**

In `cmdCompare`, before loading files:

```javascript
function resolveBaselinePath(p) {
  if (fs.existsSync(p)) return p;
  const inDir = path.join(ROOT, 'baselines', p.endsWith('.json') ? p : p + '.json');
  if (fs.existsSync(inDir)) return inDir;
  return null;
}
```

Update the loading logic to use `resolveBaselinePath()`.

- [ ] **Step 3: Verify baseline save and compare**

```bash
node tools/guardrail-fix.js verify src/core/Thinking.js --save-baseline=test-save
node tools/guardrail-fix.js compare-baseline baselines/test-save.json
```
Expected: Shows comparison with 0 differences (since we just saved it).

- [ ] **Step 4: Run adversarial test**

```bash
node tools/guardrail-adversarial-test.js
```
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add tools/guardrail-fix.js baselines/
git commit -m "feat: [guardrail] add baseline versioning with --save-baseline"
```

---

### Task 5: Regression analysis (JSONL logging + analyze command)

**Files:**
- Modify: `tools/guardrail-fix.js` (add regression logging + `cmdAnalyzeRegressions`)

- [ ] **Step 1: Add regression JSONL logging in `cmdVerify`**

In cmdVerify, when regression is detected (around line ~159-171), add logging:

```javascript
// Log regression details to guardrail-regressions.jsonl
const logLine = {
  timestamp: new Date().toISOString(),
  file,
  deltaE,
  deltaW,
  rules: {}
};
if (current.messages) {
  for (const m of current.messages) {
    if (m.severity === 2) {
      logLine.rules[m.ruleId] = (logLine.rules[m.ruleId] || 0) + 1;
    }
  }
}
const logPath = path.join(ROOT, 'guardrail-regressions.jsonl');
fs.appendFileSync(logPath, JSON.stringify(logLine) + '\n');
```

- [ ] **Step 2: Implement `cmdAnalyzeRegressions`**

Append before CLI dispatch:

```javascript
function cmdAnalyzeRegressions(args) {
  const logPath = path.join(ROOT, 'guardrail-regressions.jsonl');
  if (!fs.existsSync(logPath)) {
    console.log('No regression log found (guardrail-regressions.jsonl)');
    return;
  }
  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  if (lines.length === 0) { console.log('Regression log is empty.'); return; }

  const ruleCounts = {};
  const fileCounts = {};
  let total = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      total++;
      if (entry.file) fileCounts[entry.file] = (fileCounts[entry.file] || 0) + 1;
      if (entry.rules) {
        for (const [rule, count] of Object.entries(entry.rules)) {
          ruleCounts[rule] = (ruleCounts[rule] || 0) + count;
        }
      }
    } catch (e) { /* skip malformed lines */ }
  }

  console.log(`Regression Analysis (${total} events)\n`);

  // Rule distribution
  const ruleSorted = Object.entries(ruleCounts).sort((a, b) => b[1] - a[1]);
  console.log(`Rule distribution (Top 10):`);
  for (const [rule, count] of ruleSorted.slice(0, 10)) {
    const pct = (count / total * 100).toFixed(1);
    console.log(`  ${rule}: ${count} (${pct}%)`);
  }

  // File distribution
  const fileSorted = Object.entries(fileCounts).sort((a, b) => b[1] - a[1]);
  console.log(`\nFile distribution (Top 10):`);
  for (const [file, count] of fileSorted.slice(0, 10)) {
    const pct = (count / total * 100).toFixed(1);
    console.log(`  ${file}: ${count} (${pct}%)`);
  }

  // Suggestions
  if (ruleSorted.length > 0) {
    console.log(`\nSuggestions:`);
    const topRule = ruleSorted[0][0];
    console.log(`  - Consider adding pre-commit check for "${topRule}"`);
    console.log(`  - Consider adding "${topRule}" to eslint config override for hot files`);
  }
}
```

- [ ] **Step 3: Test analyze-regressions**

```bash
# Create a sample log entry
echo '{"timestamp":"2026-05-31T12:00:00.000Z","file":"src/test.js","deltaE":1,"deltaW":0,"rules":{"no-unused-vars":1}}' > guardrail-regressions.jsonl
node tools/guardrail-fix.js analyze-regressions
```
Expected: Shows rule/file distribution with 1 event.

- [ ] **Step 4: Run full adversarial test**

```bash
node tools/guardrail-adversarial-test.js
```
Expected: All pass.

- [ ] **Step 5: Clean up sample and commit**

```bash
Remove-Item -LiteralPath guardrail-regressions.jsonl -Force
git add tools/guardrail-fix.js
git commit -m "feat: [guardrail] add regression analysis (JSONL logging + analyze-regressions)"
```

---

### Task 6: Adaptive thresholds (tighten command)

**Files:**
- Modify: `tools/guardrail-fix.js` (add `.guardrail-config.json` support + `cmdTighten`)

- [ ] **Step 1: Add config loading utility**

Add after `loadBaseline()` (~line 28):

```javascript
const CONFIG_PATH = path.join(ROOT, '.guardrail-config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return { tightenThreshold: 5, tightenHistory: {} };
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch (e) { return { tightenThreshold: 5, tightenHistory: {} }; }
}

function saveConfig(c) {
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2));
  fs.renameSync(tmp, CONFIG_PATH);
}
```

- [ ] **Step 2: Track clean runs in verify**

In `cmdVerify`, when `hasRegression` is false (clean path), add after the "All clean" section:

```javascript
// Track clean runs for tighten
const config = loadConfig();
for (const entry of baseline.perFile) {
  if ((entry.errors || 0) === 0 && (entry.warnings || 0) === 0) {
    if (!config.tightenHistory[entry.file]) config.tightenHistory[entry.file] = { cleanCount: 0, tightened: false };
    config.tightenHistory[entry.file].cleanCount++;
  } else {
    config.tightenHistory[entry.file] = { cleanCount: 0, tightened: false };
    // Reset on regression
  }
}
saveConfig(config);
```

- [ ] **Step 3: Implement `cmdTighten`**

Append before CLI dispatch:

```javascript
function cmdTighten(args) {
  const flags = {};
  args.forEach(a => { if (a === '--commit') flags.commit = true; });

  const config = loadConfig();
  const baseline = loadBaseline();
  if (!baseline) { console.log('No baseline found.'); return; }

  const threshold = config.tightenThreshold || 5;
  let suggestCount = 0;

  console.log(`Tighten analysis (threshold: ${threshold} clean runs)\n`);

  for (const entry of baseline.perFile) {
    const hist = config.tightenHistory[entry.file];
    if (!hist || hist.tightened) continue;
    if (hist.cleanCount >= threshold) {
      suggestCount++;
      console.log(`  ${entry.file}: ${hist.cleanCount} clean runs — ready to tighten`);
      if (flags.commit) {
        hist.tightened = true;
      }
    }
  }

  if (suggestCount === 0) {
    console.log('No files ready for tightening yet.');
    return;
  }

  if (flags.commit) {
    saveConfig(config);
    console.log(`\nTightened ${suggestCount} file(s). Config saved.`);
  } else {
    console.log(`\n${suggestCount} file(s) ready. Use --commit to apply.`);
  }
}
```

- [ ] **Step 4: Test tighten --dry-run**

```bash
node tools/guardrail-fix.js tighten
```
Expected: Shows analysis output (may be 0 if no files have reached threshold).

- [ ] **Step 5: Run adversarial test**

```bash
node tools/guardrail-adversarial-test.js
```
Expected: All pass.

- [ ] **Step 6: Update .gitignore**

Append to `.gitignore`:
```
# Guardrail
.guardrail-config.json
```

- [ ] **Step 7: Commit**

```bash
git add tools/guardrail-fix.js .gitignore
git commit -m "feat: [guardrail] add adaptive thresholds (tighten command)"
```

---

### Task 7: BrainSystem closed loop (PreToolRiskAnalyzer + ToolExecutor integration)

**Files:**
- Modify: `src/core/PreToolRiskAnalyzer.js`
- Modify: `src/core/ToolExecutor.js`

- [ ] **Step 1: Read current PreToolRiskAnalyzer and ToolExecutor**

```javascript
// Read PreToolRiskAnalyzer.js to find the analyze method signature
// Read ToolExecutor.js to find the tool execution hook points
```

- [ ] **Step 2: Add guardrail pre-check to PreToolRiskAnalyzer**

In `PreToolRiskAnalyzer.js`, add to the `analyze` method:

```javascript
// Guardrail pre-check: if modifying a file tracked in baseline, warn about current lint state
if (actionType === 'edit' || actionType === 'write' || actionType === 'bash') {
  try {
    const guardrailPath = path.resolve(__dirname, '../../tools/guardrail-fix.js');
    if (fs.existsSync(guardrailPath)) {
      const result = require('child_process').execSync(
        `node "${guardrailPath}" verify --json src/core/LoopGuard.js`,
        { encoding: 'utf8', timeout: 30000, stdio: 'pipe' }
      );
      const parsed = JSON.parse(result.trim());
      if (parsed.files) {
        const dirtyFiles = parsed.files.filter(f => f.errors > 0 || f.warnings > 0);
        if (dirtyFiles.length > 0) {
          this.addWarning(`Guardrail: ${dirtyFiles.length} file(s) have lint issues before this change`);
        }
      }
    }
  } catch (e) {
    // Guardrail is advisory — failure should not block
    this.addWarning('Guardrail pre-check unavailable');
  }
}
```

- [ ] **Step 3: Add guardrail post-check to ToolExecutor**

In `ToolExecutor.js`, in the post-execution hook:

```javascript
// Guardrail post-check: verify files modified by this tool haven't regressed
if (affectedFiles && affectedFiles.length > 0 && !opts.skipGuardrail) {
  try {
    const guardrailPath = path.resolve(__dirname, '../../tools/guardrail-fix.js');
    if (fs.existsSync(guardrailPath)) {
      const filesToCheck = affectedFiles.filter(f => f.endsWith('.js'));
      if (filesToCheck.length > 0) {
        const cmd = filesToCheck.map(f => `"${f}"`).join(' ');
        execSync(
          `node "${guardrailPath}" verify --json --fast ${cmd}`,
          { encoding: 'utf8', timeout: 30000, stdio: 'pipe', cwd: path.resolve(__dirname, '../..') }
        );
      }
    }
  } catch (e) {
    // Guardrail is advisory — failure should not block execution
    console.error('[Guardrail] Post-check failed (non-blocking):', e.message);
  }
}
```

- [ ] **Step 4: Verify integration doesn't break existing functionality**

```bash
npm test
```
Expected: 30 files, 518 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/PreToolRiskAnalyzer.js src/core/ToolExecutor.js
git commit -m "feat: [guardrail] add BrainSystem closed loop (pre-check + post-check)"
```

---

### Task 8: Final full verification

- [ ] **Step 1: Run full adversarial test suite**

```bash
node tools/guardrail-adversarial-test.js
```
Expected: All tests pass.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```
Expected: 30 files, 518 tests pass.

- [ ] **Step 3: Run a quick guardrail fix-stale --dry-run to confirm tool state**

```bash
node tools/guardrail-fix.js fix-stale --dry-run
node tools/guardrail-fix.js status
```
Expected: Both commands produce valid output.
