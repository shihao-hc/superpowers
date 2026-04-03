/**
 * Visual Flow Builder
 * 低代码工作流可视化编辑器
 */

class VisualFlowBuilder {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.templates = new Map();
    this.validations = [];
    
    this._initDefaultNodes();
    this._initTemplates();
  }

  _initDefaultNodes() {
    // 触发器节点
    this.registerNode({
      type: 'trigger',
      category: 'trigger',
      name: '定时触发',
      icon: '⏰',
      description: '按计划时间触发工作流',
      inputs: [],
      outputs: [{ name: 'trigger', type: 'any' }],
      config: [
        { name: 'schedule', type: 'cron', label: 'Cron表达式', required: true },
        { name: 'timezone', type: 'select', label: '时区', options: ['UTC', 'Asia/Shanghai', 'America/New_York'] }
      ],
      color: '#10b981'
    });

    this.registerNode({
      type: 'trigger',
      category: 'trigger',
      name: 'Webhook触发',
      icon: '🪝',
      description: '接收HTTP请求触发',
      inputs: [],
      outputs: [{ name: 'payload', type: 'object' }],
      config: [
        { name: 'method', type: 'select', label: 'HTTP方法', options: ['GET', 'POST', 'PUT'] },
        { name: 'auth', type: 'select', label: '认证', options: ['none', 'bearer', 'basic'] }
      ],
      color: '#10b981'
    });

    this.registerNode({
      type: 'trigger',
      category: 'trigger',
      name: '事件触发',
      icon: '⚡',
      description: '响应系统事件',
      inputs: [],
      outputs: [{ name: 'event', type: 'object' }],
      config: [
        { name: 'eventType', type: 'select', label: '事件类型', options: ['user.created', 'skill.executed', 'alert.triggered'] }
      ],
      color: '#10b981'
    });

    // 技能节点
    this.registerNode({
      type: 'skill',
      category: 'skill',
      name: '执行技能',
      icon: '🛠️',
      description: '调用AI技能',
      inputs: [{ name: 'input', type: 'any' }],
      outputs: [{ name: 'output', type: 'any' }],
      config: [
        { name: 'skillId', type: 'skill-select', label: '选择技能', required: true },
        { name: 'action', type: 'text', label: '动作' },
        { name: 'timeout', type: 'number', label: '超时(ms)', default: 30000 }
      ],
      color: '#3b82f6',
      skillIntegration: true
    });

    this.registerNode({
      type: 'skill',
      category: 'skill',
      name: '批量执行技能',
      icon: '📦',
      description: '对列表中每个元素执行技能',
      inputs: [{ name: 'items', type: 'array' }],
      outputs: [{ name: 'results', type: 'array' }],
      config: [
        { name: 'skillId', type: 'skill-select', label: '选择技能', required: true },
        { name: 'concurrency', type: 'number', label: '并发数', default: 5 }
      ],
      color: '#3b82f6'
    });

    // LLM节点
    this.registerNode({
      type: 'llm',
      category: 'llm',
      name: 'AI对话',
      icon: '🤖',
      description: '调用AI模型',
      inputs: [{ name: 'messages', type: 'array' }],
      outputs: [{ name: 'response', type: 'string' }],
      config: [
        { name: 'model', type: 'model-select', label: '选择模型', default: 'auto' },
        { name: 'temperature', type: 'slider', label: '温度', min: 0, max: 2, step: 0.1, default: 0.7 },
        { name: 'maxTokens', type: 'number', label: '最大Token' },
        { name: 'systemPrompt', type: 'textarea', label: '系统提示词' }
      ],
      color: '#8b5cf6',
      modelIntegration: true
    });

    this.registerNode({
      type: 'llm',
      category: 'llm',
      name: 'AI生成JSON',
      icon: '📝',
      description: '生成结构化JSON',
      inputs: [{ name: 'prompt', type: 'string' }],
      outputs: [{ name: 'json', type: 'object' }],
      config: [
        { name: 'model', type: 'model-select', label: '选择模型', default: 'auto' },
        { name: 'schema', type: 'json-schema', label: 'JSON Schema' },
        { name: 'temperature', type: 'slider', label: '温度', min: 0, max: 1, default: 0.3 }
      ],
      color: '#8b5cf6'
    });

    // 逻辑节点
    this.registerNode({
      type: 'logic',
      category: 'logic',
      name: '条件分支',
      icon: '🔀',
      description: '基于条件分流',
      inputs: [{ name: 'input', type: 'any' }],
      outputs: [
        { name: 'true', type: 'any', label: '条件成立' },
        { name: 'false', type: 'any', label: '条件不成立' }
      ],
      config: [
        { name: 'condition', type: 'expression', label: '条件表达式', required: true },
        { name: 'description', type: 'text', label: '说明' }
      ],
      color: '#f59e0b'
    });

    this.registerNode({
      type: 'logic',
      category: 'logic',
      name: 'Switch分支',
      icon: '🔃',
      description: '多值匹配分支',
      inputs: [{ name: 'input', type: 'any' }],
      outputs: [],
      config: [
        { name: 'expression', type: 'expression', label: '表达式' },
        { name: 'cases', type: 'key-value-list', label: '分支映射' }
      ],
      color: '#f59e0b'
    });

    this.registerNode({
      type: 'logic',
      category: 'logic',
      name: '并行执行',
      icon: '⚡',
      description: '并行执行多个分支',
      inputs: [{ name: 'trigger', type: 'any' }],
      outputs: [{ name: 'complete', type: 'any', label: '全部完成' }],
      config: [
        { name: 'branches', type: 'branch-list', label: '分支' },
        { name: 'waitAll', type: 'boolean', label: '等待全部完成', default: true }
      ],
      color: '#f59e0b'
    });

    this.registerNode({
      type: 'logic',
      category: 'logic',
      name: '循环',
      icon: '🔁',
      description: '遍历列表执行',
      inputs: [{ name: 'items', type: 'array' }],
      outputs: [
        { name: 'item', type: 'any', label: '单项结果' },
        { name: 'complete', type: 'array', label: '全部结果' }
      ],
      config: [
        { name: 'maxIterations', type: 'number', label: '最大迭代次数' },
        { name: 'continueOnError', type: 'boolean', label: '出错继续' }
      ],
      color: '#f59e0b'
    });

    // 数据节点
    this.registerNode({
      type: 'data',
      category: 'data',
      name: '数据转换',
      icon: '🔄',
      description: '转换数据格式',
      inputs: [{ name: 'input', type: 'any' }],
      outputs: [{ name: 'output', type: 'any' }],
      config: [
        { name: 'transform', type: 'transform-script', label: '转换规则' },
        { name: 'template', type: 'template', label: '模板' }
      ],
      color: '#06b6d4'
    });

    this.registerNode({
      type: 'data',
      category: 'data',
      name: '数据筛选',
      icon: '🔍',
      description: '筛选数据',
      inputs: [{ name: 'input', type: 'array' }],
      outputs: [{ name: 'filtered', type: 'array' }],
      config: [
        { name: 'filter', type: 'expression', label: '过滤条件', required: true }
      ],
      color: '#06b6d4'
    });

    this.registerNode({
      type: 'data',
      category: 'data',
      name: '数据聚合',
      icon: '📊',
      description: '汇总数据',
      inputs: [{ name: 'input', type: 'array' }],
      outputs: [{ name: 'result', type: 'object' }],
      config: [
        { name: 'operations', type: 'agg-list', label: '聚合操作', required: true }
      ],
      color: '#06b6d4'
    });

    this.registerNode({
      type: 'data',
      category: 'data',
      name: 'HTTP请求',
      icon: '🌐',
      description: '发送HTTP请求',
      inputs: [{ name: 'params', type: 'object' }],
      outputs: [
        { name: 'response', type: 'object' },
        { name: 'error', type: 'object', label: '错误' }
      ],
      config: [
        { name: 'method', type: 'select', label: '方法', options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
        { name: 'url', type: 'url', label: 'URL', required: true },
        { name: 'headers', type: 'key-value', label: '请求头' },
        { name: 'timeout', type: 'number', label: '超时(ms)' }
      ],
      color: '#06b6d4'
    });

    // 存储节点
    this.registerNode({
      type: 'storage',
      category: 'storage',
      name: '读取缓存',
      icon: '📖',
      description: '读取缓存数据',
      inputs: [{ name: 'key', type: 'string' }],
      outputs: [{ name: 'value', type: 'any' }],
      config: [
        { name: 'ttl', type: 'number', label: 'TTL(秒)' },
        { name: 'default', type: 'text', label: '默认值' }
      ],
      color: '#84cc16'
    });

    this.registerNode({
      type: 'storage',
      category: 'storage',
      name: '写入缓存',
      icon: '💾',
      description: '写入缓存数据',
      inputs: [{ name: 'key', type: 'string' }, { name: 'value', type: 'any' }],
      outputs: [{ name: 'success', type: 'boolean' }],
      config: [
        { name: 'ttl', type: 'number', label: 'TTL(秒)' }
      ],
      color: '#84cc16'
    });

    // 通知节点
    this.registerNode({
      type: 'notification',
      category: 'notification',
      name: '发送邮件',
      icon: '📧',
      description: '发送邮件通知',
      inputs: [{ name: 'data', type: 'object' }],
      outputs: [{ name: 'sent', type: 'boolean' }],
      config: [
        { name: 'to', type: 'email', label: '收件人', required: true },
        { name: 'subject', type: 'text', label: '主题' },
        { name: 'template', type: 'template-select', label: '模板' }
      ],
      color: '#ef4444'
    });

    this.registerNode({
      type: 'notification',
      category: 'notification',
      name: '发送消息',
      icon: '💬',
      description: '发送即时消息',
      inputs: [{ name: 'message', type: 'string' }],
      outputs: [{ name: 'sent', type: 'boolean' }],
      config: [
        { name: 'channel', type: 'select', label: '渠道', options: ['slack', 'discord', 'wechat', 'dingtalk'] },
        { name: 'webhook', type: 'text', label: 'Webhook URL' }
      ],
      color: '#ef4444'
    });

    // 输入输出节点
    this.registerNode({
      type: 'io',
      category: 'io',
      name: '用户输入',
      icon: '⌨️',
      description: '请求用户输入',
      inputs: [],
      outputs: [{ name: 'value', type: 'any' }],
      config: [
        { name: 'prompt', type: 'text', label: '提示文本', required: true },
        { name: 'type', type: 'select', label: '输入类型', options: ['text', 'number', 'select', 'file'] },
        { name: 'options', type: 'array', label: '选项' }
      ],
      color: '#ec4899'
    });

    this.registerNode({
      type: 'io',
      category: 'io',
      name: '输出结果',
      icon: '📤',
      description: '输出工作流结果',
      inputs: [{ name: 'data', type: 'any' }],
      outputs: [],
      config: [
        { name: 'format', type: 'select', label: '格式', options: ['json', 'text', 'html', 'file'] }
      ],
      color: '#ec4899'
    });
  }

  _initTemplates() {
    // 数据处理管道
    this.registerTemplate({
      id: 'data-pipeline',
      name: '数据处理管道',
      description: '从数据源到分析结果',
      icon: '🔄',
      category: 'data',
      difficulty: 'intermediate',
      nodes: [
        { type: 'trigger.webhook', x: 100, y: 200, config: { method: 'POST' } },
        { type: 'data.transform', x: 300, y: 200, config: { transform: 'parse' } },
        { type: 'data.filter', x: 500, y: 200, config: { filter: 'valid == true' } },
        { type: 'llm.analyze', x: 700, y: 200, config: { model: 'auto' } },
        { type: 'storage.write', x: 900, y: 200, config: { ttl: 3600 } },
        { type: 'io.output', x: 1100, y: 200, config: { format: 'json' } }
      ],
      edges: [
        { from: 'trigger.webhook', to: 'data.transform', fromPort: 'payload', toPort: 'input' },
        { from: 'data.transform', to: 'data.filter', fromPort: 'output', toPort: 'input' },
        { from: 'data.filter', to: 'llm.analyze', fromPort: 'filtered', toPort: 'messages' },
        { from: 'llm.analyze', to: 'storage.write', fromPort: 'response', toPort: 'value' },
        { from: 'storage.write', to: 'io.output', fromPort: 'success', toPort: 'data' }
      ]
    });

    // 内容审核工作流
    this.registerTemplate({
      id: 'content-moderation',
      name: '内容审核',
      description: 'AI驱动的内容审核',
      icon: '🛡️',
      category: 'ai',
      difficulty: 'beginner',
      nodes: [
        { type: 'trigger.webhook', x: 100, y: 200, config: { method: 'POST' } },
        { type: 'llm.moderate', x: 300, y: 200, config: { model: 'auto' } },
        { type: 'logic.condition', x: 500, y: 200, config: { condition: 'result.safe == true' } },
        { type: 'io.output', x: 700, y: 100, config: { format: 'json' }, label: '通过' },
        { type: 'notification.alert', x: 700, y: 300, config: { channel: 'slack' }, label: '预警' }
      ],
      edges: [
        { from: 'trigger.webhook', to: 'llm.moderate' },
        { from: 'llm.moderate', to: 'logic.condition' },
        { from: 'logic.condition', to: 'io.output', fromPort: 'true', toPort: 'data' },
        { from: 'logic.condition', to: 'notification.alert', fromPort: 'false', toPort: 'message' }
      ]
    });

    // 定时报告生成
    this.registerTemplate({
      id: 'scheduled-report',
      name: '定时报告',
      description: '自动生成周期性报告',
      icon: '📊',
      category: 'automation',
      difficulty: 'beginner',
      nodes: [
        { type: 'trigger.schedule', x: 100, y: 200, config: { schedule: '0 8 * * 1' } },
        { type: 'data.http', x: 300, y: 200, config: { method: 'GET', url: '/api/metrics' } },
        { type: 'data.transform', x: 500, y: 200, config: { template: 'summary' } },
        { type: 'llm.generate-report', x: 700, y: 200, config: { model: 'auto' } },
        { type: 'notification.email', x: 900, y: 200, config: { to: 'team@company.com' } }
      ]
    });

    // 客服工单处理
    this.registerTemplate({
      id: 'ticket-handler',
      name: '客服工单',
      description: '智能客服工单处理',
      icon: '🎫',
      category: 'customer-service',
      difficulty: 'intermediate',
      nodes: [
        { type: 'trigger.webhook', x: 100, y: 200, config: { event: 'ticket.created' } },
        { type: 'llm.classify', x: 300, y: 200, config: { model: 'auto' } },
        { type: 'logic.switch', x: 500, y: 200, config: { cases: { 'refund': 1, 'complaint': 2, 'inquiry': 3 } } },
        { type: 'skill.refund', x: 700, y: 50, config: {} },
        { type: 'skill.escalate', x: 700, y: 200, config: {} },
        { type: 'llm.auto-reply', x: 700, y: 350, config: {} },
        { type: 'notification.email', x: 900, y: 200, config: {} }
      ]
    });
  }

  registerNode(node) {
    this.nodes.set(node.type, {
      ...node,
      id: node.type,
      registeredAt: Date.now()
    });
  }

  registerTemplate(template) {
    this.templates.set(template.id, {
      ...template,
      id: template.id,
      registeredAt: Date.now()
    });
  }

  getNode(type) {
    return this.nodes.get(type);
  }

  getAllNodes(category = null) {
    const all = Array.from(this.nodes.values());
    if (category) {
      return all.filter(n => n.category === category);
    }
    return all;
  }

  getCategories() {
    const categories = {};
    for (const node of this.nodes.values()) {
      if (!categories[node.category]) {
        categories[node.category] = {
          id: node.category,
          name: this._getCategoryName(node.category),
          icon: this._getCategoryIcon(node.category),
          count: 0
        };
      }
      categories[node.category].count++;
    }
    return Object.values(categories);
  }

  _getCategoryName(category) {
    const names = {
      'trigger': '触发器',
      'skill': '技能',
      'llm': 'AI模型',
      'logic': '逻辑',
      'data': '数据',
      'storage': '存储',
      'notification': '通知',
      'io': '输入/输出'
    };
    return names[category] || category;
  }

  _getCategoryIcon(category) {
    const icons = {
      'trigger': '⚡',
      'skill': '🛠️',
      'llm': '🤖',
      'logic': '🔀',
      'data': '📊',
      'storage': '💾',
      'notification': '📬',
      'io': '⌨️'
    };
    return icons[category] || '📦';
  }

  // 验证工作流
  validateFlow(flow) {
    const errors = [];
    const warnings = [];

    // 检查起点
    const triggers = flow.nodes.filter(n => n.type.startsWith('trigger.'));
    if (triggers.length === 0) {
      errors.push({ code: 'NO_TRIGGER', message: '工作流必须包含触发器节点' });
    }

    // 检查终点
    const outputs = flow.nodes.filter(n => n.type === 'io.output' || n.outputs.length === 0);
    if (outputs.length === 0) {
      warnings.push({ code: 'NO_OUTPUT', message: '工作流没有输出节点' });
    }

    // 检查断开的连接
    for (const edge of flow.edges) {
      const sourceNode = flow.nodes.find(n => n.id === edge.from);
      const targetNode = flow.nodes.find(n => n.id === edge.to);
      
      if (!sourceNode) {
        errors.push({ code: 'INVALID_SOURCE', message: `边 ${edge.from} -> ${edge.to} 源节点不存在` });
      }
      if (!targetNode) {
        errors.push({ code: 'INVALID_TARGET', message: `边 ${edge.from} -> ${edge.to} 目标节点不存在` });
      }
    }

    // 检查循环引用
    const cycles = this._detectCycles(flow);
    if (cycles.length > 0) {
      warnings.push({ code: 'CYCLE_DETECTED', message: `检测到循环: ${cycles.join(' -> ')}` });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  _detectCycles(flow) {
    const adj = new Map();
    for (const node of flow.nodes) {
      adj.set(node.id, []);
    }
    for (const edge of flow.edges) {
      adj.get(edge.from)?.push(edge.to);
    }

    const visited = new Set();
    const recStack = new Set();
    const cycles = [];

    const dfs = (nodeId, path) => {
      visited.add(nodeId);
      recStack.add(nodeId);
      path.push(nodeId);

      for (const neighbor of adj.get(nodeId) || []) {
        if (!visited.has(neighbor)) {
          const cycle = dfs(neighbor, [...path]);
          if (cycle.length > 0) return cycle;
        } else if (recStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          return [...path.slice(cycleStart), neighbor];
        }
      }

      recStack.delete(nodeId);
      return [];
    };

    for (const node of flow.nodes) {
      if (!visited.has(node.id)) {
        const cycle = dfs(node.id, []);
        if (cycle.length > 0) cycles.push(cycle.join(' -> '));
      }
    }

    return cycles;
  }

  // 生成代码
  generateCode(flow) {
    const validation = this.validateFlow(flow);
    if (!validation.valid) {
      throw new Error(`Flow validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    const code = {
      javascript: this._generateJS(flow),
      python: this._generatePython(flow),
      json: this._generateJSON(flow)
    };

    return code;
  }

  _generateJS(flow) {
    let code = `// UltraWork Flow: ${flow.name || 'Untitled'}\n`;
    code += `// Generated: ${new Date().toISOString()}\n\n`;
    code += `const { WorkflowEngine } = require('./workflow/WorkflowEngine');\n\n`;
    code += `async function executeFlow(input) {\n`;
    code += `  const engine = new WorkflowEngine();\n\n`;
    code += `  // Node definitions\n`;
    
    for (const node of flow.nodes) {
      code += `  engine.registerNode('${node.id}', {\n`;
      code += `    type: '${node.type}',\n`;
      code += `    config: ${JSON.stringify(node.config || {})},\n`;
      code += `    handler: async (inputs, context) => {\n`;
      code += `      // ${node.name || node.type}\n`;
      code += `      // TODO: Implement node logic\n`;
      code += `      return { output: inputs };\n`;
      code += `    }\n`;
      code += `  });\n\n`;
    }

    code += `  // Edge connections\n`;
    for (const edge of flow.edges) {
      code += `  engine.connect('${edge.from}', '${edge.to}');\n`;
    }

    code += `\n  // Execute\n`;
    code += `  return await engine.execute(input);\n`;
    code += `}\n\n`;
    code += `module.exports = { executeFlow };\n`;

    return code;
  }

  _generatePython(flow) {
    let code = `# UltraWork Flow: ${flow.name || 'Untitled'}\n`;
    code += `# Generated: ${new Date().toISOString()}\n\n`;
    code += `from typing import Any, Dict, List\n`;
    code += `from workflow_engine import WorkflowEngine\n\n\n`;
    code += `async def execute_flow(input_data: Any) -> Any:\n`;
    code += `    engine = WorkflowEngine()\n\n`;
    code += `    # Node definitions\n`;
    
    for (const node of flow.nodes) {
      code += `    engine.register_node(\n`;
      code += `        node_id="${node.id}",\n`;
      code += `        node_type="${node.type}",\n`;
      code += `        config=${JSON.stringify(node.config || {})},\n`;
      code += `        handler=async def handler(inputs, context):\n`;
      code += `            # ${node.name || node.type}\n`;
      code += `            return {"output": inputs}\n`;
      code += `    )\n\n`;
    }

    code += `    # Edge connections\n`;
    for (const edge of flow.edges) {
      code += `    engine.connect("${edge.from}", "${edge.to}")\n`;
    }

    code += `\n    # Execute\n`;
    code += `    return await engine.execute(input_data)\n\n`;
    code += `if __name__ == "__main__":\n`;
    code += `    import asyncio\n`;
    code += `    result = asyncio.run(execute_flow({}))\n`;
    code += `    print(result)\n`;

    return code;
  }

  _generateJSON(flow) {
    return {
      version: '1.0',
      name: flow.name,
      description: flow.description,
      nodes: flow.nodes.map(n => ({
        id: n.id,
        type: n.type,
        position: { x: n.x, y: n.y },
        config: n.config || {}
      })),
      edges: flow.edges.map(e => ({
        source: e.from,
        target: e.to,
        sourcePort: e.fromPort,
        targetPort: e.toPort
      })),
      metadata: {
        generated: new Date().toISOString(),
        generator: 'VisualFlowBuilder'
      }
    };
  }

  // 获取模板
  getTemplate(templateId) {
    return this.templates.get(templateId);
  }

  getTemplates(filters = {}) {
    let templates = Array.from(this.templates.values());
    
    if (filters.category) {
      templates = templates.filter(t => t.category === filters.category);
    }
    if (filters.difficulty) {
      templates = templates.filter(t => t.difficulty === filters.difficulty);
    }
    
    return templates;
  }

  // 从模板创建
  createFromTemplate(templateId, customConfig = {}) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const flow = {
      id: `flow_${Date.now()}`,
      name: customConfig.name || template.name,
      description: customConfig.description || template.description,
      nodes: template.nodes.map(n => ({ ...n, id: `${n.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` })),
      edges: template.edges.map(e => ({ ...e })),
      createdAt: Date.now()
    };

    return flow;
  }
}

module.exports = { VisualFlowBuilder };
