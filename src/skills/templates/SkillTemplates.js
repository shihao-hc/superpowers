/**
 * Skill Template Library
 * @deprecated 请使用 SkillRenderer 替代
 * 
 * 已废弃功能 (2026-03-22):
 * - 此模块已被 src/skills/rendering/SkillRenderer.js 合并
 * - 新代码请使用 getSkillRenderer() 而非 getSkillTemplates()
 * 
 * 迁移指南:
 *   旧: const { getSkillTemplates } = require('./templates/SkillTemplates');
 *   新: const { getSkillRenderer } = require('./rendering/SkillRenderer');
 */

console.warn('[弃用警告] SkillTemplates 已弃用，请使用 SkillRenderer 替代。详见 src/skills/rendering/SkillRenderer.js');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * HTML转义函数 - 防止XSS
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * 验证对象是否包含原型污染尝试
 */
function isPrototypePollutionSafe(obj) {
  if (typeof obj !== 'object' || obj === null) return true;
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  for (const key of Object.keys(obj)) {
    if (dangerousKeys.includes(key)) return false;
  }
  return true;
}

class SkillTemplates {
  constructor(options = {}) {
    this.templatesDir = options.templatesDir || path.join(process.cwd(), 'data', 'templates');
    this.templatesFile = path.join(this.templatesDir, 'templates.json');
    
    this.templates = new Map();
    this.categories = new Map();
    
    this._ensureTemplatesDir();
    this._loadTemplates();
    this._initDefaultTemplates();
  }

