/**
 * J-deployment 维度检查实现
 *
 * 从 ComprehensiveCheckImpls.js 拆出（56项全面检查按 14 维度拆分）
 * 仅供 ComprehensiveCheckImpls.js 聚合引用
 */

const fs = require('fs');
const path = require('path');
module.exports = {
  'checkEnvVariables': async (root, files) => {
    const hasEnvUsage = files.some((f) =>
      fs.readFileSync(f, 'utf-8').includes('process.env')
    );

    const hasEnvFile = fs.existsSync(path.join(root, '.env')) ||
                        fs.existsSync(path.join(root, '.env.example'));

    if (!hasEnvUsage) {
      return { status: 'warning', message: '未使用环境变量', details: '建议使用process.env管理配置' };
    }

    if (!hasEnvFile) {
      return { status: 'warning', message: '缺少.env文件', details: '建议创建.env.example作为模板' };
    }

    return { status: 'passed', message: '环境变量使用正确' };
  },

  'checkContainerization': async (root) => {
    const dockerFiles = ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml'];
    const hasDocker = dockerFiles.some((f) => fs.existsSync(path.join(root, f)));

    if (!hasDocker) {
      return { status: 'warning', message: '缺少容器化配置', details: '建议添加Dockerfile和docker-compose.yml' };
    }

    return { status: 'passed', message: '容器化配置存在' };
  },

  'checkCICD': async (root) => {
    const cicdFiles = [
      '.github/workflows',
      '.gitlab-ci.yml',
      'Jenkinsfile',
      '.circleci/config.yml',
      'azure-pipelines.yml'
    ];

    const exists = cicdFiles.some((f) =>
      fs.existsSync(path.join(root, f))
    );

    if (!exists) {
      return { status: 'warning', message: '缺少CI/CD配置', details: '建议配置GitHub Actions或其他CI/CD' };
    }

    return { status: 'passed', message: 'CI/CD配置存在' };
  },

  'checkVersionConsistency': async (root) => {
    const pkgPath = path.join(root, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      return { status: 'warning', message: '缺少package.json' };
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const version = pkg.version;

    // 1.0.0是正常的初始化版本，不警告
    if (!version || version === '0.0.0') {
      return { status: 'warning', message: '版本号未设置', details: `当前版本: ${version || 'undefined'}` };
    }

    // 检查README和package.json版本是否一致
    const readmePath = path.join(root, 'README.md');
    if (fs.existsSync(readmePath)) {
      const readme = fs.readFileSync(readmePath, 'utf-8');
      const readmeVersion = readme.match(/v?(\d+\.\d+\.\d+)/);
      if (readmeVersion && readmeVersion[1] !== version) {
        return { status: 'warning', message: '版本不一致', details: `README: ${readmeVersion[1]}, package.json: ${version}` };
      }
    }

    return { status: 'passed', message: `版本一致: ${version}` };
  }


};
