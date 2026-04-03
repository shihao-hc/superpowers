# SkillRenderer API 参考

## 类: SkillRenderer

### 构造函数

```javascript
new SkillRenderer(options = {})
```

**选项:**
- `previewDir`: 预览文件存储目录
- `templatesDir`: 模板文件存储目录  
- `maxPreviewSize`: 最大预览文件大小 (默认 10MB)
- `cacheTTL`: 缓存过期时间 (默认 1小时)

### 预览方法

#### createPreview(data, filename, options)
通用预览创建方法，自动根据文件扩展名选择合适的预览类型。

#### createImagePreview(buffer, filename, options)
创建图片预览，支持 PNG/JPG/GIF/WebP/SVG/BMP。

#### createHTMLPreview(content, filename, options)
创建 HTML 预览，自动进行 XSS 防护。

#### createMarkdownPreview(content, filename, options)
创建 Markdown 预览，转换为 HTML。

#### createTextPreview(content, filename, options)
创建文本/代码预览，带语法高亮。

#### createPDFPreview(buffer, filename, options)
创建 PDF 预览。

#### getPreview(previewId)
根据 ID 获取预览信息。

#### deletePreview(previewId)
删除指定预览。

#### cleanupExpiredPreviews(maxAge)
清理过期预览。

### 模板方法

#### listTemplates(options)
列出模板，支持分类、搜索、分页。

#### getTemplate(templateId)
获取单个模板。

#### createTemplate(templateData)
创建新模板。

#### updateTemplate(templateId, updates)
更新模板。

#### deleteTemplate(templateId)
删除模板。

#### renderTemplate(templateId, data)
使用数据渲染模板。

#### validateTemplateData(templateId, data)
验证模板数据。

## 安全特性

1. **XSS 防护**: 所有 HTML 内容自动转义
2. **原型污染防护**: 检查 `__proto__`、`constructor`、`prototype`
3. **路径遍历防护**: 使用 `isPathSafe()` 验证路径
4. **CSP 策略**: HTML 预览添加 Content-Security-Policy 头
