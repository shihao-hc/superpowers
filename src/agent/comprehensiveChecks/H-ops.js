/**
 * H-ops 维度检查实现
 *
 * 从 ComprehensiveCheckImpls.js 拆出（56项全面检查按 14 维度拆分）
 * 仅供 ComprehensiveCheckImpls.js 聚合引用
 */

const fs = require('fs');
const path = require('path');
module.exports = {
  'checkBackup': async (root, files) => {
    const backupFiles = ['backup', 'backups', '.backup', 'scripts/backup'];
    const exists = backupFiles.some((f) =>
      fs.existsSync(path.join(root, f)) ||
      fs.existsSync(path.join(root, 'scripts', f))
    );

    // 检查是否有机制
    const _hasBackupCode = files.some((f) =>
      fs.readFileSync(f, 'utf-8').includes('backup') ||
      fs.readFileSync(f, 'utf-8').includes('dump')
    );

    if (!exists) {
      return { status: 'warning', message: '缺少备份机制', details: '建议添加自动备份脚本' };
    }

    return { status: 'passed', message: '备份机制存在' };
  },

  'checkMonitoring': async (root, files) => {
    let hasMetrics = false;
    let hasPrometheus = false;

    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8').toLowerCase();
      if (content.includes('metrics') || content.includes('monitor')) {hasMetrics = true;}
      if (content.includes('prometheus')) {hasPrometheus = true;}
      if (hasMetrics && hasPrometheus) {break;}
    }

    if (!hasMetrics && !hasPrometheus) {
      return { status: 'warning', message: '缺少监控指标', details: '建议添加Prometheus指标暴露' };
    }

    return { status: 'passed', message: '监控指标存在' };
  },

  'checkAlerts': async (root, files) => {
    let hasAlerts = false;

    for (const file of files.slice(0, 10)) {
      const content = fs.readFileSync(file, 'utf-8').toLowerCase();
      if (content.includes('alert') || content.includes('warning') || content.includes('notify')) {
        hasAlerts = true;
        break;
      }
    }

    if (!hasAlerts) {
      return { status: 'warning', message: '缺少告警配置', details: '建议配置错误告警机制' };
    }

    return { status: 'passed', message: '告警配置存在' };
  },

  'checkLogLevels': async (root, files) => {
    const logLevels = ['debug', 'info', 'warn', 'error'];
    const foundLevels = [];

    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(file, 'utf-8').toLowerCase();
      for (const level of logLevels) {
        if (content.includes(level) && !foundLevels.includes(level)) {
          foundLevels.push(level);
        }
      }
    }

    if (foundLevels.length < 2) {
      return { status: 'warning', message: '日志级别不完整', details: `仅发现: ${foundLevels.join(', ')}` };
    }

    return { status: 'passed', message: `日志级别: ${foundLevels.join(', ')}` };
  },

  'checkDisasterRecovery': async (root) => {
    const recoveryFiles = ['docs/recovery.md', 'docs/disaster.md', 'RECOVERY.md'];
    const exists = recoveryFiles.some((f) => fs.existsSync(path.join(root, f)));

    const _hasRecoveryCode = (files) => files.some((f) =>
      fs.readFileSync(f, 'utf-8').includes('recovery') ||
      fs.readFileSync(f, 'utf-8').includes('failover') ||
      fs.readFileSync(f, 'utf-8').includes('replicate')
    );

    if (!exists) {
      return { status: 'warning', message: '缺少容灾恢复文档', details: '建议添加灾难恢复方案' };
    }

    return { status: 'passed', message: '容灾恢复机制存在' };
  }


};
