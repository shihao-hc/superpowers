const { VisualFlowBuilder } = require('../../src/lowcode/VisualFlowBuilder');

describe('VisualFlowBuilder', () => {
  let builder;

  beforeEach(() => {
    builder = new VisualFlowBuilder();
  });

  describe('constructor', () => {
    it('initializes maps and arrays', () => {
      expect(builder.nodes).toBeInstanceOf(Map);
      expect(builder.edges).toBeInstanceOf(Map);
      expect(builder.templates).toBeInstanceOf(Map);
      expect(builder.validations).toEqual([]);
    });

    it('registers one node per type (last registered overwrites)', () => {
      expect(builder.nodes.size).toBe(8);
    });

    it('registers 4 default templates', () => {
      expect(builder.templates.size).toBe(4);
      expect(builder.getTemplate('data-pipeline')).toBeTruthy();
      expect(builder.getTemplate('content-moderation')).toBeTruthy();
      expect(builder.getTemplate('scheduled-report')).toBeTruthy();
      expect(builder.getTemplate('ticket-handler')).toBeTruthy();
    });

    it('each node type has id set to its type', () => {
      for (const [key, node] of builder.nodes) {
        expect(node.id).toBe(key);
      }
    });
  });

  describe('registerNode', () => {
    it('registers and overwrites node by type key', () => {
      builder.registerNode({
        type: 'my-node',
        category: 'custom',
        name: 'First',
        inputs: [{ name: 'in', type: 'string' }],
        outputs: [],
        config: [],
        color: '#000'
      });
      expect(builder.getNode('my-node').name).toBe('First');

      builder.registerNode({
        type: 'my-node',
        category: 'custom',
        name: 'Second',
        inputs: [],
        outputs: [],
        config: [],
        color: '#fff'
      });
      expect(builder.getNode('my-node').name).toBe('Second');
    });

    it('sets registeredAt and id', () => {
      const before = Date.now();
      builder.registerNode({ type: 't', category: 'c', name: 'N', inputs: [], outputs: [], config: [], color: '#fff' });
      const node = builder.getNode('t');
      expect(node.registeredAt).toBeGreaterThanOrEqual(before - 1);
      expect(node.id).toBe('t');
    });

    it('last registered node has correct default properties', () => {
      const skillNode = builder.getNode('skill');
      expect(skillNode.type).toBe('skill');
      expect(skillNode.name).toBe('批量执行技能');
      const llmNode = builder.getNode('llm');
      expect(llmNode.type).toBe('llm');
      expect(llmNode.name).toBe('AI生成JSON');
    });
  });

  describe('getNode', () => {
    it('returns node by type key', () => {
      expect(builder.getNode('trigger')).toBeTruthy();
      expect(builder.getNode('trigger').name).toBe('事件触发');
    });

    it('returns undefined for unknown type', () => {
      expect(builder.getNode('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllNodes', () => {
    it('returns all registered nodes when no category filter', () => {
      expect(builder.getAllNodes()).toHaveLength(builder.nodes.size);
    });

    it('filters by category', () => {
      const nodes = builder.getAllNodes('trigger');
      expect(nodes).toHaveLength(1);
      expect(nodes[0].category).toBe('trigger');
    });

    it('returns empty array for unknown category', () => {
      expect(builder.getAllNodes('unknown')).toEqual([]);
    });
  });

  describe('getCategories with duplicate category', () => {
    it('counts nodes sharing the same category', () => {
      builder.registerNode({ type: 'trigger-extra', category: 'trigger', name: 'Extra', inputs: [], outputs: [], config: [], color: '#000' });
      const cats = builder.getCategories();
      const triggerCat = cats.find(c => c.id === 'trigger');
      expect(triggerCat).toBeTruthy();
      expect(triggerCat.count).toBe(2);
    });
  });

  describe('getCategories', () => {
    it('returns all categories with metadata', () => {
      const cats = builder.getCategories();
      expect(cats.length).toBeGreaterThanOrEqual(8);
    });

    it('each category has id, name, icon, and count', () => {
      for (const cat of builder.getCategories()) {
        expect(cat.id).toBeTruthy();
        expect(cat.name).toBeTruthy();
        expect(cat.icon).toBeTruthy();
        expect(typeof cat.count).toBe('number');
      }
    });

    it('each category has count of 1 (one node per type)', () => {
      for (const cat of builder.getCategories()) {
        expect(cat.count).toBe(1);
      }
    });
  });

  describe('registerTemplate', () => {
    it('registers and overwrites template by id', () => {
      builder.registerTemplate({ id: 't1', name: 'First', description: '', icon: '', category: '', difficulty: '', nodes: [], edges: [] });
      expect(builder.getTemplate('t1').name).toBe('First');
      builder.registerTemplate({ id: 't1', name: 'Second', description: '', icon: '', category: '', difficulty: '', nodes: [], edges: [] });
      expect(builder.getTemplate('t1').name).toBe('Second');
    });

    it('sets registeredAt', () => {
      const before = Date.now();
      builder.registerTemplate({ id: 'tt', name: 'TT', description: '', icon: '', category: '', difficulty: '', nodes: [], edges: [] });
      expect(builder.getTemplate('tt').registeredAt).toBeGreaterThanOrEqual(before - 1);
    });
  });

  describe('getTemplate', () => {
    it('returns registered template by id', () => {
      const tpl = builder.getTemplate('data-pipeline');
      expect(tpl.name).toBe('数据处理管道');
    });

    it('returns undefined for non-existent', () => {
      expect(builder.getTemplate('no-such')).toBeUndefined();
    });
  });

  describe('getTemplates', () => {
    it('returns all templates when no filters', () => {
      expect(builder.getTemplates()).toHaveLength(4);
    });

    it('filters by category', () => {
      const results = builder.getTemplates({ category: 'data' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('data-pipeline');
    });

    it('filters by difficulty', () => {
      const results = builder.getTemplates({ difficulty: 'beginner' });
      expect(results.every(t => t.difficulty === 'beginner')).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by category and difficulty', () => {
      const results = builder.getTemplates({ category: 'automation', difficulty: 'beginner' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('scheduled-report');
    });

    it('returns empty array when no match', () => {
      expect(builder.getTemplates({ category: 'nonexistent' })).toEqual([]);
    });
  });

  describe('createFromTemplate', () => {
    it('creates flow with id, name, nodes, edges, and createdAt', () => {
      const flow = builder.createFromTemplate('data-pipeline');
      expect(flow.id).toMatch(/^flow_/);
      expect(flow.name).toBe('数据处理管道');
      expect(flow.nodes).toBeInstanceOf(Array);
      expect(flow.edges).toBeInstanceOf(Array);
      expect(flow.createdAt).toBeDefined();
    });

    it('generates unique node ids each call', () => {
      const a = builder.createFromTemplate('data-pipeline');
      const b = builder.createFromTemplate('data-pipeline');
      expect(a.nodes[0].id).not.toBe(b.nodes[0].id);
    });

    it('overrides name and description via customConfig', () => {
      const flow = builder.createFromTemplate('data-pipeline', { name: 'Custom', description: 'Desc' });
      expect(flow.name).toBe('Custom');
      expect(flow.description).toBe('Desc');
    });

    it('throws for non-existent template', () => {
      expect(() => builder.createFromTemplate('void')).toThrow('Template not found: void');
    });

    it('copies edges by value not reference', () => {
      const a = builder.createFromTemplate('data-pipeline');
      const b = builder.createFromTemplate('data-pipeline');
      if (a.edges.length > 0) {
        a.edges[0].from = 'mutated';
        expect(b.edges[0].from).not.toBe('mutated');
      }
    });

    it('each created node has id, type, x, y, and config', () => {
      const flow = builder.createFromTemplate('data-pipeline');
      for (const node of flow.nodes) {
        expect(node.id).toBeTruthy();
        expect(node.type).toBeTruthy();
        expect(typeof node.x).toBe('number');
        expect(typeof node.y).toBe('number');
        expect(node.config).toBeDefined();
      }
    });
  });

  describe('validateFlow', () => {
    it('reports NO_TRIGGER error when no trigger node present', () => {
      const flow = {
        nodes: [{ id: 'n1', type: 'io.output', outputs: [] }],
        edges: []
      };
      const result = builder.validateFlow(flow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'NO_TRIGGER')).toBe(true);
    });

    it('reports NO_OUTPUT warning when no output and all nodes have outputs', () => {
      const flow = {
        nodes: [{ id: 'n1', type: 'trigger.webhook', outputs: [{ name: 'o', type: 'any' }] }],
        edges: []
      };
      const result = builder.validateFlow(flow);
      expect(result.warnings.some(w => w.code === 'NO_OUTPUT')).toBe(true);
    });

    it('handles node without outputs property in NO_OUTPUT check', () => {
      const flow = {
        nodes: [
          { id: 'n1', type: 'trigger.webhook' },
          { id: 'n2', type: 'io.output' }
        ],
        edges: []
      };
      const result = builder.validateFlow(flow);
      expect(result.valid).toBe(true);
    });

    it('reports INVALID_SOURCE for edge with nonexistent source', () => {
      const flow = {
        nodes: [{ id: 'n2', type: 'io.output', outputs: [] }],
        edges: [{ from: 'n1', to: 'n2' }]
      };
      const result = builder.validateFlow(flow);
      expect(result.errors.some(e => e.code === 'INVALID_SOURCE')).toBe(true);
    });

    it('reports INVALID_TARGET for edge with nonexistent target', () => {
      const flow = {
        nodes: [{ id: 'n1', type: 'trigger.webhook', outputs: [{ name: 'o', type: 'any' }] }],
        edges: [{ from: 'n1', to: 'n2' }]
      };
      const result = builder.validateFlow(flow);
      expect(result.errors.some(e => e.code === 'INVALID_TARGET')).toBe(true);
    });

    it('passes for a valid flow with trigger and output', () => {
      const flow = {
        nodes: [
          { id: 'n1', type: 'trigger.webhook', outputs: [{ name: 'o', type: 'any' }] },
          { id: 'n2', type: 'io.output', outputs: [] }
        ],
        edges: [{ from: 'n1', to: 'n2' }]
      };
      const result = builder.validateFlow(flow);
      expect(result.valid).toBe(true);
    });

    it('handles empty flow gracefully (no trigger error)', () => {
      const result = builder.validateFlow({ nodes: [], edges: [] });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'NO_TRIGGER')).toBe(true);
    });
  });

  describe('_detectCycles', () => {
    it('returns no cycles for linear flow', () => {
      const flow = {
        nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]
      };
      expect(builder._detectCycles(flow)).toHaveLength(0);
    });

    it('detects a simple cycle', () => {
      const flow = {
        nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }]
      };
      const cycles = builder._detectCycles(flow);
      expect(cycles.length).toBeGreaterThanOrEqual(1);
    });

    it('detects a self-loop', () => {
      const flow = {
        nodes: [{ id: 'a' }],
        edges: [{ from: 'a', to: 'a' }]
      };
      const cycles = builder._detectCycles(flow);
      expect(cycles.length).toBeGreaterThanOrEqual(1);
    });

    it('handles disconnected nodes', () => {
      const flow = {
        nodes: [{ id: 'a' }, { id: 'b' }],
        edges: []
      };
      expect(builder._detectCycles(flow)).toHaveLength(0);
    });

    it('cycle detection integrates with validateFlow as warning', () => {
      const flow = {
        nodes: [
          { id: 'a', type: 'trigger.webhook', outputs: [{ name: 'o', type: 'any' }] },
          { id: 'b', type: 'data.transform', outputs: [{ name: 'o', type: 'any' }] }
        ],
        edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }]
      };
      const result = builder.validateFlow(flow);
      expect(result.warnings.some(w => w.code === 'CYCLE_DETECTED')).toBe(true);
    });

    it('handles diamond pattern without false cycle detection', () => {
      const flow = {
        nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
        edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' }, { from: 'c', to: 'd' }]
      };
      expect(builder._detectCycles(flow)).toHaveLength(0);
    });
  });

  describe('generateCode', () => {
    const validFlow = {
      name: 'test-flow',
      description: 'Test',
      nodes: [
        { id: 'n1', type: 'trigger.webhook', name: 'Webhook', config: { method: 'POST' }, outputs: [{ name: 'o', type: 'any' }] },
        { id: 'n2', type: 'io.output', name: 'Output', config: { format: 'json' }, outputs: [] }
      ],
      edges: [{ from: 'n1', to: 'n2' }]
    };

    it('returns javascript, python, and json keys', () => {
      const code = builder.generateCode(validFlow);
      expect(code).toHaveProperty('javascript');
      expect(code).toHaveProperty('python');
      expect(code).toHaveProperty('json');
    });

    it('generates JavaScript code', () => {
      const code = builder.generateCode(validFlow);
      expect(code.javascript).toContain('// UltraWork Flow: test-flow');
      expect(code.javascript).toContain('async function executeFlow');
      expect(code.javascript).toMatch(/engine\.registerNode\('n1'/);
      expect(code.javascript).toMatch(/engine\.connect\('n1', 'n2'\)/);
      expect(code.javascript).toContain('module.exports = { executeFlow }');
    });

    it('generates JS/Python/JSON with fallback for missing name and config', () => {
      const flow = {
        nodes: [
          { id: 'n1', type: 'trigger.webhook', outputs: [{ name: 'o', type: 'any' }] },
          { id: 'n2', type: 'io.output', outputs: [] }
        ],
        edges: [{ from: 'n1', to: 'n2' }]
      };
      const code = builder.generateCode(flow);
      expect(code.javascript).toContain('// UltraWork Flow: Untitled');
      expect(code.javascript).toContain('config: {}');
      expect(code.python).toContain('# UltraWork Flow: Untitled');
      expect(code.python).toContain('config={}');
      expect(code.json.name).toBeUndefined();
      expect(code.json.nodes[0].config).toEqual({});
    });

    it('generates Python code', () => {
      const code = builder.generateCode(validFlow);
      expect(code.python).toContain('# UltraWork Flow: test-flow');
      expect(code.python).toContain('async def execute_flow');
      expect(code.python).toContain('engine.connect("n1", "n2")');
      expect(code.python).toContain('if __name__ == "__main__":');
    });

    it('generates JSON representation', () => {
      const code = builder.generateCode(validFlow);
      expect(code.json.version).toBe('1.0');
      expect(code.json.name).toBe('test-flow');
      expect(code.json.nodes).toHaveLength(2);
      expect(code.json.edges).toHaveLength(1);
      expect(code.json.metadata.generator).toBe('VisualFlowBuilder');
    });

    it('JSON includes position, config, and port info', () => {
      const flow = {
        name: 'F', description: 'D',
        nodes: [
          { id: 't1', type: 'trigger.webhook', x: 100, y: 200, config: { method: 'POST' }, outputs: [{ name: 'payload', type: 'any' }] },
          { id: 'o1', type: 'io.output', x: 300, y: 200, config: { format: 'json' }, outputs: [] }
        ],
        edges: [{ from: 't1', to: 'o1', fromPort: 'payload', toPort: 'data' }]
      };
      const json = builder.generateCode(flow).json;
      expect(json.nodes[0].position).toEqual({ x: 100, y: 200 });
      expect(json.nodes[0].config.method).toBe('POST');
      expect(json.edges[0].sourcePort).toBe('payload');
      expect(json.edges[0].targetPort).toBe('data');
      expect(json.metadata.generator).toBe('VisualFlowBuilder');
      expect(json.metadata.generated).toBeTruthy();
    });
  });

  describe('generateCode validation failure', () => {
    it('throws when flow has no trigger', () => {
      expect(() => builder.generateCode({
        name: 'bad', nodes: [{ id: 'n1', type: 'io.output', outputs: [] }], edges: []
      })).toThrow('Flow validation failed');
    });

    it('throws with descriptive messages', () => {
      expect(() => builder.generateCode({
        nodes: [{ id: 'n1', type: 'unknown', outputs: [] }], edges: [{ from: 'n1', to: 'n2' }]
      })).toThrow(/Flow validation failed/);
    });
  });

  describe('default node types (last registered per type)', () => {
    it('registered one node per category', () => {
      expect(builder.getNode('trigger')).toBeTruthy();
      expect(builder.getNode('skill')).toBeTruthy();
      expect(builder.getNode('llm')).toBeTruthy();
      expect(builder.getNode('logic')).toBeTruthy();
      expect(builder.getNode('data')).toBeTruthy();
      expect(builder.getNode('storage')).toBeTruthy();
      expect(builder.getNode('notification')).toBeTruthy();
      expect(builder.getNode('io')).toBeTruthy();
    });

    it('last registered node for each type has expected name', () => {
      expect(builder.getNode('trigger').name).toBe('事件触发');
      expect(builder.getNode('skill').name).toBe('批量执行技能');
      expect(builder.getNode('llm').name).toBe('AI生成JSON');
      expect(builder.getNode('logic').name).toBe('循环');
      expect(builder.getNode('data').name).toBe('HTTP请求');
      expect(builder.getNode('storage').name).toBe('写入缓存');
      expect(builder.getNode('notification').name).toBe('发送消息');
      expect(builder.getNode('io').name).toBe('输出结果');
    });

    it('each node has expected category, inputs, outputs, config, color', () => {
      const trigger = builder.getNode('trigger');
      expect(trigger.category).toBe('trigger');
      expect(trigger.inputs).toEqual([]);
      expect(Array.isArray(trigger.outputs)).toBe(true);
      expect(Array.isArray(trigger.config)).toBe(true);
      expect(trigger.color).toBe('#10b981');

      const data = builder.getNode('data');
      expect(data.category).toBe('data');
      expect(data.inputs).toHaveLength(1);
    });

    it('skill node retains inputs/outputs from last registration', () => {
      const skill = builder.getNode('skill');
      expect(skill.inputs).toHaveLength(1);
      expect(skill.outputs).toHaveLength(1);
    });

    it('llm node retains config from last registration', () => {
      const llm = builder.getNode('llm');
      expect(llm.config.some(c => c.name === 'temperature')).toBe(true);
    });

    it('logic node (last: 循环) has first output named item', () => {
      const logic = builder.getNode('logic');
      expect(logic.outputs[0]?.name).toBe('item');
    });
  });

  describe('default templates', () => {
    it('data-pipeline: 6 nodes, 5 edges', () => {
      const tpl = builder.getTemplate('data-pipeline');
      expect(tpl.nodes).toHaveLength(6);
      expect(tpl.edges).toHaveLength(5);
    });

    it('content-moderation: 5 nodes, 4 edges', () => {
      const tpl = builder.getTemplate('content-moderation');
      expect(tpl.nodes).toHaveLength(5);
      expect(tpl.edges).toHaveLength(4);
    });

    it('scheduled-report: 5 nodes, edges may be absent or empty', () => {
      const tpl = builder.getTemplate('scheduled-report');
      expect(tpl.nodes).toHaveLength(5);
      expect(tpl.edges).toBeUndefined();
    });

    it('ticket-handler: 7 nodes, edges may be absent or empty', () => {
      const tpl = builder.getTemplate('ticket-handler');
      expect(tpl.nodes).toHaveLength(7);
      expect(tpl.edges).toBeUndefined();
    });

    it('each template has required metadata fields', () => {
      for (const tpl of builder.getTemplates()) {
        expect(tpl.id).toBeTruthy();
        expect(tpl.name).toBeTruthy();
        expect(tpl.description).toBeTruthy();
        expect(tpl.icon).toBeTruthy();
        expect(tpl.category).toBeTruthy();
        expect(tpl.difficulty).toBeTruthy();
        expect(Array.isArray(tpl.nodes)).toBe(true);
      }
    });
  });

  describe('_getCategoryName', () => {
    it('returns Chinese names for known categories', () => {
      const map = { trigger: '触发器', skill: '技能', llm: 'AI模型', logic: '逻辑', data: '数据', storage: '存储', notification: '通知', io: '输入/输出' };
      for (const [key, name] of Object.entries(map)) {
        expect(builder._getCategoryName(key)).toBe(name);
      }
    });

    it('returns key as-is for unknown category', () => {
      expect(builder._getCategoryName('unknown_cat')).toBe('unknown_cat');
    });
  });

  describe('_getCategoryIcon', () => {
    it('returns icons for known categories', () => {
      expect(builder._getCategoryIcon('trigger')).toBe('⚡');
      expect(builder._getCategoryIcon('skill')).toBe('🛠️');
      expect(builder._getCategoryIcon('llm')).toBe('🤖');
      expect(builder._getCategoryIcon('logic')).toBe('🔀');
      expect(builder._getCategoryIcon('data')).toBe('📊');
      expect(builder._getCategoryIcon('storage')).toBe('💾');
      expect(builder._getCategoryIcon('notification')).toBe('📬');
      expect(builder._getCategoryIcon('io')).toBe('⌨️');
    });

    it('returns fallback for unknown', () => {
      expect(builder._getCategoryIcon('void')).toBe('📦');
    });
  });

  describe('idempotency', () => {
    it('independent instances do not share nodes', () => {
      const a = new VisualFlowBuilder();
      const b = new VisualFlowBuilder();
      a.registerNode({ type: 'unique-a', category: 't', name: 'A', inputs: [], outputs: [], config: [], color: '#000' });
      expect(a.getNode('unique-a')).toBeTruthy();
      expect(b.getNode('unique-a')).toBeUndefined();
    });

    it('independent instances do not share templates', () => {
      const a = new VisualFlowBuilder();
      const b = new VisualFlowBuilder();
      a.registerTemplate({ id: 'unique-tpl', name: 'X', description: '', icon: '', category: '', difficulty: '', nodes: [], edges: [] });
      expect(a.getTemplate('unique-tpl')).toBeTruthy();
      expect(b.getTemplate('unique-tpl')).toBeUndefined();
    });
  });

  describe('getAllNodes returns fresh array', () => {
    it('each call returns a new array', () => {
      const a = builder.getAllNodes();
      const b = builder.getAllNodes();
      expect(a).not.toBe(b);
    });
  });
});
