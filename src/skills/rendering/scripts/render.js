#!/usr/bin/env node
/**
 * 模板渲染脚本
 * 用法: node scripts/render.js <template-id> <data-json>
 */

const { SkillRenderer } = require('../SkillRenderer');

const renderer = new SkillRenderer();
const templateId = process.argv[2];
const dataJson = process.argv[3];

if (!templateId) {
  console.error('用法: node scripts/render.js <template-id> [data-json]');
  console.error('示例: node scripts/render.js weekly-report \'{"week":"W12","author":"张三"}\'');
  process.exit(1);
}

let data = {};
if (dataJson) {
  try {
    data = JSON.parse(dataJson);
  } catch (e) {
    console.error('JSON 解析错误:', e.message);
    process.exit(1);
  }
}

try {
  const result = renderer.renderTemplate(templateId, data);
  console.log('渲染结果:');
  console.log('='.repeat(50));
  console.log(result.content);
  console.log('='.repeat(50));
  console.log(`生成时间: ${result.generatedAt}`);
} catch (e) {
  console.error('渲染错误:', e.message);
  process.exit(1);
}
