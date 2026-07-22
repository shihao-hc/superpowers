#!/usr/bin/env node
/**
 * update-tailor-skill.js - Tailor 项目更新脚本
 * 
 * 用法: node scripts/update-tailor-skill.js [--check-only]
 *       node scripts/update-tailor-skill.js [--update]
 */

const ProjectTracker = require('../src/tracking/ProjectTracker');

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check-only');
  const update = args.includes('--update') || !checkOnly;

  console.log('='.repeat(50));
  console.log('Tailor 项目更新检查脚本');
  console.log('='.repeat(50));

  const tracker = new ProjectTracker();

  if (args.includes('--status')) {
    console.log('\n追踪状态:\n');
    const status = tracker.getStatusReport();
    for (const s of status) {
      console.log(`  ${s.name}:`);
      console.log(`    当前版本: ${s.currentVersion || '未知'}`);
      console.log(`    上次检查: ${s.lastCheckTime || '从未'}`);
    }
    return;
  }

  console.log('\n检查更新...\n');

  const results = await tracker.checkAllUpdates();

  let hasUpdates = false;

  for (const result of results) {
    if (result.hasUpdate) {
      hasUpdates = true;
      console.log(`\n发现 ${result.projectName} 新版本:`);
      console.log(`  最新版本: ${result.latestVersion}`);
      console.log(`  发布日期: ${result.publishedAt}`);
      console.log(`  新功能: ${result.changelog.join(', ') || '无'}`);

      if (update) {
        tracker.updateSkillMarkdown(result.projectName, result);
      }
    } else {
      console.log(`\n${result.projectName}: 无更新 (${result.currentVersion})`);
    }
  }

  if (!hasUpdates) {
    console.log('\n没有发现新版本。');
  }

  console.log('\n' + '='.repeat(50));
}

main().catch(console.error);