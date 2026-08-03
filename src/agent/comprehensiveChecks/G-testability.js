/**
 * G-testability 维度检查实现
 *
 * 从 ComprehensiveCheckImpls.js 拆出（56项全面检查按 14 维度拆分）
 * 仅供 ComprehensiveCheckImpls.js 聚合引用
 */

const fs = require('fs');
const path = require('path');
module.exports = {
  'checkUnitTests': async (root, files) => {
    const testPatterns = ['.test.js', '.spec.js', 'test/', 'tests/', '__tests__/'];
    const hasTests = files.some((f) => testPatterns.some((p) => f.includes(p)));

    const testFile = path.join(root, 'src/core/BrainSystem.test.js');
    if (fs.existsSync(testFile)) {
      return { status: 'passed', message: '单元测试文件存在' };
    }

    if (!hasTests) {
      return { status: 'failed', message: '缺少单元测试', details: '建议添加*.test.js文件' };
    }

    return { status: 'passed', message: '单元测试存在' };
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
    const testFiles = [
      'src/core/BrainSystem.test.js',
      'test/BrainSystem.test.js'
    ];

    const exists = testFiles.find((f) => fs.existsSync(path.join(root, f)));

    if (!exists) {
      return { status: 'warning', message: '缺少边界测试', details: '建议在测试中添加边界条件覆盖' };
    }

    const content = fs.readFileSync(path.join(root, exists), 'utf-8');
    const hasBoundary = content.includes('边界') ||
                        content.includes('boundary') ||
                        content.includes('edge') ||
                        content.includes('max') ||
                        content.includes('min');

    if (!hasBoundary) {
      return { status: 'warning', message: '边界测试不完整', details: '建议添加更多边界条件测试' };
    }

    return { status: 'passed', message: '边界测试覆盖' };
  },

  'checkErrorTests': async (root) => {
    const testFiles = [
      'src/core/BrainSystem.test.js',
      'test/BrainSystem.test.js'
    ];

    const exists = testFiles.find((f) => fs.existsSync(path.join(root, f)));

    if (!exists) {
      return { status: 'warning', message: '缺少错误场景测试', details: '建议添加try-catch和错误处理测试' };
    }

    const content = fs.readFileSync(path.join(root, exists), 'utf-8');
    const hasErrorTests = content.includes('catch') ||
                          content.includes('throw') ||
                          content.includes('reject') ||
                          content.includes('error');

    if (!hasErrorTests) {
      return { status: 'warning', message: '缺少错误场景测试', details: '建议添加异常和错误处理测试' };
    }

    return { status: 'passed', message: '错误场景测试覆盖' };
  }


};
