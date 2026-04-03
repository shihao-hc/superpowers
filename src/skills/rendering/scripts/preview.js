#!/usr/bin/env node
/**
 * 快速预览脚本
 * 用法: node scripts/preview.js <file-path>
 */

const { SkillRenderer } = require('../SkillRenderer');
const path = require('path');
const fs = require('fs');

const renderer = new SkillRenderer();
const filePath = process.argv[2];

if (!filePath) {
  console.error('用法: node scripts/preview.js <file-path>');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`文件不存在: ${filePath}`);
  process.exit(1);
}

const content = fs.readFileSync(filePath);
const filename = path.basename(filePath);

const preview = renderer.createPreview(content, filename, {
  title: `预览: ${filename}`
});

console.log('预览已创建:');
console.log(`  ID: ${preview.id}`);
console.log(`  URL: ${preview.url}`);
console.log(`  类型: ${preview.type}`);
