/**
 * MCP UnifiedBridge - 统一桥接器
 * 整合 RootsManager、DryRunEngine、ThinkingChain 为可插拔中间件
 */

const { rootsManager } = require('./engines/RootsManager');
const { dryRunEngine } = require('./engines/DryRunEngine');
const { thinkingChain } = require('./engines/ThinkingChain');
const { getAnnotation, getRiskLevel, annotateTools } = require('./engines/ToolAnnotations');

class UnifiedBridge {
  constructor(config = {}) {
    this.config = {
      enableRoots: config.enableRoots ?? true,
      enableDryRun: config.enableDryRun ?? true,
      enableThinking: config.enableThinking ?? true,
      autoConfirmReadOnly: config.autoConfirmReadOnly ?? false,
      ...config
    };

    this.tools = new Map();
    this.middlewares = [];
    this.bridges = new Map();
    
    this._initDefaultMiddlewares();
  }

  /**
   * 初始化默认中间件链
   */
  _initDefaultMiddlewares() {
    // 1. 路径验证中间件
    this.addMiddleware(async (toolName, params, next) => {
      if (this.config.enableRoots && this._needsPathValidation(toolName)) {
        const pathError = rootsManager.validateMiddleware(toolName, params);
        if (pathError) {
          return {
            error: 'PATH_VALIDATION_FAILED',
            message: pathError.message,
            code: pathError.code
          };
        }
      }
      return next();
    });

    // 2. Dry-run 中间件
    this.addMiddleware(async (toolName, params, next) => {
      if (this.config.enableDryRun && !getAnnotation(toolName).readOnlyHint) {
        if (params.dry_run === true || params.dryRun === true) {
          return this._generateDryRunPreview(toolName, params);
        }
      }
      return next();
    });

    // 3. 思维链中间件
    this.addMiddleware(async (toolName, params, next) => {
      if (this.config.enableThinking) {
        const chain = thinkingChain.getCurrentChain();
        if (chain) {
          params._chainId = chain.id;
        }
      }
      const result = await next();
      
      if (this.config.enableThinking && result && !result.error) {
        this._attachThinkingContext(toolName, params, result);
      }
      
      return result;
    });

    // 4. 注解注入中间件
    this.addMiddleware(async (toolName, params, next) => {
      const result = await next();
      if (result && !result.error) {
        result._meta = result._meta || {};
        result._meta.annotations = getAnnotation(toolName);
        result._meta.riskLevel = getRiskLevel(toolName);
        result._meta.timestamp = new Date().toISOString();
      }
      return result;
    });
  }

  /**
   * 添加自定义中间件
   */
  addMiddleware(middleware) {
    this.middlewares.push(middleware);
  }

  /**
   * 注册工具
   */
  registerTool(name, definition) {
    this.tools.set(name, {
      name,
      description: definition.description || '',
      inputSchema: definition.inputSchema,
      handler: definition.handler,
      annotation: definition.annotation || getAnnotation(name)
    });
  }

  /**
   * 注册 Bridge
   */
  registerBridge(name, bridge) {
    this.bridges.set(name, bridge);
    if (bridge.getTools) {
      for (const tool of bridge.getTools()) {
        this.registerTool(tool.name, tool);
      }
    }
  }

