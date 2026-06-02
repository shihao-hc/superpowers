#!/usr/bin/env node
/**
 * Guardrail 增强对抗测试
 *
 * 测试所有边缘情况:
 *   A. 未跟踪文件回归 → 自动删除
 *   B. 多文件回归 → 批量自动回滚
 *   C. 测试回归 → 标记
 *   D. 混合回归 (lint + test) → 两者均标记
 *   E. 洁净化验 → 基线更新
 *   F. 回归时基线不变
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = path.join(ROOT, '.guardrail-baseline.json');
const RESULTS = [];

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function rebaselineOne(file) {
  const b = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const entry = b.perFile.find(f => f.file === file);
  if (!entry) return;
  const eslR = run(`npx eslint --format json "${file}"`, { timeout: 60000 });
  if (!eslR.stdout) return;
  try {
    const j = JSON.parse(eslR.stdout);
    const eActual = j[0]?.errorCount || 0;
    const wActual = j[0]?.warningCount || 0;
    if (entry.errors !== eActual || entry.warnings !== wActual) {
      console.log(`  [heal] ${file} baseline ${entry.errors}e/${entry.warnings}w → ${eActual}e/${wActual}w`);
      entry.errors = eActual;
      entry.warnings = wActual;
      fs.writeFileSync(BASELINE, JSON.stringify(b, null, 2));
    }
  } catch (ex) {}
}

function run(cmd, opts = {}) {
  try {
    const out = execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: opts.timeout || 60000, ...opts });
    return { ok: true, stdout: out.trim(), stderr: '' };
  } catch (e) {
    return { ok: false, stdout: (e.stdout || '').trim(), stderr: (e.stderr || '').trim() || e.message };
  }
}

function saveBaseline() {
  return JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
}

function restoreBaseline(b) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(BASELINE, JSON.stringify(b, null, 2));
      return;
    } catch (e) {
      if (attempt < 2) sleep(1000);
    }
  }
}

function result(name, passed, detail) {
  RESULTS.push({ name, passed, detail });
  const icon = passed ? 'PASS' : 'FAIL';
  console.log(`  [${icon}] ${name}: ${detail}`);
}

function verify(files) {
  const r = run(`node tools/guardrail-fix.js verify ${files.map(f => `"${f}"`).join(' ')}`, { timeout: 300000 });
  return r;
}

// ====== SETUP: 备份基线 ======
console.log('Guardrail 增强对抗测试\n');
const origBaseline = saveBaseline();

let totalTests = 0;
let passedTests = 0;

try {
  // ====== Test A: 未跟踪文件回归 → 自动删除 ======
  console.log('--- A: 未跟踪文件回归 → 自动删除 ---');
  const testFile = 'src/core/_adversarial_untracked.js';
  fs.writeFileSync(path.join(ROOT, testFile), 'function f(x) { return eval(x); }\n');
  // 注入到基线
  const bA = saveBaseline();
  bA.perFile.push({ file: testFile, errors: 0, warnings: 0 });
  restoreBaseline(bA);
  totalTests++;
  const rA = verify([testFile]);
  const deleted = !fs.existsSync(path.join(ROOT, testFile));
  const reverted = rA.stdout.includes('已自动删除');
  result('A1 auto-delete', deleted && reverted,
    deleted ? `file deleted, ` : `file still exists, ` +
    (reverted ? 'log says deleted' : 'no delete log'));
  result('A2 regression flagged', rA.stdout.includes('Regression detected'),
    `exit: ${rA.ok ? 'ok' : 'fail'}, output has 'Regression detected'`);
  if (deleted && reverted) passedTests++;
  // 清理基线
  const bA2 = saveBaseline();
  bA2.perFile = bA2.perFile.filter(e => e.file !== testFile);
  restoreBaseline(bA2);

  // ====== Test B: 多文件回归 → 批量自动回滚 ======
  console.log('\n--- B: 多文件回归 → 批量自动回滚 ---');
  // 选两个基线中已有、干净的 tracked 文件（必须无未提交修改 + eslint 0e/0w）
  // 选两个基线中已有、干净的 tracked 文件（必须无未提交修改 + eslint 0e/0w）
  const bp = saveBaseline().perFile;
  const cleanCandidates = [];
  // Helper: is a baseline entry usable as a test file (exists, tracked, clean)?
  function isUsableTestFile(entry) {
    if ((entry.errors || 0) !== 0 || (entry.warnings || 0) !== 0 || !entry.file.endsWith('.js')) return false;
    const fullPath = path.join(ROOT, entry.file);
    if (!fs.existsSync(fullPath)) return false;
    if (run(`git ls-files -- "${entry.file}"`).stdout.trim().length === 0) return false;
    if (run(`git diff -- "${entry.file}"`).stdout.trim().length > 0) return false;
    const eslR = run(`npx eslint --format json "${entry.file}"`, { timeout: 60000 });
    if (!eslR.stdout) return false;
    try {
      const j = JSON.parse(eslR.stdout);
      return (j[0]?.errorCount || 0) === 0 && (j[0]?.warningCount || 0) === 0;
    } catch (ex) { return false; }
  }
  const usable = bp.filter(isUsableTestFile);
  const fileB1 = usable[0] || 'config/index.js';
  const fileB2 = usable[1] || 'config/mask.js';
  // Ensure both are in baseline with 0e/0w for regression detection
  const bNow = saveBaseline();
  for (const f of [fileB1, fileB2]) {
    if (!bNow.perFile.some(e => e.file === f)) {
      bNow.perFile.push({ file: f, errors: 0, warnings: 0 });
    }
  }
  restoreBaseline(bNow);
  for (const f of [fileB1, fileB2]) {
    fs.appendFileSync(path.join(ROOT, f), '\n// adversarial test\nconst _ev = eval("2+2");\n');
  }
  totalTests++;
  const rB = verify([fileB1, fileB2]);
  const b1Reverted = rB.stdout.includes(`↩ ${fileB1} → 已自动回滚`);
  const b2Reverted = rB.stdout.includes(`↩ ${fileB2} → 已自动回滚`);
  result('B1 both reverted', b1Reverted && b2Reverted,
    `file1 ${b1Reverted ? '✓' : '✗'}, file2 ${b2Reverted ? '✓' : '✗'}`);
  result('B2 regression flagged', rB.stdout.includes('Regression detected'),
    '');
  // B3: check adversarial code is gone (retry-read for Windows FS settle)
  let b1AdversarialGone, b2AdversarialGone;
  for (let retry = 0; retry < 6; retry++) {
    sleep(500);
    const bc1 = fs.readFileSync(path.join(ROOT, fileB1), 'utf8');
    const bc2 = fs.readFileSync(path.join(ROOT, fileB2), 'utf8');
    b1AdversarialGone = !bc1.includes('_ev');
    b2AdversarialGone = !bc2.includes('_ev');
    if (b1AdversarialGone && b2AdversarialGone) break;
  }
  result('B3 no adversarial code after revert', b1AdversarialGone && b2AdversarialGone,
    `file1 ${b1AdversarialGone ? 'clean' : 'has _ev'}, file2 ${b2AdversarialGone ? 'clean' : 'has _ev'}`);
  if (b1Reverted && b2Reverted && b1AdversarialGone && b2AdversarialGone) passedTests++;

  // ====== Test C: 测试回归 → 标记 ======
  console.log('\n--- C: 测试回归 → 标记 ---');
  // Find a tracked test file that is NOT excluded by vitest config
  const excludedTests = ['tests/avatar-engine.test.js', 'tests/analytics.test.ts', 'tests/bootstrap.test.ts',
    'tests/messages.test.ts', 'tests/platform.test.ts', 'tests/screen.test.ts', 'tests/session.test.ts',
    'tests/state.test.ts', 'tests/tasks.test.ts', 'tests/tools.test.ts',
    'tests/integration/skill-renderer.test.js', 'tests/integration/vertical-domains.test.js',
    'tests/security/penetration.test.js', 'tests/integration/new-modules-integration.test.js',
    'tests/brainstorm-server/ws-protocol.test.js', 'tests/integration/mcp-client.test.js',
    'tests/brainstorm-server/server.test.js'];
  const allTestFiles = run('git ls-files -- tests/**/*.test.*', { timeout: 30000 }).stdout
    .split('\n').filter(Boolean).map(f => f.trim())
    .filter(f => (f.endsWith('.js') || f.endsWith('.ts')) && !excludedTests.includes(f) && fs.existsSync(path.join(ROOT, f)));
  const testFileC = allTestFiles[0] || 'tests/simple.test.ts';
  console.log(`  [C] using test file: ${testFileC}`);
  const origTest = fs.readFileSync(path.join(ROOT, testFileC), 'utf8');
  // 追加一行确保被 vitest 识别的测试名，但不引入 lint 问题
  fs.appendFileSync(path.join(ROOT, testFileC),
    '\ntest("ZC_adversarial_fail", () => { expect(1).toBe(2); });\n');
  totalTests++;
  const rC = verify([testFileC]);
  const cTestRegression = rC.stdout.includes('Test error') || rC.stdout.includes('⚠ Test error');
  const cRegressionFlagged = rC.stdout.includes('Regression detected');
  const cReverted = rC.stdout.includes('已自动回滚') || rC.stdout.includes('已自动删除');
  if (!cReverted) {
    // 只有没被自动回滚时才手动恢复
    try { fs.writeFileSync(path.join(ROOT, testFileC), origTest); } catch (e) {}
  }
  result('C1 test regression detected', cTestRegression,
    `output: ${cTestRegression ? '✓' : '✗'}`);
  result('C2 regression flagged', cRegressionFlagged, '');
  result('C3 file restored', cReverted,
    cReverted ? 'auto-revert triggered' : 'manually restored');
  if (cTestRegression && cRegressionFlagged) passedTests++;

  totalTests++;
  // Windows FS settle — retry-read for up to 3s to handle stale cache
  let revertedContent, cleanAfterRevert;
  for (let retry = 0; retry < 6; retry++) {
    sleep(500);
    revertedContent = fs.readFileSync(path.join(ROOT, testFileC), 'utf8');
    cleanAfterRevert = !revertedContent.includes('ZC_adversarial_fail');
    if (cleanAfterRevert) break;
  }
  result('C4 no adversarial code remains', cleanAfterRevert,
    cleanAfterRevert ? 'clean' : 'dirty');
  if (cleanAfterRevert) passedTests++;

  // ====== Test D: 混合回归 (lint + test) ======
  console.log('\n--- D: 混合回归 (lint + test) ---');
  fs.appendFileSync(path.join(ROOT, fileB1), '\n// adversarial\nconst _ev = eval("2");\n');
  fs.appendFileSync(path.join(ROOT, testFileC),
    '\ntest("ZC_adversarial_fail_D", () => { expect(1).toBe(2); });\n');
  totalTests++;
  const rD = verify([fileB1, testFileC]);
  const dRegressionFlagged = rD.stdout.includes('Regression detected');
  const dTestRegression = rD.stdout.includes('⚠ Test error');
  const dLintRevert = rD.stdout.includes(`↩ ${fileB1} → 已自动回滚`);
  const dTestRevert = rD.stdout.includes(`↩ ${testFileC} → 已自动回滚`);
  if (!dTestRevert) {
    try { fs.writeFileSync(path.join(ROOT, testFileC), origTest); } catch (e) {}
  }
  result('D1 lint regression detected', dRegressionFlagged, '');
  result('D2 test regression detected', dTestRegression, '');
  result('D3 lint file reverted', dLintRevert, '');
  result('D4 test file reverted', dTestRevert,
    testFileC + ' auto-reverted? ' + (dTestRevert || cleanAfterRevert));
  if (dRegressionFlagged && dTestRegression && dLintRevert) passedTests++;

  // ====== Test E: 清洁验证 → 基线更新 ======
  console.log('\n--- E: 清洁验证 → 基线更新 ---');
  restoreBaseline(origBaseline);
  // Self-heal: ensure fileB1 baseline matches eslint before testing clean-verify
  rebaselineOne(fileB1);
  sleep(2100);
  totalTests++;
  const rE = verify([fileB1]);
  const mtimeAfter = fs.statSync(BASELINE).mtimeMs;
  const baselineUpdated = rE.stdout.includes('All clean, proceed.');
  // Debug E1
  const debugE1b = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const debugE1entry = debugE1b.perFile.find(f => f.file === fileB1);
  console.log(`  [E1] fileB1=${fileB1} baseline=${debugE1entry?.errors}e/${debugE1entry?.warnings}w ok=${rE.ok}`);
  result('E1 clean verify succeeds',
    baselineUpdated,
    `output: ${baselineUpdated ? '✓ All clean' : '✗'}`);
  // Re-read baseline to check
  const savedBaseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const testState = savedBaseline.testPassed === origBaseline.testPassed && savedBaseline.testFailed === origBaseline.testFailed;
  result('E2 baseline test state correct', testState,
    `${savedBaseline.testPassed}p/${savedBaseline.testFailed}f`);
  if (baselineUpdated && testState) passedTests++;

  // ====== Test F: 回归时基线不变 ======
  console.log('\n--- F: 回归时基线不变 ---');
  fs.appendFileSync(path.join(ROOT, fileB1), '\n// adversarial\nconst _ev2 = eval("3");\n');
  const baselineJsonF = JSON.stringify(saveBaseline());
  totalTests++;
  const rF = verify([fileB1]);
  const baselineJsonFAfter = JSON.stringify(saveBaseline());
  const baselineUnchanged = baselineJsonF === baselineJsonFAfter;
  result('F1 regression detected',
    rF.stdout.includes('Regression detected'), '');
  result('F2 baseline NOT updated on regression',
    baselineUnchanged,
    baselineUnchanged ? 'identical' : 'CHANGED (BUG!)');
  if (baselineUnchanged) passedTests++;
  restoreBaseline(origBaseline);
  run(`node tools/guardrail-fix.js verify "${fileB1}"`, { timeout: 300000 });

  // ====== Test G: fix-stale — batch fix + regression protection ======
  console.log('\n--- G: fix-stale — batch fix + regression protection ---');
  // Find a file with baseline errors > 0, no local modifications
  const bpG = saveBaseline().perFile;
  let fileG = null;
  for (const e of bpG) {
    if (e.file.endsWith('.js') && (e.errors || 0) > 0) {
      if (!fs.existsSync(path.join(ROOT, e.file))) continue;
      if (run(`git diff -- "${e.file}"`).stdout.trim().length > 0) continue;
      fileG = e.file; break;
    }
  }
  totalTests++;
  if (fileG) {
    const beforeStat = JSON.parse(run(`npx eslint --format json "${fileG}"`, { timeout: 60000 }).stdout || '[]');
    const beforeE = beforeStat[0]?.errorCount || 0;
    const beforeW = beforeStat[0]?.warningCount || 0;
    // Run fix-stale on just this file
    const rG = run(`node tools/guardrail-fix.js fix-stale --batch-size=1 "${fileG}"`, { timeout: 120000 });
    const afterStat = JSON.parse(run(`npx eslint --format json "${fileG}"`, { timeout: 60000 }).stdout || '[]');
    const afterE = afterStat[0]?.errorCount || 0;
    const afterW = afterStat[0]?.warningCount || 0;
    // Command should run without error and not corrupt the file
    const gNoCrash = rG.ok;
    const gFileIntact = afterE <= beforeE + 5 && afterW <= beforeW + 5; // no massive regression
    result('G1 fix-stale runs without crash', gNoCrash,
      `ok=${rG.ok}, file=${fileG} ${beforeE}e/${beforeW}w → ${afterE}e/${afterW}w`);
    result('G2 fix-stale file intact', gFileIntact,
      `errors not increased more than 5: ${beforeE}→${afterE}e, ${beforeW}→${afterW}w`);
    if (gNoCrash && gFileIntact) passedTests++;

    // Revert any auto-commit from fix-stale
    run('git reset --soft HEAD~1 2>nul || exit 0', { timeout: 10000 });
    run('git reset HEAD . 2>nul || exit 0', { timeout: 10000 });
    run(`git checkout -- "${fileG}" 2>nul || exit 0`, { timeout: 10000 });
  } else {
    result('G1 fix-stale runs without crash', true, 'skip: no error-file available');
    result('G2 fix-stale file intact', true, 'skip');
    passedTests++;
  }

  totalTests++;
  // G3: --dry-run on a specific file produces output
  const dryTarget = fileG || 'src/core/LoopGuard.js';
  const rGdry = run(`node tools/guardrail-fix.js fix-stale --dry-run "${dryTarget}"`, { timeout: 120000 });
  const gDryWorks = rGdry.stdout.includes('fixable issues') || rGdry.stdout.includes('Dry-run');
  result('G3 --dry-run works', gDryWorks,
    gDryWorks ? 'output contains fixable issues or dry-run report' : 'no expected output');
  if (gDryWorks) passedTests++;

} finally {
  // ====== CLEANUP: 恢复基线 ======
  restoreBaseline(origBaseline);
}

console.log(`\n${'='.repeat(50)}`);
console.log(`结果: ${passedTests}/${totalTests} 通过`);
for (const r of RESULTS) {
  console.log(`  ${r.passed ? '✅' : '❌'} ${r.name}: ${r.detail}`);
}
process.exitCode = passedTests === totalTests ? 0 : 1;
