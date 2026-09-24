/**
 * G-testability 维度检查实现
 *
 * 从 ComprehensiveCheckImpls.js 拆出（56项全面检查按 14 维度拆分）
 * 仅供 ComprehensiveCheckImpls.js 聚合引用
 */

const fs = require('fs');
const path = require('path');
module.exports = {
  'checkUnitTests': async (root, _files) => {
    // 修复：原检查 root/src/core/BrainSystem.test.js（不存在）+ src 文件含 test/ 路径，
    // 而真实测试全在 tests/ → 恒误报"缺少单元测试"。改为真实统计 tests/ 下的 .test.js
    const testsDir = path.join(root, 'tests');
    let testCount = 0;
    if (fs.existsSync(testsDir)) {
      const countDir = (dir) => {
        let n = 0;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) { n += countDir(p); } else if (e.name.endsWith('.test.js')) { n++; }
        }
        return n;
      };
      testCount = countDir(testsDir);
    }

    if (testCount > 0) {
      return { status: 'passed', message: `单元测试存在（${testCount} 个测试文件）` };
    }

    return { status: 'failed', message: '缺少单元测试', details: 'tests/ 目录下无 *.test.js' };
  },

  'checkIntegrationTests': async (root) => {
    const integrationPaths = [
      'tests/integration',
      'test/integration',
      '__tests__/integration'
    ];

    const exists = integrationPaths.some((p) =>
      fs.existsSync(path.join(root, p))
    );

    if (!exists) {
      return { status: 'warning', message: '缺少集成测试', details: '建议添加integration测试目录' };
    }

    return { status: 'passed', message: '集成测试目录存在' };
  },

  'checkBoundaryTests': async (root) => {
    // 修复：原只找 src/core/BrainSystem.test.js / test/BrainSystem.test.js（过时路径，
    // 项目测试在 tests/unit/*.test.js，恒找不到 → 永远误报 warning）→ 改为扫描实际测试目录
    const testDir = path.join(root, 'tests', 'unit');
    const files = fs.existsSync(testDir)
      ? fs.readdirSync(testDir).filter((f) => f.endsWith('.test.js'))
      : [];
    if (files.length === 0) {
      return { status: 'warning', message: '缺少测试文件', details: 'tests/unit 下无 *.test.js' };
    }
    const hasBoundary = files.some((f) => {
      const content = fs.readFileSync(path.join(testDir, f), 'utf-8');
      return /边界|boundary|edge|空输入|超长|null|undefined|empty|large/.test(content);
    });
    if (!hasBoundary) {
      return { status: 'warning', message: '边界测试不完整', details: '建议添加更多边界条件测试' };
    }
    return { status: 'passed', message: '边界测试覆盖' };
  },

  'checkErrorTests': async (root) => {
    const testDir = path.join(root, 'tests', 'unit');
    const files = fs.existsSync(testDir)
      ? fs.readdirSync(testDir).filter((f) => f.endsWith('.test.js'))
      : [];
    if (files.length === 0) {
      return { status: 'warning', message: '缺少测试文件', details: 'tests/unit 下无 *.test.js' };
    }
    const hasErrorTests = files.some((f) => {
      const content = fs.readFileSync(path.join(testDir, f), 'utf-8');
      return /catch|throw|reject|错误|异常|error|rejects\.toThrow/.test(content);
    });
    if (!hasErrorTests) {
      return { status: 'warning', message: '缺少错误场景测试', details: '建议添加异常和错误处理测试' };
    }
    return { status: 'passed', message: '错误场景测试覆盖' };
  }


};
