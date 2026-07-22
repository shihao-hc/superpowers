/**
 * ToolManager - 工具管理器
 *
 * 善用工具：搜索、文档、调试、组合
 */

class ToolManager {
  constructor() {
    // 内置工具定义
    this.tools = new Map();

    // 工具使用历史
    this.history = [];

    // 初始化内置工具
    this._initBuiltInTools();
  }

  /**
   * 初始化内置工具
   */
  _initBuiltInTools() {
    this.register({
      id: 'search',
      name: '搜索',
      description: '搜索相关信息和解决方案',
      category: 'research',
      keywords: ['搜索', '查找', 'search', 'find'],
      async execute(context) {
        return {
          action: 'search',
          query: context.query,
          result: `已搜索: ${context.query}`
        };
      }
    });

    this.register({
      id: 'read',
      name: '阅读文档',
      description: '阅读和理解文档内容',
      category: 'research',
      keywords: ['文档', '文件', 'doc', 'read', '阅读'],
      async execute(context) {
        return {
          action: 'read',
          target: context.target,
          result: `已阅读: ${context.target}`
        };
      }
    });

    this.register({
      id: 'debug',
      name: '调试',
      description: '调试和分析问题',
      category: 'analysis',
      keywords: ['调试', 'debug', '错误', '问题'],
      async execute(context) {
        return {
          action: 'debug',
          target: context.target,
          result: `已分析: ${context.target}`
        };
      }
    });

    this.register({
      id: 'grep',
      name: '代码搜索',
      description: '在代码中搜索关键词',
      category: 'code',
      keywords: ['代码', '搜索', 'grep', 'find', '查找代码'],
      async execute(context) {
        return {
          action: 'grep',
          pattern: context.pattern,
          result: `已搜索: ${context.pattern}`
        };
      }
    });

    this.register({
      id: 'glob',
      name: '文件查找',
      description: '根据模式查找文件',
      category: 'code',
      keywords: ['文件', '查找', 'glob', 'find'],
      async execute(context) {
        return {
          action: 'glob',
          pattern: context.pattern,
          result: `已查找: ${context.pattern}`
        };
      }
    });
  }

  /**
   * 注册工具
   */
  register(tool) {
    this.tools.set(tool.id, {
      ...tool,
      usageCount: 0,
      lastUsed: null,
      successRate: 1.0
    });
  }

  /**
   * 选择合适的工具
   */
  selectTools(context) {
    const selected = [];
    const contextLower = context.toLowerCase();

    for (const [_id, tool] of this.tools) {
      // 检查关键词匹配
      const matched = tool.keywords.some((k) =>
        contextLower.includes(k.toLowerCase())
      );

      if (matched) {
        selected.push({
          id: tool.id,
          name: tool.name,
          description: tool.description,
          match: 'keyword',
          priority: tool.usageCount > 5 ? 'high' : 'medium'
        });
      }
    }

    // 按优先级排序
    selected.sort((a, b) => {
      if (a.priority === 'high' && b.priority !== 'high') {return -1;}
      if (b.priority === 'high' && a.priority !== 'high') {return 1;}
      return 0;
    });

    return selected;
  }

  /**
   * 执行工具
   */
  async execute(toolId, context) {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return { success: false, error: `工具 ${toolId} 不存在` };
    }

    try {
      const result = await tool.execute(context);

      // 更新统计
      tool.usageCount++;
      tool.lastUsed = Date.now();

      // 记录历史
      this.history.push({
        toolId,
        context,
        result,
        timestamp: Date.now(),
        success: true
      });

      return { success: true, result };
    } catch (error) {
      // 记录失败
      tool.successRate = Math.max(0, tool.successRate - 0.1);

      this.history.push({
        toolId,
        context,
        error: error.message,
        timestamp: Date.now(),
        success: false
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * 组合工具
   */
  compose(toolIds, _context) {
    return {
      type: 'composed',
      tools: toolIds.map((id) => ({
        id,
        name: this.tools.get(id)?.name || id
      })),
      execution: '按顺序执行'
    };
  }

  /**
   * 推荐工具组合
   */
  recommendCombination(context) {
    const selected = this.selectTools(context);

    // 常见组合模式
    const combinations = {
      research: ['search', 'read'],
      codeAnalysis: ['grep', 'glob', 'debug'],
      problemSolve: ['search', 'debug', 'read']
    };

    // 根据上下文推荐组合
    const contextLower = context.toLowerCase();
    let recommended;

    if (contextLower.includes('代码') || contextLower.includes('code')) {
      recommended = combinations.codeAnalysis;
    } else if (contextLower.includes('问题') || contextLower.includes('错误')) {
      recommended = combinations.problemSolve;
    } else {
      recommended = combinations.research;
    }

    return {
      selected: selected.slice(0, 3),
      recommended,
      combinations
    };
  }

  /**
   * 获取工具统计
   */
  getStats() {
    const stats = {
      total: this.tools.size,
      categories: {},
      mostUsed: [],
      recentlyUsed: []
    };

    for (const [_id, tool] of this.tools) {
      if (!stats.categories[tool.category]) {
        stats.categories[tool.category] = [];
      }
      stats.categories[tool.category].push({
        id: tool.id,
        name: tool.name,
        usageCount: tool.usageCount
      });
    }

    // 最常用的工具
    stats.mostUsed = Array.from(this.tools.values())
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 5)
      .map((t) => ({ id: t.id, name: t.name, count: t.usageCount }));

    // 最近使用的工具
    stats.recentlyUsed = this.history
      .slice(-5)
      .reverse()
      .map((h) => ({ id: h.toolId, timestamp: h.timestamp }));

    return stats;
  }

  /**
   * 获取工具列表
   */
  listTools(category = null) {
    const tools = Array.from(this.tools.values());

    if (category) {
      return tools.filter((t) => t.category === category);
    }

    return tools;
  }

  /**
   * 获取历史
   */
  getHistory(limit = 20) {
    return this.history.slice(-limit);
  }

  /**
   * 善用工具建议
   */
  suggestTools(context) {
    const suggestions = [];
    const contextLower = context.toLowerCase();

    // 基于上下文推荐
    if (contextLower.includes('不知道') || contextLower.includes('怎么')) {
      suggestions.push({
        tool: 'search',
        reason: '遇到未知问题，先搜索',
        priority: 'high'
      });
    }

    if (contextLower.includes('代码') || contextLower.includes('实现')) {
      suggestions.push({
        tool: 'read',
        reason: '查看现有代码实现',
        priority: 'high'
      });
    }

    if (contextLower.includes('错误') || contextLower.includes('问题')) {
      suggestions.push({
        tool: 'debug',
        reason: '分析问题根因',
        priority: 'high'
      });
    }

    if (contextLower.includes('查找') || contextLower.includes('搜索')) {
      suggestions.push({
        tool: 'grep',
        reason: '在代码中搜索关键词',
        priority: 'medium'
      });
    }

    return suggestions;
  }
}

module.exports = ToolManager;
