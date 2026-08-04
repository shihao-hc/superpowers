/**
 * ComprehensiveCheckImpls 拆分模块分支覆盖测试
 *
 * 直接调用 CHECK_IMPLEMENTATIONS 各检查函数，使用真实临时目录，
 * 覆盖 tests/ComprehensiveChecker.test.js 未触及的分支
 * （该文件通过 executeCheck + mock fs 测试主流程；本文件补分支边界）。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { CHECK_IMPLEMENTATIONS } = require('../../src/agent/ComprehensiveCheckImpls');

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-branch-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(relPath, content) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

function mkdir(relPath) {
  fs.mkdirSync(path.join(root, relPath), { recursive: true });
}

function fwd(p) {
  return p.replace(/\\/g, '/');
}

describe('A-code 分支', () => {
  test('checkFileIntegrity: 恰好1个关键文件存在 → 部分缺失 warning', async () => {
    write('src/core/BrainSystem.js', 'module.exports = {};');
    const f = write('main.js', 'console.log(1);');
    const r = await CHECK_IMPLEMENTATIONS.checkFileIntegrity(root, [f]);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('缺少部分关键文件');
  });

  test('checkFileIntegrity: 无关键文件但文件少 → passed (0个关键文件存在)', async () => {
    const f = write('main.js', 'console.log(1);');
    const r = await CHECK_IMPLEMENTATIONS.checkFileIntegrity(root, [f]);
    expect(r.status).toBe('passed');
  });

  test('checkModuleExports: 核心模块无导出 → warning', async () => {
    const f = write('core/secret.js', 'function internal() { return 1; }');
    const r = await CHECK_IMPLEMENTATIONS.checkModuleExports(root, [fwd(f)]);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('部分模块未导出');
  });

  test('checkModuleExports: 核心模块有导出 → passed', async () => {
    const f = write('core/exported.js', 'module.exports = {};');
    const r = await CHECK_IMPLEMENTATIONS.checkModuleExports(root, [fwd(f)]);
    expect(r.status).toBe('passed');
  });

  test('checkCodeDuplication: 超过5个重复文件 → warning', async () => {
    const content = 'module.exports = { a: 1 };\n';
    const files = [];
    for (let i = 0; i < 7; i++) files.push(write(`dup${i}.js`, content));
    const r = await CHECK_IMPLEMENTATIONS.checkCodeDuplication(root, files);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('存在重复代码');
  });
});

describe('D-config 分支', () => {
  test('checkConfigManagement: 文件路径含config → passed (hasConfig true)', async () => {
    const f = write('config-loader.js', 'module.exports = {};');
    const r = await CHECK_IMPLEMENTATIONS.checkConfigManagement(root, [f]);
    expect(r.status).toBe('passed');
  });
});

describe('E-docs 分支', () => {
  test('checkReadme: Python项目且内容缺失 → warning', async () => {
    write('README.md', '# Test project\n');
    write('requirements.txt', 'requests\n');
    const r = await CHECK_IMPLEMENTATIONS.checkReadme(root);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('README可能不完整');
  });

  test('checkAPIDocs: 无API文档且JSDoc<3 → warning', async () => {
    const f = write('a.js', 'module.exports = {};');
    const r = await CHECK_IMPLEMENTATIONS.checkAPIDocs(root, [f]);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('缺少API文档');
  });

  test('checkAPIDocs: 有JSDoc但仍不足3个 → warning', async () => {
    const f = write('b.js', '/**\n * @param x\n */\nfunction f(x) { return x; }');
    const r = await CHECK_IMPLEMENTATIONS.checkAPIDocs(root, [f]);
    expect(r.status).toBe('warning');
  });

  test('checkExamples: examples目录存在 → passed', async () => {
    mkdir('examples');
    const r = await CHECK_IMPLEMENTATIONS.checkExamples(root);
    expect(r.status).toBe('passed');
  });
});

