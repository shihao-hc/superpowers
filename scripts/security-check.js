#!/usr/bin/env node
// 简单安全检查脚本

const fs = require('fs');
const path = require('path');

const issues = [];

function checkFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(process.cwd(), filePath);

    // 检查硬编码密钥
    if (/password\s*[:=]\s*['"][^'"]+['"]/i.test(content)) {
      issues.push({ file: relativePath, type: 'SECRET', message: '可能包含硬编码密码' });
    }

    // 检查 eval
    if (/\beval\s*\(/.test(content)) {
      issues.push({ file: relativePath, type: 'CRITICAL', message: '使用了 eval()' });
    }

    // 检查 innerHTML (仅前端文件)
    if (filePath.includes('frontend') && /\.innerHTML\s*=/.test(content)) {
      issues.push({ file: relativePath, type: 'MEDIUM', message: '使用了 innerHTML' });
    }

    // 检查 unsafe-inline
    if (content.includes("'unsafe-inline'")) {
      issues.push({ file: relativePath, type: 'HIGH', message: "CSP 包含 'unsafe-inline'" });
    }

  } catch (e) {
    // 跳过无法读取的文件
  }
}

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!['node_modules', '.git', '.opencode'].includes(entry.name)) {
        scanDir(fullPath);
      }
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.html')) {
      checkFile(fullPath);
    }
  }
}

console.log('🔍 运行安全检查...\n');

scanDir('src');
scanDir('server');
scanDir('frontend');

if (issues.length === 0) {
  console.log('✅ 未发现安全问题');
} else {
  console.log(`⚠️  发现 ${issues.length} 个潜在问题:\n`);

  const critical = issues.filter(i => i.type === 'CRITICAL');
  const high = issues.filter(i => i.type === 'HIGH');
  const medium = issues.filter(i => i.type === 'MEDIUM');
  const low = issues.filter(i => i.type === 'SECRET');

  if (critical.length > 0) {
    console.log('🔴 CRITICAL:');
    critical.forEach(i => console.log(`   ${i.file}: ${i.message}`));
  }

  if (high.length > 0) {
    console.log('🟠 HIGH:');
    high.forEach(i => console.log(`   ${i.file}: ${i.message}`));
  }

  if (medium.length > 0) {
    console.log('🟡 MEDIUM:');
    medium.forEach(i => console.log(`   ${i.file}: ${i.message}`));
  }

  if (low.length > 0) {
    console.log('🔵 SECRET:');
    low.forEach(i => console.log(`   ${i.file}: ${i.message}`));
  }
}

process.exit(issues.filter(i => i.type === 'CRITICAL').length > 0 ? 1 : 0);
