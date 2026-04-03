const { EventEmitter } = require('events');

class MCPToolRegistry extends EventEmitter {
  constructor(options = {}) {
    super();
    this.bridge = null;
    this.tools = new Map();
    this.tags = new Map();
    this.cache = {
      tools: new Map(),
      timestamp: null,
      ttl: options.cacheTTL || 300000
    };
    this.options = {
      autoRefresh: options.autoRefresh !== false,
      refreshInterval: options.refreshInterval || 60000,
      enableSchemaValidation: options.enableSchemaValidation !== false,
      ...options
    };
    this.refreshTimer = null;
    this.customTags = new Map();
    this.filters = {
      servers: new Set(),
      tags: new Set(),
      excludedTools: new Set()
    };
  }

  initialize(bridge) {
    this.bridge = bridge;
    
    bridge.on('server-registered', () => this.scheduleRefresh());
    bridge.on('server-unregistered', () => this.scheduleRefresh());
    bridge.on('reconnected', () => this.scheduleRefresh());

    if (this.options.autoRefresh) {
      this._startAutoRefresh();
    }
  }

  async refresh() {
    if (!this.bridge) {
      throw new Error('Registry not initialized with a bridge');
    }

    const servers = this.bridge.getRegisteredServers();
    const newTools = new Map();
    const newTags = new Map();

    for (const serverName of servers) {
      const serverTools = this.bridge.getAvailableTools(serverName);
      
      for (const tool of serverTools) {
        const fullName = tool.fullName;
        const tags = this._extractTags(tool);
        
        newTools.set(fullName, {
          ...tool,
          tags,
          cachedAt: Date.now(),
          validUntil: Date.now() + this.cache.ttl
        });

        for (const tag of tags) {
          if (!newTags.has(tag)) {
            newTags.set(tag, []);
          }
          newTags.get(tag).push(fullName);
        }
      }
    }

    this.tools = newTools;
    this.tags = newTags;
    this.cache.timestamp = Date.now();

    this.emit('refreshed', { 
      toolsCount: this.tools.size, 
      serversCount: servers.length 
    });

    return this.tools;
  }

  scheduleRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    
    this.refreshTimer = setTimeout(() => {
      this.refresh().catch(err => {
        this.emit('refresh-error', { error: err.message });
      });
    }, 100);
  }

  _startAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(() => {
      this.refresh().catch(err => {
        this.emit('refresh-error', { error: err.message });
      });
    }, this.options.refreshInterval);
  }

  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  _extractTags(tool) {
    const tags = new Set();

    const serverName = tool.serverName;
    if (serverName) {
      tags.add(serverName);
    }

    if (tool.tags && Array.isArray(tool.tags)) {
      for (const tag of tool.tags) {
        tags.add(tag);
      }
    }

    if (tool.description) {
      const categoryKeywords = {
        'file': ['file', 'filesystem', 'read', 'write', 'delete'],
        'git': ['git', 'commit', 'branch', 'repo', 'github'],
        'web': ['http', 'fetch', 'request', 'url', 'browser'],
        'data': ['database', 'query', 'sql', 'data'],
        'ai': ['llm', 'ai', 'model', 'generate', 'embed']
      };

      for (const [category, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(kw => tool.description.toLowerCase().includes(kw))) {
          tags.add(category);
        }
      }
    }

    if (this.customTags.has(tool.fullName)) {
      for (const tag of this.customTags.get(tool.fullName)) {
        tags.add(tag);
      }
    }

    return Array.from(tags);
  }

  addCustomTag(toolFullName, tag) {
    if (!this.customTags.has(toolFullName)) {
      this.customTags.set(toolFullName, new Set());
    }
    this.customTags.get(toolFullName).add(tag);
  }

  removeCustomTag(toolFullName, tag) {
    if (this.customTags.has(toolFullName)) {
      this.customTags.get(toolFullName).delete(tag);
    }
  }

  getTools(options = {}) {
    let result = Array.from(this.tools.values());

    if (options.serverName) {
      result = result.filter(t => t.serverName === options.serverName);
    }

    if (options.tags && options.tags.length > 0) {
      result = result.filter(t => 
        options.tags.some(tag => t.tags.includes(tag))
      );
    }

    if (options.excludedTags && options.excludedTags.length > 0) {
      result = result.filter(t =>
        !options.excludedTags.some(tag => t.tags.includes(tag))
      );
    }

    if (options.search) {
      const search = options.search.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(search) ||
        (t.description && t.description.toLowerCase().includes(search))
      );
    }

    return result;
  }

  getTool(fullName) {
    return this.tools.get(fullName) || null;
  }

  getTags() {
    return Array.from(this.tags.keys());
  }

  getToolsByTag(tag) {
    return (this.tags.get(tag) || []).map(fullName => this.tools.get(fullName)).filter(Boolean);
  }

  getToolsByServer(serverName) {
    return this.getTools({ serverName });
  }

  formatForLLM(options = {}) {
    const tools = options.serverName 
      ? this.getTools({ serverName: options.serverName })
      : Array.from(this.tools.values());

    const includeSchema = options.includeSchema !== false;

    return tools.map(tool => {
      const formatted = {
        name: tool.fullName,
        description: tool.description || `Tool from ${tool.serverName}`
      };

      if (includeSchema && tool.inputSchema) {
        formatted.parameters = tool.inputSchema;
      }

      if (options.includeTags) {
        formatted.tags = tool.tags;
      }

      return formatted;
    });
  }

  formatForPrompt(options = {}) {
    const tools = this.formatForLLM(options);
    
    if (tools.length === 0) {
      return 'No MCP tools available.';
    }

    let prompt = 'Available MCP tools:\n\n';

    for (const tool of tools) {
      prompt += `## ${tool.name}\n`;
      prompt += `${tool.description}\n`;
      
      if (tool.parameters && tool.parameters.properties) {
        prompt += 'Parameters:\n';
        for (const [paramName, paramDef] of Object.entries(tool.parameters.properties)) {
          const required = tool.parameters.required?.includes(paramName) ? '(required)' : '(optional)';
          prompt += `  - ${paramName} ${required}: ${paramDef.description || paramDef.type}\n`;
        }
      }
      prompt += '\n';
    }

    return prompt;
  }

  validateParams(toolFullName, params) {
    if (!this.options.enableSchemaValidation) {
      return { valid: true };
    }

    const tool = this.tools.get(toolFullName);
    if (!tool || !tool.inputSchema) {
      return { valid: true };
    }

    const errors = [];
    const required = tool.inputSchema.required || [];

    for (const req of required) {
      if (params[req] === undefined || params[req] === null) {
        errors.push({ field: req, message: `Missing required parameter: ${req}` });
      }
    }

    if (tool.inputSchema.properties) {
      for (const [paramName, paramDef] of Object.entries(tool.inputSchema.properties)) {
        if (params[paramName] !== undefined) {
          const expectedType = paramDef.type;
          const actualType = typeof params[paramName];

          if (expectedType === 'array' && !Array.isArray(params[paramName])) {
            errors.push({ field: paramName, message: `Expected array, got ${actualType}` });
          } else if (expectedType === 'object' && (actualType !== 'object' || params[paramName] === null)) {
            errors.push({ field: paramName, message: `Expected object, got ${actualType}` });
          } else if (expectedType === 'string' && actualType !== 'string') {
            errors.push({ field: paramName, message: `Expected string, got ${actualType}` });
          } else if (expectedType === 'number' && actualType !== 'number') {
            errors.push({ field: paramName, message: `Expected number, got ${actualType}` });
          } else if (expectedType === 'boolean' && actualType !== 'boolean') {
            errors.push({ field: paramName, message: `Expected boolean, got ${actualType}` });
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  getStats() {
    const tagCounts = {};
    for (const [tag, tools] of this.tags.entries()) {
      tagCounts[tag] = tools.length;
    }

    return {
      totalTools: this.tools.size,
      totalTags: this.tags.size,
      byServer: this._countByServer(),
      byTag: tagCounts,
      cacheAge: this.cache.timestamp ? Date.now() - this.cache.timestamp : null
    };
  }

  _countByServer() {
    const counts = {};
    for (const tool of this.tools.values()) {
      counts[tool.serverName] = (counts[tool.serverName] || 0) + 1;
    }
    return counts;
  }

  isCacheValid() {
    if (!this.cache.timestamp) return false;
    return Date.now() - this.cache.timestamp < this.cache.ttl;
  }

  destroy() {
    this.stopAutoRefresh();
    this.tools.clear();
    this.tags.clear();
    this.cache.tools.clear();
    this.customTags.clear();
  }
}

module.exports = { MCPToolRegistry };