describe('F-maintainability 分支', () => {
  test('checkReadability: 3个文件各有超长行 → warning', async () => {
    const long = Array.from({ length: 6 }, () => 'x'.repeat(130)).join('\n');
    const files = [write('a.js', long), write('b.js', long), write('c.js', long)];
    const r = await CHECK_IMPLEMENTATIONS.checkReadability(root, files);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('可读性');
  });

  test('checkCommentCoverage: 高注释率 → passed', async () => {
    const content = '// comment\n'.repeat(20) + 'const x = 1;\n'.repeat(10);
    const f = write('a.js', content);
    const r = await CHECK_IMPLEMENTATIONS.checkCommentCoverage(root, [f]);
    expect(r.status).toBe('passed');
  });

  test('checkCommentCoverage: JSDoc计数分支', async () => {
    const f = write('b.js', '/**\n * @param x\n */\n// c\nconst x = 1;');
    const r = await CHECK_IMPLEMENTATIONS.checkCommentCoverage(root, [f]);
    expect(r.status).toBe('passed');
  });

  test('checkNamingConsistency: 3个文件各含多个camelCase常量 → warning', async () => {
    const decls = 'const dFoo = 1;\nconst bQux = 2;\nconst gQuux = 3;\nconst tBaz = 4;\n';
    const files = [write('a.js', decls), write('b.js', decls), write('c.js', decls)];
    const r = await CHECK_IMPLEMENTATIONS.checkNamingConsistency(root, files);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('常量未使用大写下划线');
  });

  test('checkModularization: 4个超5000字符核心文件 → warning', async () => {
    const big = 'x'.repeat(6000);
    const files = [];
    for (let i = 0; i < 4; i++) files.push(fwd(write(`core/mod${i}.js`, big)));
    const r = await CHECK_IMPLEMENTATIONS.checkModularization(root, files);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('模块过大');
  });
});

describe('G-testability 分支', () => {
  test('checkUnitTests: 有测试文件但无BrainSystem.test.js → passed', async () => {
    const f = write('unit/foo.test.js', 'describe("x", () => {});');
    const r = await CHECK_IMPLEMENTATIONS.checkUnitTests(root, [f]);
    expect(r.status).toBe('passed');
    expect(r.message).toBe('单元测试存在');
  });

  test('checkIntegrationTests: tests/integration存在 → passed', async () => {
    mkdir('tests/integration');
    const r = await CHECK_IMPLEMENTATIONS.checkIntegrationTests(root);
    expect(r.status).toBe('passed');
  });

  test('checkBoundaryTests: 测试文件无边界关键词 → warning', async () => {
    write('src/core/BrainSystem.test.js', 'describe("x", () => { it("works", () => {}); });');
    const r = await CHECK_IMPLEMENTATIONS.checkBoundaryTests(root);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('边界测试不完整');
  });

  test('checkBoundaryTests: 测试文件含边界关键词 → passed', async () => {
    write('test/BrainSystem.test.js', 'test("max boundary", () => {});');
    const r = await CHECK_IMPLEMENTATIONS.checkBoundaryTests(root);
    expect(r.status).toBe('passed');
    expect(r.message).toBe('边界测试覆盖');
  });

  test('checkErrorTests: 测试文件无错误关键词 → warning', async () => {
    write('src/core/BrainSystem.test.js', 'describe("x", () => { it("ok", () => {}); });');
    const r = await CHECK_IMPLEMENTATIONS.checkErrorTests(root);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('错误场景测试');
  });

  test('checkErrorTests: 测试文件含catch → passed', async () => {
    write('test/BrainSystem.test.js', 'try { x(); } catch (e) { throw e; }');
    const r = await CHECK_IMPLEMENTATIONS.checkErrorTests(root);
    expect(r.status).toBe('passed');
    expect(r.message).toBe('错误场景测试覆盖');
  });
});

