#!/usr/bin/env node
/**
 * check-all-updates.js - 统一更新检查脚本
 * 
 * 用法: node scripts/check-all-updates.js [--check-only]
 *       node scripts/check-all-updates.js [--update]
 */

const ProjectTracker = require('../src/tracking/ProjectTracker');

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check-only');
  const update = args.includes('--update') || !checkOnly;

  console.log('='.repeat(60));
  console.log('Skill 文档自动更新检查');
  console.log('='.repeat(60));

  const tracker = new ProjectTracker();

  console.log('\n检查所有项目更新...\n');

  const results = await tracker.checkAllUpdates();

  let hasUpdates = false;
  let updateCount = 0;

  for (const result of results) {
    if (result.hasUpdate) {
      hasUpdates = true;
      updateCount++;
      console.log(`\n[${updateCount}] ${result.projectName}:`);
      console.log(`    最新版本: ${result.latestVersion}`);
      console.log(`    当前版本: ${result.currentVersion}`);
      console.log(`    发布日期: ${result.publishedAt}`);
      if (result.changelog.length > 0) {
        console.log(`    新功能: ${result.changelog.slice(0, 3).join(', ')}`);
      }

      if (update) {
        tracker.updateSkillMarkdown(result.projectName, result);
        console.log(`    -> 已更新 SKILL.md`);
      }
    } else {
      console.log(`[✓] ${result.projectName}: ${result.currentVersion}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`总计: ${results.length} 个项目, ${updateCount} 个新版本`);

  process.exit(hasUpdates ? 1 : 0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(2);
});
