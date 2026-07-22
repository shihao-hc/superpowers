#!/usr/bin/env node
/**
 * add-maintenance-to-all.js - 为所有开源项目 SKILL.md 添加维护说明
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = 'D:/龙虾/.opencode/skills';
const TEMPLATE_FILE = 'D:/龙虾/.opencode/skills/_templates/maintenance-section.md';

const maintenanceSection = `
## 维护说明

> **重要**: 本 SKILL.md 是一个**主动维护的文档**，会定期更新以反映项目的最新状态，而非被动等待原始 README.md 更新。

### 更新机制

| 来源 | 说明 |
|------|------|
| GitHub Releases | 自动抓取最新 releases |
| 项目追踪器 | \`src/tracking/ProjectTracker.js\` |
| 更新脚本 | \`scripts/update-tailor-skill.js\` |

### 手动检查更新

\`\`\`bash
# 检查所有项目更新
node scripts/update-tailor-skill.js --check-only

# 检查并自动更新
node scripts/update-tailor-skill.js --update

# 查看追踪状态
node scripts/update-tailor-skill.js --status
\`\`\`

### 更新内容

当检测到新版本时，会自动更新：

- [ ] **版本号**: 更新到最新版本
- [ ] **更新日志**: 追加新的版本和变更内容
- [ ] **功能说明**: 根据 changelog 提取新增功能
- [ ] **依赖库**: 同步 requirements.txt 的变更
- [ ] **特别感谢**: 补充新的依赖项目
`;

function hasMaintenanceSection(content) {
  return content.includes('## 维护说明') || content.includes('## 主动维护');
}

function addMaintenanceSection(content) {
  // 如果已有维护说明，跳过
  if (hasMaintenanceSection(content)) {
    return { added: false, skipped: true };
  }

  // 查找最佳插入位置（在 ## 关键词 之前）
  let insertPos = content.indexOf('## 关键词');
  if (insertPos === -1) {
    // 备选：在 ## 特别感谢 之前
    insertPos = content.indexOf('## 特别感谢');
  }
  if (insertPos === -1) {
    // 备选：在 ## 应用场景 之前
    insertPos = content.indexOf('## 应用场景');
  }
  if (insertPos === -1) {
    // 备选：在文件末尾之前（向前找 ## 标题）
    const lastH2 = content.lastIndexOf('\n## ');
    insertPos = lastH2 > 0 ? lastH2 : content.length;
  }

  const newContent = content.slice(0, insertPos) + maintenanceSection + '\n' + content.slice(insertPos);

  return { added: true, skipped: false, newContent };
}

function processSkillFiles() {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.error(`目录不存在: ${SKILLS_DIR}`);
    return;
  }

  const results = {
    added: [],
    skipped: [],
    errors: []
  };

  // 遍历所有 SKILL.md 文件
  function traverseDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.name === '_templates') continue;

      if (entry.isDirectory()) {
        traverseDir(fullPath);
      } else if (entry.name === 'SKILL.md') {
        const skillPath = path.dirname(fullPath);
        const skillName = path.basename(skillPath);

        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const result = addMaintenanceSection(content);

          if (result.added && !result.skipped) {
            fs.writeFileSync(fullPath, result.newContent);
            results.added.push(skillName);
          } else {
            results.skipped.push(skillName);
          }
        } catch (e) {
          results.errors.push({ skillName, error: e.message });
        }
      }
    }
  }

  traverseDir(SKILLS_DIR);

  // 输出结果
  console.log('\n' + '='.repeat(50));
  console.log('维护说明添加结果');
  console.log('='.repeat(50));

  if (results.added.length > 0) {
    console.log(`\n已添加 (${results.added.length}):`);
    results.added.forEach(n => console.log(`  ✓ ${n}`));
  }

  if (results.skipped.length > 0) {
    console.log(`\n已存在或跳过 (${results.skipped.length}):`);
    results.skipped.slice(0, 10).forEach(n => console.log(`  - ${n}`));
    if (results.skipped.length > 10) {
      console.log(`  ... 还有 ${results.skipped.length - 10} 个`);
    }
  }

  if (results.errors.length > 0) {
    console.log(`\n错误 (${results.errors.length}):`);
    results.errors.forEach(e => console.log(`  ✗ ${e.skillName}: ${e.error}`));
  }

  console.log('\n' + '='.repeat(50));
  console.log(`总计: 添加 ${results.added.length}, 跳过 ${results.skipped.length}`);
  console.log('='.repeat(50) + '\n');
}

processSkillFiles();