describe('H-ops 分支', () => {
  test('checkBackup: backup目录存在 → passed', async () => {
    mkdir('backup');
    const r = await CHECK_IMPLEMENTATIONS.checkBackup(root, []);
    expect(r.status).toBe('passed');
  });

  test('checkMonitoring: 无监控指标关键词 → warning', async () => {
    const f = write('a.js', 'module.exports = {};');
    const r = await CHECK_IMPLEMENTATIONS.checkMonitoring(root, [f]);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('缺少监控指标');
  });

  test('checkAlerts: 无告警关键词 → warning', async () => {
    const f = write('a.js', 'module.exports = {};');
    const r = await CHECK_IMPLEMENTATIONS.checkAlerts(root, [f]);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('缺少告警');
  });

  test('checkLogLevels: 仅1种日志级别 → warning', async () => {
    const f = write('a.js', 'console.error("x");');
    const r = await CHECK_IMPLEMENTATIONS.checkLogLevels(root, [f]);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('日志级别不完整');
  });

  test('checkDisasterRecovery: recovery文档存在 → passed', async () => {
    write('docs/recovery.md', '# Recovery');
    const r = await CHECK_IMPLEMENTATIONS.checkDisasterRecovery(root);
    expect(r.status).toBe('passed');
  });
});

describe('I-compliance 分支', () => {
  test('checkLicenseCompliance: 无LICENSE → failed', async () => {
    const r = await CHECK_IMPLEMENTATIONS.checkLicenseCompliance(root);
    expect(r.status).toBe('failed');
    expect(r.message).toContain('缺少许可证');
  });

  test('checkLicenseCompliance: 非标准许可 → warning', async () => {
    write('LICENSE', 'Proprietary');
    const r = await CHECK_IMPLEMENTATIONS.checkLicenseCompliance(root);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('许可证类型不明确');
  });

  test('checkSensitiveData: 硬编码密码 → failed', async () => {
    const f = write('a.js', 'const cfg = { password: "hunter2" };');
    const r = await CHECK_IMPLEMENTATIONS.checkSensitiveData(root, [f]);
    expect(r.status).toBe('failed');
    expect(r.message).toContain('敏感信息');
  });

  test('checkAuditLogs: 无审计关键词 → warning', async () => {
    const f = write('a.js', 'module.exports = {};');
    const r = await CHECK_IMPLEMENTATIONS.checkAuditLogs(root, [f]);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('缺少审计日志');
  });

  test('checkDataIsolation: 含tenant关键词 → passed', async () => {
    const f = write('a.js', 'const tenant = getTenant();');
    const r = await CHECK_IMPLEMENTATIONS.checkDataIsolation(root, [f]);
    expect(r.status).toBe('passed');
  });
});

describe('J-deployment 分支', () => {
  test('checkEnvVariables: 未使用环境变量 → warning', async () => {
    const f = write('a.js', 'module.exports = {};');
    const r = await CHECK_IMPLEMENTATIONS.checkEnvVariables(root, [f]);
    expect(r.status).toBe('warning');
    expect(r.message).toBe('未使用环境变量');
  });

  test('checkEnvVariables: 用env但无.env文件 → warning', async () => {
    const f = write('a.js', 'const p = process.env.PORT;');
    const r = await CHECK_IMPLEMENTATIONS.checkEnvVariables(root, [f]);
    expect(r.status).toBe('warning');
    expect(r.message).toBe('缺少.env文件');
  });

  test('checkContainerization: Dockerfile存在 → passed', async () => {
    write('Dockerfile', 'FROM node:20');
    const r = await CHECK_IMPLEMENTATIONS.checkContainerization(root);
    expect(r.status).toBe('passed');
  });

  test('checkCICD: 无CI配置文件 → warning', async () => {
    const r = await CHECK_IMPLEMENTATIONS.checkCICD(root);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('缺少CI/CD');
  });

  test('checkVersionConsistency: 无package.json → warning', async () => {
    const r = await CHECK_IMPLEMENTATIONS.checkVersionConsistency(root);
    expect(r.status).toBe('warning');
    expect(r.message).toBe('缺少package.json');
  });

  test('checkVersionConsistency: 版本0.0.0 → warning', async () => {
    write('package.json', JSON.stringify({ name: 'x', version: '0.0.0' }));
    const r = await CHECK_IMPLEMENTATIONS.checkVersionConsistency(root);
    expect(r.status).toBe('warning');
    expect(r.message).toBe('版本号未设置');
  });

  test('checkVersionConsistency: README版本不一致 → warning', async () => {
    write('package.json', JSON.stringify({ name: 'x', version: '1.2.3' }));
    write('README.md', '# X\nVersion v2.0.0\n');
    const r = await CHECK_IMPLEMENTATIONS.checkVersionConsistency(root);
    expect(r.status).toBe('warning');
    expect(r.message).toBe('版本不一致');
  });
});