  /**
   * 执行工具调用
   */
  async callTool(name, params = {}) {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        error: 'TOOL_NOT_FOUND',
        message: `Tool "${name}" not found`,
        availableTools: Array.from(this.tools.keys())
      };
    }

    // 构建中间件链
    const chain = this._buildMiddlewareChain(tool, params);
    
    try {
      return await chain();
    } catch (error) {
      return {
        error: error.code || 'EXECUTION_ERROR',
        message: error.message,
        tool: name,
        recoverable: getAnnotation(name).idempotentHint
      };
    }
  }

  /**
   * 构建中间件链
   */
  _buildMiddlewareChain(tool, params) {
    const middlewares = [...this.middlewares];
    
    const execute = async () => {
      return tool.handler(params, {
        dryRun: dryRunEngine,
        roots: rootsManager,
        thinking: thinkingChain
      });
    };

    let current = execute;
    for (let i = middlewares.length - 1; i >= 0; i--) {
      const middleware = middlewares[i];
      const next = current;
      current = async () => middleware(tool.name, params, next);
    }

    return current;
  }

  /**
   * 检查是否需要路径验证
   */
  _needsPathValidation(toolName) {
    const pathTools = [
      'read_file', 'write_file', 'edit_file', 'delete_file',
      'read_text_file', 'read_media_file', 'list_directory',
      'create_directory', 'move_file', 'search_files'
    ];
    return pathTools.includes(toolName);
  }

  /**
   * 生成 Dry-run 预览
   */
  _generateDryRunPreview(toolName, params) {
    const previewers = {
      'edit_file': () => dryRunEngine.previewEdit(
        params.path,
        params.edits,
        params._content
      ),
      'write_file': () => dryRunEngine.previewWrite(params.path, params.content),
      'delete_file': () => dryRunEngine.previewDelete(params.path),
      'delete_directory': () => dryRunEngine.previewDeleteDirectory(params.path),
      'create_issue': () => dryRunEngine.previewCreateIssue(params),
      'merge_pr': () => dryRunEngine.previewMergePR(params),
      'delete_memo': () => dryRunEngine.previewDeleteMemo(params.memoId, params.memoContent),
      'cdp_command': () => dryRunEngine.previewCdpCommand(params.command, params.params)
    };

    const previewer = previewers[toolName];
    if (previewer) {
      return previewer();
    }

    return {
      _meta: {
        dryRun: true,
        preview: true,
        tool: toolName
      },
      params,
      confirmationNeeded: true,
      nextStep: 'Call again with dry_run=false to execute'
    };
  }

  /**
   * 附加思维链上下文
   */
  _attachThinkingContext(toolName, params, result) {
    const chain = thinkingChain.getCurrentChain();
    if (!chain) return;

    const annotation = getAnnotation(toolName);
    if (!annotation.readOnlyHint) {
      thinkingChain.addThought(chain.id, `执行操作: ${toolName}`, {
        reasoning: `参数: ${JSON.stringify(params)}`,
        metadata: { tool: toolName, success: !result.error }
      });
    }
  }

  /**
   * 获取所有工具（含注解）
   */
  getTools() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotation
    }));
  }

  /**
   * 获取带注解的工具
   */
  getToolsAnnotated() {
    return annotateTools(this.getTools());
  }

  /**
   * 根据风险等级筛选工具
   */
  getToolsByRiskLevel(level) {
    return this.getTools().filter(tool => 
      tool.annotations && tool.annotations.riskLevel === level
    );
  }

  /**
   * 获取安全操作（只读 + 低风险）
   */
  getSafeTools() {
    return this.getTools().filter(tool => {
      const ann = tool.annotations;
      return ann.readOnlyHint || (!ann.destructiveHint && ann.idempotentHint);
    });
  }

  /**
   * 获取危险操作
   */
  getDangerousTools() {
    return this.getTools().filter(tool =>
      tool.annotations && tool.annotations.destructiveHint
    );
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    const status = {
      bridge: 'healthy',
      tools: {
        total: this.tools.size,
        byRisk: {
          safe: this.getSafeTools().length,
          medium: this.getToolsByRiskLevel('medium').length,
          critical: this.getDangerousTools().length
        }
      },
      roots: {
        configured: rootsManager.getRoots().length,
        allowed: rootsManager.getAllowedPrefixes()
      },
      thinking: {
        activeChains: thinkingChain.listChains().filter(c => c.status === 'in_progress').length,
        totalChains: thinkingChain.listChains().length
      },
      middlewares: {
        count: this.middlewares.length,
        enabled: {
          roots: this.config.enableRoots,
          dryRun: this.config.enableDryRun,
          thinking: this.config.enableThinking
        }
      }
    };

    return status;
  }

  /**
   * 获取指标
   */
  getMetrics() {
    return {
      tools: {
        total: this.tools.size,
        annotated: Array.from(this.tools.values()).filter(t => t.annotation).length
      },
      dryRun: {
        historyCount: dryRunEngine.getHistory().length
      },
      thinking: {
        chains: thinkingChain.listChains().length
      }
    };
  }
}

// 单例导出
const unifiedBridge = new UnifiedBridge();

module.exports = {
  UnifiedBridge,
  unifiedBridge
};
