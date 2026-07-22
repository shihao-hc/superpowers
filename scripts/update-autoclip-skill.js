#!/usr/bin/env node
/**
 * update-autoclip-skill.js - AutoClip 项目更新脚本
 * 
 * 用法: node scripts/update-autoclip-skill.js [--check-only]
 *       node scripts/update-autoclip-skill.js [--update]
 */

const ProjectTracker = require('../src/tracking/ProjectTracker');

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check-only');
  const update = args.includes('--update') || !checkOnly;

  console.log('='.repeat(50));
  console.log('AutoClip 项目更新检查脚本');
  console.log('='.repeat(50));

  const tracker = new ProjectTracker();

  console.log('\n检查更新...\n');

  const results = await tracker.checkAllUpdates();

  const autoclipResult = results.find(r => r.projectName === 'AutoClip');

  if (autoclipResult) {
    if (autoclipResult.hasUpdate) {
      console.log(`\n发现 AutoClip 新版本:`);
      console.log(`  最新版本: ${autoclipResult.latestVersion}`);
      console.log(`  发布日期: ${autoclipResult.publishedAt}`);
      console.log(`  新功能: ${autoclipResult.changelog.join(', ') || '无'}`);

      if (update) {
        tracker.updateSkillMarkdown(autoclipResult.projectName, autoclipResult);
      }
    } else {
      console.log(`\nAutoClip: 无更新 (${autoclipResult.currentVersion})`);
    }
  } else {
    console.log('\n未找到 AutoClip 追踪配置');
  }

  console.log('\n' + '='.repeat(50));
}

main().catch(console.error);