describe('K-ux 分支', () => {
  test('checkErrorMessages: 不友好错误多于友好 → warning', async () => {
    const f1 = write('a.js', 'throw Error("oops")');
    const f2 = write('b.js', 'throw Error("fail")');
    const f3 = write('c.js', 'throw new Error("bad input.")');
    const r = await CHECK_IMPLEMENTATIONS.checkErrorMessages(root, [f1, f2, f3]);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('错误消息不够友好');
  });

  test('checkHelpDocs: 无帮助文档 → warning', async () => {
    const r = await CHECK_IMPLEMENTATIONS.checkHelpDocs(root);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('缺少帮助文档');
  });

  test('checkAPIFriendliness: 核心文件无JSDoc → warning', async () => {
    const f = write('core/no-doc.js', 'function f(x) { return x; }');
    const r = await CHECK_IMPLEMENTATIONS.checkAPIFriendliness(root, [fwd(f)]);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('API文档不足');
  });

  test('checkBackwardCompatibility: 无CHANGELOG → warning', async () => {
    const r = await CHECK_IMPLEMENTATIONS.checkBackwardCompatibility(root);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('缺少变更日志');
  });
});

describe('M-observability 分支', () => {
  test('checkTracing: 含traceId → passed', async () => {
    const f = write('a.js', 'const traceId = ctx.id;');
    const r = await CHECK_IMPLEMENTATIONS.checkTracing(root, [f]);
    expect(r.status).toBe('passed');
  });

  test('checkPerformanceMonitoring: 含performance → passed', async () => {
    const f = write('a.js', 'const t = performance.now();');
    const r = await CHECK_IMPLEMENTATIONS.checkPerformanceMonitoring(root, [f]);
    expect(r.status).toBe('passed');
  });

  test('checkHealthCheck: 含health → passed', async () => {
    const f = write('a.js', 'app.get("/health", h);');
    const r = await CHECK_IMPLEMENTATIONS.checkHealthCheck(root, [f]);
    expect(r.status).toBe('passed');
  });

  test('checkDiagnostics: 无诊断关键词 → warning', async () => {
    const f = write('a.js', 'module.exports = {};');
    const r = await CHECK_IMPLEMENTATIONS.checkDiagnostics(root, [f]);
    expect(r.status).toBe('warning');
    expect(r.message).toContain('缺少诊断接口');
  });
});

describe('N-cleanliness 分支', () => {
  test('checkCleanup: 空目录 → warning', async () => {
    mkdir('src/emptydir');
    const r = await CHECK_IMPLEMENTATIONS.checkCleanup(root, []);
    expect(r.status).toBe('warning');
    expect(r.details).toContain('空目录');
  });

  test('checkCleanup: TODO超过10处 → warning', async () => {
    const f = write('a.js', '// TODO fix this\n'.repeat(11));
    const r = await CHECK_IMPLEMENTATIONS.checkCleanup(root, [f]);
    expect(r.status).toBe('warning');
    expect(r.details).toContain('TODO/FIXME');
  });
});
