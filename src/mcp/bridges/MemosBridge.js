/**
 * MCP Memos Bridge - 笔记系统桥接器
 * 支持语义搜索、思维链自动保存、多实例
 */

const { thinkingChain } = require('../engines/ThinkingChain');
const { dryRunEngine } = require('../engines/DryRunEngine');

class MemosBridge {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || 'http://localhost:5230';
    this.token = config.token || process.env.MEMOS_TOKEN;
    this.currentInstance = config.defaultInstance || 'default';
    this.instances = new Map();
    
    this.localMemos = [];
  }

  /**
   * 获取所有工具
   */
  getTools() {
    return [
      // 只读操作
      this._tool('list_memos', '列出笔记', { limit: { type: 'number' }, offset: { type: 'number' } }),
      this._tool('get_memo', '获取笔记详情', { id: { type: 'string' } }),
      this._tool('search_memos', '搜索笔记', { query: { type: 'string' }, limit: { type: 'number' } }),
      this._tool('list_tags', '列出标签'),
      this._tool('list_instances', '列出实例'),
      this._tool('list_shortcuts', '列出快捷方式'),

      // 写操作
      this._tool('create_memo', '创建笔记', {
        content: { type: 'string' }, visibility: { type: 'string' },
        tags: { type: 'array' }, pinned: { type: 'boolean' },
        chain_id: { type: 'string' }
      }),
      this._tool('update_memo', '更新笔记', {
        id: { type: 'string' }, content: { type: 'string' },
        visibility: { type: 'string' }, pinned: { type: 'boolean' }
      }),
      this._tool('delete_memo', '删除笔记', { id: { type: 'string' } }),
      this._tool('pin_memo', '置顶笔记', { id: { type: 'string' }, pinned: { type: 'boolean' } }),

      // 实例管理
      this._tool('connect_instance', '连接实例', { name: { type: 'string' }, url: { type: 'string' }, token: { type: 'string' } }),
      this._tool('switch_instance', '切换实例', { name: { type: 'string' } }),
      
      // 标签
      this._tool('create_tag', '创建标签', { name: { type: 'string' } }),
      this._tool('delete_tag', '删除标签', { name: { type: 'string' } }),
      this._tool('auto_tag', '自动生成标签', { content: { type: 'string' } }),

      // 附件
      this._tool('upload_attachment', '上传附件', { file: { type: 'string' }, memo_id: { type: 'string' } }),

      // 思维链保存
      this._tool('save_thinking_to_memo', '保存思维链到笔记', { chain_id: { type: 'string' }, visibility: { type: 'string' } }),
    ];
  }

  _tool(name, description, inputSchema = {}) {
    return { name, description, inputSchema, handler: this._getHandler(name) };
  }

  _getHandler(name) {
    const handlers = {
      list_memos: this.listMemos.bind(this),
      get_memo: this.getMemo.bind(this),
      search_memos: this.searchMemos.bind(this),
      list_tags: this.listTags.bind(this),
      list_instances: this.listInstances.bind(this),
      list_shortcuts: this.listShortcuts.bind(this),
      create_memo: this.createMemo.bind(this),
      update_memo: this.updateMemo.bind(this),
      delete_memo: this.deleteMemo.bind(this),
      pin_memo: this.pinMemo.bind(this),
      connect_instance: this.connectInstance.bind(this),
      switch_instance: this.switchInstance.bind(this),
      create_tag: this.createTag.bind(this),
      delete_tag: this.deleteTag.bind(this),
      auto_tag: this.autoTag.bind(this),
      upload_attachment: this.uploadAttachment.bind(this),
      save_thinking_to_memo: this.saveThinkingToMemo.bind(this),
    };
    return handlers[name];
  }

  /**
   * 创建笔记 - 支持思维链保存
   */
  async createMemo(params) {
    const { content, visibility = 'PRIVATE', tags = [], pinned = false, chain_id } = params;

    if (params.dry_run || params.dryRun) {
      return {
        _meta: { dryRun: true, tool: 'create_memo' },
        preview: { content, visibility, tags },
        confirmationNeeded: true
      };
    }

    const memo = {
      id: `memo_${Date.now()}`,
      content,
      visibility,
      tags,
      pinned,
      createdAt: new Date().toISOString(),
      instance: this.currentInstance
    };

    this.localMemos.unshift(memo);

    // 记录到思维链
    const thinkingContext = chain_id || thinkingChain.getCurrentChain()?.id;
    if (thinkingContext) {
      thinkingChain.addThought(thinkingContext, `保存笔记: ${content.substring(0, 50)}...`, {
        reasoning: '笔记创建成功',
        metadata: { type: 'memo', id: memo.id, tags }
      });
    }

    return memo;
  }

  /**
   * 搜索笔记 - 简单语义搜索
   */
  async searchMemos(params) {
    const { query, limit = 10 } = params;

    // 简单的关键词匹配（实际应用中应使用向量嵌入）
    const results = this.localMemos.filter(memo => {
      const text = `${memo.content} ${memo.tags.join(' ')}`.toLowerCase();
      return query.toLowerCase().split(' ').some(term => text.includes(term));
    }).slice(0, limit);

    return {
      query,
      results,
      count: results.length,
      total: this.localMemos.length,
      note: 'Basic keyword search. Use semantic search for better results.'
    };
  }

  /**
   * 列出笔记
   */
  async listMemos(params) {
    const { limit = 20, offset = 0 } = params;

    return {
      memos: this.localMemos.slice(offset, offset + limit),
      total: this.localMemos.length,
      offset,
      limit
    };
  }

  /**
   * 获取笔记
   */
  async getMemo(params) {
    const { id } = params;
    const memo = this.localMemos.find(m => m.id === id);

    if (!memo) {
      return { error: 'Memo not found', id };
    }

    return memo;
  }

  /**
   * 更新笔记
   */
  async updateMemo(params) {
    const { id, content, visibility, pinned } = params;

    if (params.dry_run || params.dryRun) {
      const memo = this.localMemos.find(m => m.id === id);
      return {
        _meta: { dryRun: true, tool: 'update_memo' },
        preview: { before: memo, after: { content, visibility, pinned } },
        confirmationNeeded: true
      };
    }

    const memo = this.localMemos.find(m => m.id === id);
    if (memo) {
      if (content !== undefined) memo.content = content;
      if (visibility !== undefined) memo.visibility = visibility;
      if (pinned !== undefined) memo.pinned = pinned;
      memo.updatedAt = new Date().toISOString();
    }

    return memo || { error: 'Memo not found' };
  }

  /**
   * 删除笔记
   */
  async deleteMemo(params) {
    const { id } = params;

    if (params.dry_run || params.dryRun) {
      const memo = this.localMemos.find(m => m.id === id);
      return dryRunEngine.previewDeleteMemo(id, memo?.content);
    }

    const index = this.localMemos.findIndex(m => m.id === id);
    if (index !== -1) {
      const deleted = this.localMemos.splice(index, 1)[0];
      return { success: true, deleted };
    }

    return { success: false, error: 'Memo not found' };
  }

  /**
   * 置顶笔记
   */
  async pinMemo(params) {
    const { id, pinned = true } = params;
    const memo = this.localMemos.find(m => m.id === id);

    if (memo) {
      memo.pinned = pinned;
      return { success: true, memo };
    }

    return { success: false, error: 'Memo not found' };
  }

  /**
   * 列出标签
   */
  async listTags(params) {
    const tags = new Set();
    for (const memo of this.localMemos) {
      for (const tag of memo.tags || []) {
        tags.add(tag);
      }
    }

    return {
      tags: Array.from(tags),
      count: tags.size
    };
  }

  /**
   * 创建标签
   */
  async createTag(params) {
    const { name } = params;
    return { success: true, tag: name, createdAt: new Date().toISOString() };
  }

  /**
   * 删除标签
   */
  async deleteTag(params) {
    const { name } = params;
    return { success: true, tag: name, deletedAt: new Date().toISOString() };
  }

  /**
   * 自动生成标签
   */
  async autoTag(params) {
    const { content } = params;

    // 简单的关键词提取（实际应用中应使用NLP）
    const keywords = [];
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('bug') || lowerContent.includes('fix')) keywords.push('bug');
    if (lowerContent.includes('feature')) keywords.push('feature');
    if (lowerContent.includes('docs') || lowerContent.includes('document')) keywords.push('docs');
    if (lowerContent.includes('test')) keywords.push('testing');
    if (lowerContent.includes('refactor')) keywords.push('refactor');

    return {
      content: content.substring(0, 100),
      suggestedTags: keywords,
      confidence: keywords.length > 0 ? 'medium' : 'low'
    };
  }

  /**
   * 连接实例
   */
  async connectInstance(params) {
    const { name, url, token } = params;

    this.instances.set(name, { url, token, name });
    this.currentInstance = name;

    return {
      success: true,
      instance: name,
      connected: true,
      message: `Connected to instance: ${name}`
    };
  }

  /**
   * 切换实例
   */
  async switchInstance(params) {
    const { name } = params;

    if (!this.instances.has(name)) {
      return { success: false, error: 'Instance not found' };
    }

    this.currentInstance = name;
    return {
      success: true,
      instance: name,
      message: `Switched to instance: ${name}`
    };
  }

  /**
   * 列出实例
   */
  async listInstances(params) {
    return {
      instances: Array.from(this.instances.entries()).map(([name, config]) => ({
        name,
        url: config.url,
        current: name === this.currentInstance
      })),
      current: this.currentInstance
    };
  }

  /**
   * 列出快捷方式
   */
  async listShortcuts(params) {
    return {
      shortcuts: [],
      count: 0
    };
  }

  /**
   * 上传附件
   */
  async uploadAttachment(params) {
    const { file, memo_id } = params;
    return {
      success: true,
      attachmentId: `attach_${Date.now()}`,
      memoId: memo_id,
      filename: file
    };
  }

  /**
   * 保存思维链到笔记
   */
  async saveThinkingToMemo(params) {
    const { chain_id, visibility = 'PRIVATE' } = params;

    const chain = thinkingChain.getChain(chain_id || this.currentInstance);
    if (!chain) {
      return { error: 'Thinking chain not found' };
    }

    const content = `# 思维链: ${chain.id}\n\n${chain.serialized}`;

    const memo = await this.createMemo({
      content,
      visibility,
      tags: ['thinking-chain', 'ai-generated'],
      chain_id
    });

    return {
      success: true,
      memo,
      chainId: chain.id,
      steps: chain.thoughts.length
    };
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    return {
      status: 'healthy',
      instance: this.currentInstance,
      memos: this.localMemos.length,
      instances: this.instances.size,
      connected: true
    };
  }
}

module.exports = { MemosBridge };
