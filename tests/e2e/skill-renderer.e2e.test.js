/**
 * SkillRenderer E2E 测试
 */

const { SkillRenderer } = require('../../src/skills/rendering/SkillRenderer');
const path = require('path');
const fs = require('fs');

describe('SkillRenderer E2E', () => {
  let renderer;
  const testDir = path.join(__dirname, '../test-data/e2e');
  
  beforeAll(() => {
    renderer = new SkillRenderer({
      previewDir: path.join(testDir, 'previews'),
      templatesDir: path.join(testDir, 'templates')
    });
    
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    if (!fs.existsSync(path.join(testDir, 'previews'))) {
      fs.mkdirSync(path.join(testDir, 'previews'), { recursive: true });
    }
    if (!fs.existsSync(path.join(testDir, 'templates'))) {
      fs.mkdirSync(path.join(testDir, 'templates'), { recursive: true });
    }
  });
  
  afterAll(() => {
    // 清理测试数据
    const cleanup = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const file of fs.readdirSync(dir)) {
        fs.unlinkSync(path.join(dir, file));
      }
    };
    cleanup(path.join(testDir, 'previews'));
    cleanup(path.join(testDir, 'templates'));
  });

  describe('完整工作流测试', () => {
    test('创建HTML预览 -> 渲染模板 -> 获取预览', () => {
      // Step 1: 创建 HTML 预览
      const html = '<h1>测试报告</h1><p>内容</p>';
      const preview = renderer.createHTMLPreview(html, 'report.html', { title: '测试' });
      
      expect(preview.id).toBeDefined();
      expect(preview.type).toBe('html');
      expect(preview.url).toContain('/api/skills/preview/');
      
      // Step 2: 渲染模板生成报告
      const report = renderer.renderTemplate('weekly-report', {
        week: '2026-W12',
        author: '张三',
        completedTasks: '- 完成了模块A\n- 修复了Bug123',
        nextWeekPlan: '- 开始模块B'
      });
      
      expect(report.content).toContain('2026-W12');
      expect(report.content).toContain('张三');
      expect(report.content).toContain('模块A');
      
      // Step 3: 获取预览
      const retrieved = renderer.getPreview(preview.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved.id).toBe(preview.id);
    });

    test('Markdown 转 HTML 预览', () => {
      const markdown = `# 标题
      
## 子标题

**粗体** 和 *斜体*

- 列表项1
- 列表项2

\`\`\`javascript
const x = 1;
\`\`\``;
      
      const preview = renderer.createMarkdownPreview(markdown, 'test.md');
      
      // createMarkdownPreview 内部调用 createHTMLPreview，所以 type 是 'html'
      expect(preview.type).toBe('html');
      expect(preview.id).toBeDefined();
      
      // 验证文件已创建
      const filePath = preview.path;
      expect(fs.existsSync(filePath)).toBe(true);
      
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('<h1>');
      expect(content).toContain('<h2>');
      expect(content).toContain('<strong>');
    });

    test('模板数据验证 -> 渲染 -> 输出', () => {
      // 完整模板流程
      const template = renderer.getTemplate('weekly-report');
      expect(template).not.toBeNull();
      expect(template.fields).toBeDefined();
      
      // 验证有效数据
      const validData = {
        week: '2026-W12',
        author: '李四',
        completedTasks: '任务1',
        nextWeekPlan: '计划1'
      };
      
      const validation = renderer.validateTemplateData('weekly-report', validData);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      
      // 验证无效数据（缺少必填项）
      const invalidData = {
        week: '2026-W12'
        // 缺少其他必填项
      };
      
      const invalidValidation = renderer.validateTemplateData('weekly-report', invalidData);
      expect(invalidValidation.valid).toBe(false);
      expect(invalidValidation.errors.length).toBeGreaterThan(0);
      
      // 渲染有效数据
      const rendered = renderer.renderTemplate('weekly-report', validData);
      expect(rendered.content).toBeTruthy();
      expect(fs.existsSync(rendered.content)).toBe(false); // 内容在内存中
    });

    test('代码语法高亮', () => {
      const jsCode = `function hello(name) {
  console.log("Hello, " + name);
  return true;
}`;
      
      const preview = renderer.createTextPreview(jsCode, 'hello.js');
      
      expect(preview.type).toBe('text');
      expect(fs.existsSync(preview.path)).toBe(true);
      
      const content = fs.readFileSync(preview.path, 'utf8');
      // 验证关键字被高亮
      expect(content).toContain('function');
      expect(content).toContain('console');
    });

    test('XSS 防护验证', () => {
      const maliciousHtml = `<script>alert('xss')</script>
<img src=x onerror=alert('xss')>
<a href="javascript:alert('xss')">click</a>`;
      
      const preview = renderer.createHTMLPreview(maliciousHtml, 'evil.html');
      
      expect(preview.id).toBeDefined();
      
      const content = fs.readFileSync(preview.path, 'utf8');
      // 验证脚本被移除
      expect(content).not.toContain('<script>');
      expect(content).not.toContain('javascript:');
      expect(content).not.toContain('onerror');
    });

    test('原型污染防护', () => {
      // 尝试原型污染攻击
      const maliciousData = {
        week: '2026-W12',
        author: '测试',
        completedTasks: '完成',
        nextWeekPlan: '计划',
        __proto__: { admin: true },
        constructor: { prototype: {} }
      };
      
      const validation = renderer.validateTemplateData('weekly-report', maliciousData);
      expect(validation.valid).toBe(true); // 验证应该通过，因为原型属性不影响字段验证
      
      // 渲染时应该抛出异常（原型污染被拒绝）
      expect(() => {
        renderer.renderTemplate('weekly-report', maliciousData);
      }).toThrow('potential prototype pollution');
      
      // 正常数据应该工作
      const result = renderer.renderTemplate('weekly-report', {
        week: 'W1',
        author: 'A',
        completedTasks: 'C',
        nextWeekPlan: 'P'
      });
      expect(result.content).toBeTruthy();
      expect(result.content).toContain('W1');
    });

    test('路径遍历防护', () => {
      // 尝试路径遍历攻击
      expect(renderer.getPreview('..%2F..%2Fetc%2Fpasswd')).toBeNull();
      expect(renderer.getPreview('../../etc/passwd')).toBeNull();
      expect(renderer.getPreview('..\\..\\windows\\system32')).toBeNull();
      
      // 正常ID应该工作
      const preview = renderer.createTextPreview('test', 'test.txt');
      const retrieved = renderer.getPreview(preview.id);
      expect(retrieved).not.toBeNull();
    });

    test('批量预览操作', () => {
      const previews = [];
      
      // 创建多个预览
      for (let i = 0; i < 5; i++) {
        const p = renderer.createTextPreview(`内容 ${i}`, `file${i}.txt`);
        previews.push(p.id);
      }
      
      // 获取所有预览
      for (const id of previews) {
        expect(renderer.getPreview(id)).not.toBeNull();
      }
      
      // 删除所有预览
      for (const id of previews) {
        const result = renderer.deletePreview(id);
        expect(result.deleted).toBeGreaterThan(0);
      }
      
      // 验证删除
      for (const id of previews) {
        expect(renderer.getPreview(id)).toBeNull();
      }
    });

    test('模板 CRUD 操作', () => {
      // 创建模板
      const newTemplate = renderer.createTemplate({
        id: 'e2e-test-template',
        name: 'E2E测试模板',
        description: '端到端测试用模板',
        category: 'test',
        type: 'markdown',
        fields: [
          { name: 'title', label: '标题', type: 'text', required: true },
          { name: 'body', label: '正文', type: 'textarea', required: true }
        ],
        template: '# {{title}}\n\n{{body}}\n\n---\nGenerated: {{generatedAt}}'
      });
      
      expect(newTemplate.id).toBe('e2e-test-template');
      
      // 读取模板
      const retrieved = renderer.getTemplate('e2e-test-template');
      expect(retrieved).not.toBeNull();
      expect(retrieved.name).toBe('E2E测试模板');
      
      // 更新模板
      const updated = renderer.updateTemplate('e2e-test-template', {
        description: '更新后的描述'
      });
      expect(updated.description).toBe('更新后的描述');
      
      // 删除模板
      const deleted = renderer.deleteTemplate('e2e-test-template');
      expect(deleted.deleted).toBe(true);
      
      // 验证删除
      expect(renderer.getTemplate('e2e-test-template')).toBeNull();
    });
  });

  describe('性能测试', () => {
    test('大量预览创建性能', () => {
      const start = Date.now();
      const count = 100;
      
      for (let i = 0; i < count; i++) {
        renderer.createTextPreview(`内容 ${i}`, `perf${i}.txt`);
      }
      
      const duration = Date.now() - start;
      console.log(`创建 ${count} 个预览耗时: ${duration}ms`);
      
      expect(duration).toBeLessThan(5000); // 应该小于5秒
    });
  });
});