  _ensureTemplatesDir() {
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }
  }

  _loadTemplates() {
    try {
      if (fs.existsSync(this.templatesFile)) {
        const data = JSON.parse(fs.readFileSync(this.templatesFile, 'utf8'));
        this.templates = new Map(Object.entries(data.templates || {}));
        this.categories = new Map(Object.entries(data.categories || {}));
      }
    } catch (error) {
      console.warn('Failed to load templates:', error.message);
    }
  }

  _saveTemplates() {
    try {
      const data = {
        templates: Object.fromEntries(this.templates),
        categories: Object.fromEntries(this.categories),
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.templatesFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save templates:', error.message);
    }
  }

  _initDefaultTemplates() {
    if (this.templates.size > 0) return;

    const defaultTemplates = [
      // 周报模板
      {
        id: 'weekly-report',
        name: '周报',
        description: '标准工作周报模板',
        category: 'report',
        type: 'markdown',
        tags: ['工作', '周报', '汇报'],
        fields: [
          { name: 'week', label: '周次', type: 'text', required: true, placeholder: '2024-W01' },
          { name: 'author', label: '姓名', type: 'text', required: true },
          { name: 'department', label: '部门', type: 'text', required: false },
          { name: 'completedTasks', label: '本周完成', type: 'textarea', required: true },
          { name: 'inProgressTasks', label: '进行中任务', type: 'textarea', required: false },
          { name: 'nextWeekPlan', label: '下周计划', type: 'textarea', required: true },
          { name: 'issues', label: '遇到的问题', type: 'textarea', required: false },
          { name: 'suggestions', label: '建议', type: 'textarea', required: false }
        ],
        template: `# 工作周报

## 基本信息
- **周次**: {{week}}
- **姓名**: {{author}}
- **部门**: {{department}}
- **日期**: {{date}}

---

## 本周完成工作
{{completedTasks}}

## 进行中任务
{{inProgressTasks}}

## 下周工作计划
{{nextWeekPlan}}

## 遇到的问题
{{issues}}

## 建议与想法
{{suggestions}}

---
*报告生成时间: {{generatedAt}}*`
      },
      
      // 会议纪要模板
      {
        id: 'meeting-minutes',
        name: '会议纪要',
        description: '标准会议纪要模板',
        category: 'report',
        type: 'markdown',
        tags: ['会议', '纪要', '记录'],
        fields: [
          { name: 'title', label: '会议主题', type: 'text', required: true },
          { name: 'date', label: '会议日期', type: 'date', required: true },
          { name: 'time', label: '会议时间', type: 'time', required: true },
          { name: 'location', label: '会议地点', type: 'text', required: false },
          { name: 'attendees', label: '参会人员', type: 'textarea', required: true },
          { name: 'agenda', label: '会议议程', type: 'textarea', required: true },
          { name: 'discussions', label: '讨论内容', type: 'textarea', required: true },
          { name: 'decisions', label: '决议事项', type: 'textarea', required: true },
          { name: 'actionItems', label: '行动项', type: 'textarea', required: false },
          { name: 'nextMeeting', label: '下次会议', type: 'text', required: false }
        ],
        template: `# 会议纪要

## 会议信息
- **主题**: {{title}}
- **日期**: {{date}}
- **时间**: {{time}}
- **地点**: {{location}}

## 参会人员
{{attendees}}

---

## 会议议程
{{agenda}}

## 讨论内容
{{discussions}}

## 决议事项
{{decisions}}

## 行动项
{{actionItems}}

## 下次会议
{{nextMeeting}}

---
*纪要整理人: {{author}}*
*整理时间: {{generatedAt}}*`
      },
      
      // 合同模板
      {
        id: 'contract',
        name: '服务合同',
        description: '标准服务合同模板',
        category: 'legal',
        type: 'markdown',
        tags: ['合同', '法律', '服务'],
        fields: [
          { name: 'contractNumber', label: '合同编号', type: 'text', required: true },
          { name: 'partyA', label: '甲方', type: 'text', required: true },
          { name: 'partyARepresentative', label: '甲方代表', type: 'text', required: true },
          { name: 'partyB', label: '乙方', type: 'text', required: true },
          { name: 'partyBRepresentative', label: '乙方代表', type: 'text', required: true },
          { name: 'serviceContent', label: '服务内容', type: 'textarea', required: true },
          { name: 'servicePeriod', label: '服务期限', type: 'text', required: true },
          { name: 'totalAmount', label: '合同总金额', type: 'number', required: true },
          { name: 'paymentTerms', label: '付款方式', type: 'textarea', required: true },
          { name: 'terms', label: '其他条款', type: 'textarea', required: false }
        ],
        template: `# 服务合同

**合同编号**: {{contractNumber}}

---

## 甲方（委托方）
- **名称**: {{partyA}}
- **代表人**: {{partyARepresentative}}

## 乙方（服务方）
- **名称**: {{partyB}}
- **代表人**: {{partyBRepresentative}}

---

## 第一条 服务内容
{{serviceContent}}

## 第二条 服务期限
{{servicePeriod}}

## 第三条 合同金额
合同总金额为人民币 **{{totalAmount}}** 元。

## 第四条 付款方式
{{paymentTerms}}

## 第五条 其他条款
{{terms}}

---

## 签章

**甲方签章**: ________________  **日期**: {{date}}

**乙方签章**: ________________  **日期**: {{date}}`
      },
      
      // 发票模板
      {
        id: 'invoice',
        name: '发票',
        description: '标准发票模板',
        category: 'finance',
        type: 'html',
        tags: ['发票', '财务', '开票'],
        fields: [
          { name: 'invoiceNumber', label: '发票号码', type: 'text', required: true },
          { name: 'invoiceDate', label: '开票日期', type: 'date', required: true },
          { name: 'sellerName', label: '销售方名称', type: 'text', required: true },
          { name: 'sellerTaxId', label: '销售方税号', type: 'text', required: true },
          { name: 'buyerName', label: '购买方名称', type: 'text', required: true },
          { name: 'buyerTaxId', label: '购买方税号', type: 'text', required: true },
          { name: 'items', label: '商品/服务明细', type: 'table', required: true },
          { name: 'subtotal', label: '合计金额', type: 'number', required: true },
          { name: 'tax', label: '税额', type: 'number', required: true },
          { name: 'total', label: '价税合计', type: 'number', required: true }
        ],
        template: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: SimSun, serif; padding: 40px; }
    .invoice { border: 2px solid #333; padding: 20px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 1px solid #333; padding-bottom: 15px; }
    .title { font-size: 24px; font-weight: bold; color: #c00; }
    .info-row { display: flex; justify-content: space-between; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #333; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    .total-row { font-weight: bold; background: #fffacd; }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="title">增 值 税 发 票</div>
      <div>发票号码: {{invoiceNumber}}</div>
      <div>开票日期: {{invoiceDate}}</div>
    </div>
    
    <div class="info-row">
      <div><strong>销售方:</strong> {{sellerName}}</div>
      <div><strong>税号:</strong> {{sellerTaxId}}</div>
    </div>
    <div class="info-row">
      <div><strong>购买方:</strong> {{buyerName}}</div>
      <div><strong>税号:</strong> {{buyerTaxId}}</div>
    </div>
    
    <table>
      <thead>
        <tr>
          <th>项目</th>
          <th>金额</th>
          <th>税率</th>
          <th>税额</th>
        </tr>
      </thead>
      <tbody>
        {{#each items}}
        <tr>
          <td>{{name}}</td>
          <td>{{amount}}</td>
          <td>{{taxRate}}</td>
          <td>{{taxAmount}}</td>
        </tr>
        {{/each}}
        <tr class="total-row">
          <td colspan="2">合计</td>
          <td>{{subtotal}}</td>
          <td>{{tax}}</td>
        </tr>
      </tbody>
    </table>
    
    <div style="text-align: right; font-size: 18px;">
      <strong>价税合计: ¥{{total}}</strong>
    </div>
  </div>
</body>
</html>`
      },
      
      // 请假申请模板
      {
        id: 'leave-request',
        name: '请假申请',
        description: '员工请假申请表',
        category: 'hr',
        type: 'markdown',
        tags: ['请假', '申请', '人事'],
        fields: [
          { name: 'applicant', label: '申请人', type: 'text', required: true },
          { name: 'department', label: '部门', type: 'text', required: true },
          { name: 'position', label: '职位', type: 'text', required: false },
          { name: 'leaveType', label: '请假类型', type: 'select', options: ['事假', '病假', '年假', '婚假', '产假', '丧假'], required: true },
          { name: 'startDate', label: '开始日期', type: 'date', required: true },
          { name: 'endDate', label: '结束日期', type: 'date', required: true },
          { name: 'duration', label: '请假时长(天)', type: 'number', required: true },
          { name: 'reason', label: '请假原因', type: 'textarea', required: true },
          { name: 'workHandover', label: '工作交接', type: 'textarea', required: false },
          { name: 'contactInfo', label: '联系方式', type: 'text', required: false }
        ],
        template: `# 请假申请

## 申请人信息
| 项目 | 内容 |
|------|------|
| 姓名 | {{applicant}} |
| 部门 | {{department}} |
| 职位 | {{position}} |

## 请假详情
| 项目 | 内容 |
|------|------|
| 请假类型 | {{leaveType}} |
| 开始日期 | {{startDate}} |
| 结束日期 | {{endDate}} |
| 请假时长 | {{duration}} 天 |

## 请假原因
{{reason}}

## 工作交接
{{workHandover}}

## 联系方式
{{contactInfo}}

---

**申请人签字**: ________________  **日期**: {{date}}

**直属上级审批**: ________________  **日期**: {{approveDate}}

**人事部门审批**: ________________  **日期**: {{hrApproveDate}}`
      },
      
      // 需求文档模板
      {
        id: 'prd',
        name: '产品需求文档',
        description: '标准产品需求文档模板',
        category: 'product',
        type: 'markdown',
        tags: ['需求', '产品', '文档'],
        fields: [
          { name: 'productName', label: '产品名称', type: 'text', required: true },
          { name: 'version', label: '版本号', type: 'text', required: true },
          { name: 'author', label: '文档编写者', type: 'text', required: true },
          { name: 'background', label: '项目背景', type: 'textarea', required: true },
          { name: 'objectives', label: '项目目标', type: 'textarea', required: true },
          { name: 'targetUsers', label: '目标用户', type: 'textarea', required: true },
          { name: 'features', label: '功能需求', type: 'textarea', required: true },
          { name: 'nonFunctional', label: '非功能需求', type: 'textarea', required: false },
          { name: 'constraints', label: '约束条件', type: 'textarea', required: false },
          { name: 'timeline', label: '时间计划', type: 'textarea', required: false }
        ],
        template: `# 产品需求文档 (PRD)

## 文档信息
- **产品名称**: {{productName}}
- **版本号**: {{version}}
- **编写者**: {{author}}
- **编写日期**: {{date}}
- **状态**: {{status}}

---

## 1. 项目背景
{{background}}

## 2. 项目目标
{{objectives}}

## 3. 目标用户
{{targetUsers}}

## 4. 功能需求
{{features}}

## 5. 非功能需求
{{nonFunctional}}

## 6. 约束条件
{{constraints}}

## 7. 时间计划
{{timeline}}

## 8. 附录
- 术语表
- 参考文档
- 变更记录

---
*文档版本: {{version}}*
*最后更新: {{generatedAt}}*`
      }
    ];

    // 初始化默认分类
    const defaultCategories = [
      { id: 'report', name: '报告', description: '周报、月报、年报等' },
      { id: 'legal', name: '法务', description: '合同、协议等' },
      { id: 'finance', name: '财务', description: '发票、报销等' },
      { id: 'hr', name: '人事', description: '请假、入职等' },
      { id: 'product', name: '产品', description: '需求、设计等' },
      { id: 'other', name: '其他', description: '其他模板' }
    ];

    for (const category of defaultCategories) {
      this.categories.set(category.id, category);
    }

    for (const template of defaultTemplates) {
      this.templates.set(template.id, template);
    }

    this._saveTemplates();
  }

  /**
   * 获取所有模板
   */
  listTemplates(options = {}) {
    const { category, search, tags, limit = 50, offset = 0 } = options;
    
    let templates = Array.from(this.templates.values());
    
    // 分类过滤
    if (category) {
      templates = templates.filter(t => t.category === category);
    }
    
    // 搜索过滤
    if (search) {
      const searchLower = search.toLowerCase();
      templates = templates.filter(t => 
        t.name.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower) ||
        t.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }
    
    // 标签过滤
    if (tags && tags.length > 0) {
      templates = templates.filter(t => 
        tags.some(tag => t.tags.includes(tag))
      );
    }
    
    // 分页
    const total = templates.length;
    const paginatedTemplates = templates.slice(offset, offset + limit);
    
    return {
      templates: paginatedTemplates,
      total,
      limit,
      offset
    };
  }

  /**
   * 获取单个模板
   */
  getTemplate(templateId) {
    return this.templates.get(templateId) || null;
  }

  /**
   * 创建新模板
   */
  createTemplate(templateData) {
    const { id, name, description, category, type, tags, fields, template } = templateData;
    
    if (!id || !name || !template) {
      throw new Error('id, name, and template are required');
    }
    
    if (this.templates.has(id)) {
      throw new Error(`Template with id ${id} already exists`);
    }
    
    const newTemplate = {
      id,
      name,
      description: description || '',
      category: category || 'other',
      type: type || 'markdown',
      tags: tags || [],
      fields: fields || [],
      template,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.templates.set(id, newTemplate);
    this._saveTemplates();
    
    return newTemplate;
  }

  /**
   * 更新模板 - 安全版本
   */
  updateTemplate(templateId, updates) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    
    // 验证更新数据安全 - 防止原型污染
    if (!isPrototypePollutionSafe(updates)) {
      throw new Error('Invalid updates: potential prototype pollution attempt');
    }
    
    // 只允许更新特定字段
    const allowedFields = ['name', 'description', 'category', 'type', 'tags', 'fields', 'template'];
    const safeUpdates = {};
    
    for (const field of allowedFields) {
      if (updates.hasOwnProperty(field)) {
        safeUpdates[field] = updates[field];
      }
    }
    
    const updatedTemplate = {
      ...template,
      ...safeUpdates,
      id: templateId, // 保持ID不变
      updatedAt: new Date().toISOString()
    };
    
    this.templates.set(templateId, updatedTemplate);
    this._saveTemplates();
    
    return updatedTemplate;
  }

  /**
   * 删除模板
   */
  deleteTemplate(templateId) {
    if (!this.templates.has(templateId)) {
      throw new Error(`Template not found: ${templateId}`);
    }
    
    this.templates.delete(templateId);
    this._saveTemplates();
    
    return { deleted: true };
  }

  /**
   * 获取所有分类
   */
  listCategories() {
    return Array.from(this.categories.values());
  }

  /**
   * 创建分类
   */
  createCategory(categoryData) {
    const { id, name, description } = categoryData;
    
    if (!id || !name) {
      throw new Error('id and name are required');
    }
    
    if (this.categories.has(id)) {
      throw new Error(`Category with id ${id} already exists`);
    }
    
    const newCategory = {
      id,
      name,
      description: description || ''
    };
    
    this.categories.set(id, newCategory);
    this._saveTemplates();
    
    return newCategory;
  }

  /**
   * 使用模板生成内容 - 安全版本
   */
  renderTemplate(templateId, data) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    
    // 验证数据安全 - 防止原型污染
    if (!isPrototypePollutionSafe(data)) {
      throw new Error('Invalid data: potential prototype pollution attempt');
    }
    
    let content = template.template;
    
    // 模板渲染（支持 {{variable}} 语法）- 转义用户输入
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      // 根据模板类型决定是否转义
      if (template.type === 'html') {
        // HTML模板中转义用户输入
        content = content.replace(regex, value !== undefined ? escapeHtml(String(value)) : '');
      } else {
        // Markdown/文本模板中不转义（保持原样）
        content = content.replace(regex, value !== undefined ? String(value) : '');
      }
    }
    
    // 添加默认变量（已知安全的系统值）
    const now = new Date();
    content = content.replace(/{{date}}/g, now.toISOString().split('T')[0]);
    content = content.replace(/{{time}}/g, now.toTimeString().split(' ')[0]);
    content = content.replace(/{{generatedAt}}/g, now.toISOString());
    
    return {
      template: template,
      content: content,
      data: data,
      generatedAt: now.toISOString()
    };
  }

  /**
   * 验证数据是否满足模板要求
   */
  validateTemplateData(templateId, data) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    
    const errors = [];
    const warnings = [];
    
    for (const field of template.fields) {
      const value = data[field.name];
      
      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field: field.name,
          message: `${field.label} 是必填项`
        });
      } else if (!field.required && (value === undefined || value === null || value === '')) {
        warnings.push({
          field: field.name,
          message: `${field.label} 建议填写`
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 获取模板统计信息
   */
  getStats() {
    const templates = Array.from(this.templates.values());
    const categoryCount = {};
    
    for (const template of templates) {
      categoryCount[template.category] = (categoryCount[template.category] || 0) + 1;
    }
    
    return {
      totalTemplates: templates.length,
      totalCategories: this.categories.size,
      templatesByCategory: categoryCount
    };
  }
}

// Singleton instance
let instance = null;

function getSkillTemplates(options) {
  console.warn('[弃用警告] getSkillTemplates() 已弃用，请使用 getSkillRenderer()');
  if (!instance) {
    instance = new SkillTemplates(options);
  }
  return instance;
}

// 标记类为已弃用
const DeprecatedSkillTemplates = class extends SkillTemplates {
  constructor(options = {}) {
    console.warn('[弃用警告] SkillTemplates 类已弃用，请使用 SkillRenderer');
    super(options);
  }
};

module.exports = { 
  SkillTemplates: DeprecatedSkillTemplates, 
  getSkillTemplates,
  DEPRECATED: true,
  REPLACEMENT: 'src/skills/rendering/SkillRenderer'
};
