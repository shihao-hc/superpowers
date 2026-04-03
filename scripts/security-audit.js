/**
 * Security Audit Script
 * Scans code for common vulnerabilities
 */

const fs = require('fs');
const path = require('path');

const files = [
  'src/skills/market/VerticalDomainMarket.js',
  'src/skills/monitoring/AlertNotificationSystem.js',
  'src/skills/monitoring/SkillMonitoringSystem.js',
  'src/skills/monitoring/FeedbackCollectionSystem.js',
  'src/chat/ChatWebSocketHandler.js',
  'src/skills/agent/SkillDiscovery.js',
  'src/skills/agent/SessionManager.js',
  'src/skills/agent/MultimodalPresenter.js',
  'src/skills/agent/AsyncExecutor.js',
  'frontend/chat.html',
  'frontend/vertical-markets.html'
];

const checks = [
  { pattern: /eval\s*\(/g, name: 'eval() 使用', severity: 'HIGH' },
  { pattern: /innerHTML\s*=/g, name: 'innerHTML 赋值', severity: 'MEDIUM' },
  { pattern: /document\.write/g, name: 'document.write', severity: 'MEDIUM' },
  { pattern: /localStorage\.setItem[^;]*[^+]\s*;/g, name: 'localStorage 未序列化', severity: 'LOW' },
  { pattern: /fetch\s*\([^)]*\+\s*['"`]/g, name: 'URL 拼接注入', severity: 'HIGH' },
  { pattern: /new\s+Function\s*\(/g, name: 'new Function()', severity: 'HIGH' }
];

console.log('=== 安全审计检查 ===\n');

const issues = [];

for (const file of files) {
  const fullPath = path.join(process.cwd(), file);
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    for (const check of checks) {
      const matches = content.match(check.pattern);
      if (matches) {
        issues.push({
          file,
          issue: check.name,
          severity: check.severity,
          count: matches.length
        });
      }
    }
  } catch (e) {
    console.log(`⚠️ 无法读取 ${file}`);
  }
}

if (issues.length === 0) {
  console.log('✅ 未发现明显安全问题\n');
} else {
  console.log(`发现 ${issues.length} 个潜在问题:\n`);
  for (const issue of issues) {
    console.log(`[${issue.severity}] ${issue.file}: ${issue.issue} (${issue.count}处)`);
  }
  console.log('');
}

module.exports = { issues };
