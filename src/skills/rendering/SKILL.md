---
name: 'skill-renderer'
description: 'Skill rendering system with preview and template support. Use for generating previews of images, HTML, Markdown, PDF, and code files, or rendering documents from templates.'
---

# Skill Renderer

统一技能渲染系统，合并了预览和模板功能。

## 功能

### 预览功能
- **图片预览**: PNG, JPG, GIF, WebP, SVG, BMP
- **HTML预览**: 安全沙箱中的HTML渲染
- **Markdown预览**: Markdown转HTML并高亮
- **文本预览**: 代码语法高亮
- **PDF预览**: PDF查看器包装

### 模板功能
- **模板列表**: 按分类、标签、关键词搜索
- **模板渲染**: 使用 `{{variable}}` 语法填充数据
- **数据验证**: 检查必填字段

## 使用方法

```javascript
const { getSkillRenderer } = require('./skills/rendering/SkillRenderer');

const renderer = getSkillRenderer();

// 创建预览
const preview = renderer.createPreview(content, 'report.html', {
  title: '报告预览'
});

// 渲染模板
const result = renderer.renderTemplate('weekly-report', {
  week: '2026-W12',
  author: '张三',
  completedTasks: '完成了用户认证模块',
  nextWeekPlan: '开始订单模块开发'
});
```

## API

### 预览方法

| 方法 | 说明 |
|------|------|
| `createPreview(data, filename, options)` | 通用预览创建 |
| `createImagePreview(buffer, filename, options)` | 图片预览 |
| `createHTMLPreview(content, filename, options)` | HTML预览 |
| `createMarkdownPreview(content, filename, options)` | Markdown预览 |
| `createTextPreview(content, filename, options)` | 文本预览 |
| `createPDFPreview(buffer, filename, options)` | PDF预览 |
| `getPreview(previewId)` | 获取预览信息 |
| `deletePreview(previewId)` | 删除预览 |
| `cleanupExpiredPreviews(maxAge)` | 清理过期预览 |

### 模板方法

| 方法 | 说明 |
|------|------|
| `listTemplates(options)` | 列出模板 |
| `getTemplate(templateId)` | 获取单个模板 |
| `createTemplate(templateData)` | 创建模板 |
| `updateTemplate(templateId, updates)` | 更新模板 |
| `deleteTemplate(templateId)` | 删除模板 |
| `renderTemplate(templateId, data)` | 渲染模板 |
| `validateTemplateData(templateId, data)` | 验证数据 |

## 安全特性

- **XSS防护**: HTML内容自动转义
- **原型污染防护**: 输入数据验证
- **路径遍历防护**: 文件路径安全检查
- **CSP策略**: Content-Security-Policy头保护

## 默认模板

系统预置了以下模板：

| ID | 名称 | 分类 |
|----|------|------|
| `weekly-report` | 周报 | report |
| `meeting-minutes` | 会议纪要 | report |
| `leave-request` | 请假申请 | hr |

## 示例

### 预览HTML内容

```javascript
const html = '<h1>Hello World</h1><script>alert("xss")</script>';
const preview = renderer.createHTMLPreview(html, 'demo.html');
console.log(preview.url); // /api/skills/preview/{id}
```

### 使用模板生成周报

```javascript
const result = renderer.renderTemplate('weekly-report', {
  week: '2026-W12',
  author: '李四',
  completedTasks: '- 用户管理模块\n- 权限控制',
  nextWeekPlan: '- API文档编写'
});
console.log(result.content); // 渲染后的Markdown内容
```

### 创建自定义模板

```javascript
renderer.createTemplate({
  id: 'my-template',
  name: '我的模板',
  description: '自定义模板',
  category: 'custom',
  type: 'markdown',
  fields: [
    { name: 'title', label: '标题', type: 'text', required: true },
    { name: 'content', label: '内容', type: 'textarea', required: true }
  ],
  template: '# {{title}}\n\n{{content}}\n\n---\n生成时间: {{generatedAt}}'
});
```
