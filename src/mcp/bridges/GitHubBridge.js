/**
 * MCP GitHub Bridge - 增强版GitHub桥接器
 * 支持思维链联动、Dry-run预览、多仓库管理
 */

const { thinkingChain } = require('../engines/ThinkingChain');
const { dryRunEngine } = require('../engines/DryRunEngine');

class GitHubBridge {
  constructor(config = {}) {
    this.token = config.token || process.env.GITHUB_TOKEN;
    this.baseUrl = config.baseUrl || 'https://api.github.com';
    this.defaultOwner = config.defaultOwner;
    this.defaultRepo = config.defaultRepo;
    
    this.requestId = 0;
  }

  /**
   * 获取请求ID
   */
  _getRequestId() {
    return `req_${Date.now()}_${++this.requestId}`;
  }

  /**
   * GitHub API请求
   */
  async _request(method, endpoint, data = null) {
    const requestId = this._getRequestId();
    
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'X-Request-Id': requestId
      }
    };

    if (data) {
      options.body = JSON.stringify(data);
      options.headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, options);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(`GitHub API Error: ${result.message} (${response.status})`);
    }

    return { ...result, _meta: { requestId } };
  }

  /**
   * 获取所有工具
   */
  getTools() {
    return [
      // 只读操作
      this._tool('list_repositories', '列出用户仓库', { visibility: { type: 'string' } }),
      this._tool('get_repository', '获取仓库详情', { owner: { type: 'string' }, repo: { type: 'string' } }),
      this._tool('list_issues', '列出Issue', { owner: { type: 'string' }, repo: { type: 'string' }, state: { type: 'string' } }),
      this._tool('get_issue', '获取Issue详情', { owner: { type: 'string' }, repo: { type: 'string' }, issue_number: { type: 'number' } }),
      this._tool('search_repositories', '搜索仓库', { query: { type: 'string' }, sort: { type: 'string' } }),
      this._tool('list_prs', '列出PR', { owner: { type: 'string' }, repo: { type: 'string' }, state: { type: 'string' } }),
      this._tool('get_pr', '获取PR详情', { owner: { type: 'string' }, repo: { type: 'string' }, pr_number: { type: 'number' } }),
      this._tool('get_pr_diff', '获取PR差异', { owner: { type: 'string' }, repo: { type: 'string' }, pr_number: { type: 'number' } }),

      // 写操作
      this._tool('create_issue', '创建Issue', {
        owner: { type: 'string' }, repo: { type: 'string' }, title: { type: 'string' },
        body: { type: 'string' }, labels: { type: 'array' }, assignees: { type: 'array' },
        milestone: { type: 'number' }, chain_id: { type: 'string' }
      }),
      this._tool('update_issue', '更新Issue', {
        owner: { type: 'string' }, repo: { type: 'string' }, issue_number: { type: 'number' },
        title: { type: 'string' }, body: { type: 'string' }, state: { type: 'string' }
      }),
      this._tool('close_issue', '关闭Issue', { owner: { type: 'string' }, repo: { type: 'string' }, issue_number: { type: 'number' } }),
      this._tool('comment_on_issue', '评论Issue', { owner: { type: 'string' }, repo: { type: 'string' }, issue_number: { type: 'number' }, body: { type: 'string' } }),

      this._tool('create_pr', '创建PR', {
        owner: { type: 'string' }, repo: { type: 'string' }, title: { type: 'string' },
        body: { type: 'string' }, head: { type: 'string' }, base: { type: 'string' },
        draft: { type: 'boolean' }, chain_id: { type: 'string' }
      }),
      this._tool('merge_pr', '合并PR', { owner: { type: 'string' }, repo: { type: 'string' }, pr_number: { type: 'number' }, merge_method: { type: 'string' } }),
      this._tool('close_pr', '关闭PR', { owner: { type: 'string' }, repo: { type: 'string' }, pr_number: { type: 'number' } }),
      this._tool('request_review', '请求审查', { owner: { type: 'string' }, repo: { type: 'string' }, pr_number: { type: 'number' }, reviewers: { type: 'array' } }),
      this._tool('review_pr', 'PR审查', { owner: { type: 'string' }, repo: { type: 'string' }, pr_number: { type: 'number' }, body: { type: 'string' }, event: { type: 'string' }, chain_id: { type: 'string' } }),
    ];
  }

  _tool(name, description, inputSchema = {}) {
    return { name, description, inputSchema, handler: this._getHandler(name) };
  }

  _getHandler(name) {
    const handlers = {
      list_repositories: this.listRepositories.bind(this),
      get_repository: this.getRepository.bind(this),
      list_issues: this.listIssues.bind(this),
      get_issue: this.getIssue.bind(this),
      search_repositories: this.searchRepositories.bind(this),
      list_prs: this.listPRs.bind(this),
      get_pr: this.getPR.bind(this),
      get_pr_diff: this.getPRDiff.bind(this),
      create_issue: this.createIssue.bind(this),
      update_issue: this.updateIssue.bind(this),
      close_issue: this.closeIssue.bind(this),
      comment_on_issue: this.commentOnIssue.bind(this),
      create_pr: this.createPR.bind(this),
      merge_pr: this.mergePR.bind(this),
      close_pr: this.closePR.bind(this),
      request_review: this.requestReview.bind(this),
      review_pr: this.reviewPR.bind(this),
    };
    return handlers[name];
  }

  /**
   * 创建Issue - 支持思维链联动
   */
  async createIssue(params, context = {}) {
    const { owner, repo, title, body, labels, assignees, milestone, chain_id } = params;

    if (params.dry_run || params.dryRun) {
      return dryRunEngine.previewCreateIssue({ owner, repo, title, body, labels });
    }

    // 获取思维链上下文
    const thinkingContext = chain_id || thinkingChain.getCurrentChain()?.id;
    const thinkingChainLink = thinkingContext ? `\n\n<!-- Thinking Chain: ${thinkingContext} -->` : '';

    const data = {
      title,
      body: body + thinkingChainLink,
      labels,
      assignees,
      milestone
    };

    const result = await this._request('POST', `/repos/${owner}/${repo}/issues`, data);

    // 记录到思维链
    if (thinkingContext) {
      thinkingChain.addThought(thinkingContext, `创建Issue #${result.number}: ${title}`, {
        reasoning: `GitHub Issue创建成功`,
        metadata: { type: 'github_issue', number: result.number, url: result.html_url }
      });
    }

    return result;
  }

  /**
   * 创建PR - 支持思维链联动
   */
  async createPR(params, context = {}) {
    const { owner, repo, title, body, head, base, draft, chain_id } = params;

    if (params.dry_run || params.dryRun) {
      return {
        _meta: { dryRun: true, tool: 'create_pr' },
        requestPreview: { owner, repo, title, head, base, draft },
        formattedRequest: JSON.stringify({ title, body, head, base, draft }, null, 2),
        confirmationNeeded: true
      };
    }

    const thinkingContext = chain_id || thinkingChain.getCurrentChain()?.id;

    const data = { title, body, head, base };
    if (draft !== undefined) data.draft = draft;

    const result = await this._request('POST', `/repos/${owner}/${repo}/pulls`, data);

    if (thinkingContext) {
      thinkingChain.addThought(thinkingContext, `创建PR #${result.number}: ${title}`, {
        reasoning: `GitHub PR创建成功`,
        metadata: { type: 'github_pr', number: result.number, url: result.html_url }
      });
    }

    return result;
  }

  /**
   * PR审查 - 思维链联动
   */
  async reviewPR(params, context = {}) {
    const { owner, repo, pr_number, body, event, chain_id } = params;

    if (params.dry_run || params.dryRun) {
      return {
        _meta: { dryRun: true, tool: 'review_pr' },
        requestPreview: { owner, repo, pr_number, event },
        reviewOptions: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'],
        confirmationNeeded: true
      };
    }

    const thinkingContext = chain_id || thinkingChain.getCurrentChain()?.id;

    // 如果有body，生成审查意见子链
    if (body && thinkingContext) {
      const subChain = thinkingChain.createChain(`PR #${pr_number} 审查`, {
        type: 'pr_review',
        pr: `${owner}/${repo}#${pr_number}`
      });

      thinkingChain.addThought(subChain.id, body, {
        reasoning: '审查意见详情'
      });

      thinkingChain.completeChain(subChain.id, '审查意见已保存');
    }

    const data = { body, event };
    const result = await this._request('POST', `/repos/${owner}/${repo}/pulls/${pr_number}/reviews`, data);

    if (thinkingContext) {
      thinkingChain.addThought(thinkingContext, `审查PR #${pr_number}: ${event}`, {
        reasoning: body?.substring(0, 100) || '无审查意见',
        metadata: { type: 'github_review', pr: pr_number, event }
      });
    }

    return result;
  }

  /**
   * 合并PR - 危险操作
   */
  async mergePR(params, context = {}) {
    const { owner, repo, pr_number, merge_method } = params;

    if (params.dry_run || params.dryRun) {
      return dryRunEngine.previewMergePR({ owner, repo, prNumber: pr_number, mergeMethod: merge_method });
    }

    const thinkingContext = thinkingChain.getCurrentChain()?.id;

    const data = {};
    if (merge_method) data.merge_method = merge_method;

    const result = await this._request('PUT', `/repos/${owner}/${repo}/pulls/${pr_number}/merge`, data);

    if (thinkingContext) {
      thinkingChain.addThought(thinkingContext, `合并PR #${pr_number}`, {
        reasoning: 'PR已合并',
        metadata: { type: 'github_merge', pr: pr_number }
      });
    }

    return result;
  }

  // ==================== 只读操作 ====================

  async listRepositories(params) {
    const { visibility = 'all' } = params;
    return this._request('GET', `/user/repos?visibility=${visibility}`);
  }

  async getRepository(params) {
    const { owner, repo } = params;
    return this._request('GET', `/repos/${owner}/${repo}`);
  }

  async listIssues(params) {
    const { owner, repo, state = 'open', ...query } = params;
    const queryStr = new URLSearchParams({ state, ...query }).toString();
    return this._request('GET', `/repos/${owner}/${repo}/issues?${queryStr}`);
  }

  async getIssue(params) {
    const { owner, repo, issue_number } = params;
    return this._request('GET', `/repos/${owner}/${repo}/issues/${issue_number}`);
  }

  async searchRepositories(params) {
    const { query, sort = 'stars' } = params;
    return this._request('GET', `/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}`);
  }

  async listPRs(params) {
    const { owner, repo, state = 'open' } = params;
    return this._request('GET', `/repos/${owner}/${repo}/pulls?state=${state}`);
  }

  async getPR(params) {
    const { owner, repo, pr_number } = params;
    return this._request('GET', `/repos/${owner}/${repo}/pulls/${pr_number}`);
  }

  async getPRDiff(params) {
    const { owner, repo, pr_number } = params;
    const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/pulls/${pr_number}`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3.diff'
      }
    });
    return { diff: await response.text() };
  }

  // ==================== 写操作 ====================

  async updateIssue(params) {
    const { owner, repo, issue_number, ...data } = params;
    return this._request('PATCH', `/repos/${owner}/${repo}/issues/${issue_number}`, data);
  }

  async closeIssue(params) {
    const { owner, repo, issue_number } = params;
    return this._request('PATCH', `/repos/${owner}/${repo}/issues/${issue_number}`, { state: 'closed' });
  }

  async commentOnIssue(params) {
    const { owner, repo, issue_number, body } = params;
    return this._request('POST', `/repos/${owner}/${repo}/issues/${issue_number}/comments`, { body });
  }

  async closePR(params) {
    const { owner, repo, pr_number } = params;
    return this._request('PATCH', `/repos/${owner}/${repo}/pulls/${pr_number}`, { state: 'closed' });
  }

  async requestReview(params) {
    const { owner, repo, pr_number, reviewers } = params;
    return this._request('POST', `/repos/${owner}/${repo}/pulls/${pr_number}/requested_reviewers`, { reviewers });
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      await this._request('GET', '/user');
      return {
        status: 'healthy',
        authenticated: true,
        api: this.baseUrl
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        authenticated: false,
        error: error.message
      };
    }
  }
}

module.exports = { GitHubBridge };
