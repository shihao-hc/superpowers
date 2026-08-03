/**
 * D-config 维度检查实现
 *
 * 从 ComprehensiveCheckImpls.js 拆出（56项全面检查按 14 维度拆分）
 * 仅供 ComprehensiveCheckImpls.js 聚合引用
 */

const fs = require('fs');
const path = require('path');
module.exports = {
  'checkConfigManagement': async (root, files) => {
    const hasEnv = files.some((f) =>
      fs.readFileSync(f, 'utf-8').includes('process.env')
    );

    const hasConfig = fs.existsSync(path.join(root, 'config')) ||
                      fs.existsSync(path.join(root, 'src/config')) ||
                      files.some((f) => f.includes('config'));

    if (!hasEnv && !hasConfig) {
      return { status: 'warning', message: '未使用环境变量或配置文件', details: '建议使用config模块管理配置' };
    }

    return { status: 'passed', message: '配置管理检查通过' };
  },

  'checkEnvDifferences': async (root, _files) => {
    const envFiles = ['.env', '.env.local', '.env.production', '.env.development'];
    const existing = envFiles.filter((f) => fs.existsSync(path.join(root, f)));

    if (existing.length === 0) {
      return { status: 'warning', message: '缺少环境配置文件', details: '建议创建.env文件管理环境差异' };
    }

    return { status: 'passed', message: `环境配置文件: ${existing.join(', ')}` };
  },

  'checkDependencies': async (root, _files) => {
    const pkgPath = path.join(root, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      return { status: 'failed', message: '缺少package.json' };
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = Object.keys(pkg.dependencies || {}).length;
    const devDeps = Object.keys(pkg.devDependencies || {}).length;

    if (deps > 100) {
      return { status: 'warning', message: '依赖过多', details: `${deps}生产依赖, ${devDeps}开发依赖` };
    }

    return { status: 'passed', message: `依赖检查通过 (${deps}+${devDeps})` };
  }


};
