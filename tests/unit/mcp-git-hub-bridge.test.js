const { GitHubBridge } = require('../../src/mcp/bridges/GitHubBridge');

jest.mock('../../src/mcp/engines/ThinkingChain', () => {
  const mockAddThought = jest.fn();
  const mockCreateChain = jest.fn(() => ({ id: 'chain_mock_001' }));
  const mockCompleteChain = jest.fn();
  const mockGetCurrentChain = jest.fn(() => null);
  return {
    thinkingChain: {
      addThought: mockAddThought,
      createChain: mockCreateChain,
      completeChain: mockCompleteChain,
      getCurrentChain: mockGetCurrentChain
    }
  };
});

jest.mock('../../src/mcp/engines/DryRunEngine', () => {
  return {
    dryRunEngine: {
      previewCreateIssue: jest.fn(() => ({ _meta: { dryRun: true }, preview: 'create_issue' })),
      previewMergePR: jest.fn(() => ({ _meta: { dryRun: true }, preview: 'merge_pr' }))
    }
  };
});

const { thinkingChain } = require('../../src/mcp/engines/ThinkingChain');
const { dryRunEngine } = require('../../src/mcp/engines/DryRunEngine');

describe('GitHubBridge', () => {
  let bridge;

  beforeEach(() => {
    jest.clearAllMocks();
    bridge = new GitHubBridge({
      token: 'test_token',
      baseUrl: 'https://api.github.com',
      defaultOwner: 'testowner',
      defaultRepo: 'testrepo'
    });
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(bridge.token).toBe('test_token');
      expect(bridge.baseUrl).toBe('https://api.github.com');
      expect(bridge.defaultOwner).toBe('testowner');
      expect(bridge.defaultRepo).toBe('testrepo');
      expect(bridge.requestId).toBe(0);
    });

    it('should use env token when not provided', () => {
      const oldToken = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = 'env_token';
      const b = new GitHubBridge({});
      expect(b.token).toBe('env_token');
      if (oldToken !== undefined) {
        process.env.GITHUB_TOKEN = oldToken;
      } else {
        delete process.env.GITHUB_TOKEN;
      }
    });

    it('should use default baseUrl when not provided', () => {
      const b = new GitHubBridge({});
      expect(b.baseUrl).toBe('https://api.github.com');
    });
  });

  describe('_getRequestId', () => {
    it('should generate unique request ids', () => {
      const id1 = bridge._getRequestId();
      const id2 = bridge._getRequestId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^req_\d+_\d+$/);
    });
  });

  describe('_request', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should make GET request and return result with meta', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 1, name: 'test' })
      });

      const result = await bridge._request('GET', '/user');
      expect(result.id).toBe(1);
      expect(result._meta.requestId).toMatch(/^req_\d+_\d+$/);
    });

    it('should make POST request with body', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 42 })
      });

      const result = await bridge._request('POST', '/repos/o/r/issues', { title: 'Test' });
      expect(result.id).toBe(42);
      const callArgs = global.fetch.mock.calls[0];
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].body).toBe(JSON.stringify({ title: 'Test' }));
      expect(callArgs[1].headers['Content-Type']).toBe('application/json');
    });

    it('should throw on non-ok response', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Not Found' })
      });

      await expect(bridge._request('GET', '/nonexistent')).rejects.toThrow('GitHub API Error: Not Found (404)');
    });
  });

  describe('getTools', () => {
    it('should return all 17 tools', () => {
      const tools = bridge.getTools();
      expect(tools).toHaveLength(17);
    });

    it('each tool should have name, description, inputSchema and handler', () => {
      const tools = bridge.getTools();
      for (const tool of tools) {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool).toHaveProperty('handler');
        expect(typeof tool.handler).toBe('function');
      }
    });

    it('should include read and write tools', () => {
      const tools = bridge.getTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('list_repositories');
      expect(names).toContain('create_issue');
      expect(names).toContain('create_pr');
      expect(names).toContain('review_pr');
      expect(names).toContain('merge_pr');
    });
  });

  describe('createIssue', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should return dry-run preview when dry_run is true', async () => {
      const result = await bridge.createIssue({
        owner: 'o', repo: 'r', title: 'Test', body: 'Body',
        labels: ['bug'], dry_run: true
      });
      expect(result._meta.dryRun).toBe(true);
      expect(dryRunEngine.previewCreateIssue).toHaveBeenCalledWith({
        owner: 'o', repo: 'r', title: 'Test', body: 'Body', labels: ['bug']
      });
    });

    it('should return dry-run preview when dryRun is true', async () => {
      const result = await bridge.createIssue({
        owner: 'o', repo: 'r', title: 'Test', body: 'Body', dryRun: true
      });
      expect(result._meta.dryRun).toBe(true);
    });

    it('should create issue and link to thinking chain', async () => {
      thinkingChain.getCurrentChain.mockReturnValue({ id: 'chain_001' });
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 1, number: 42, html_url: 'https://github.com/o/r/issues/42', title: 'Test Issue' })
      });

      const result = await bridge.createIssue({
        owner: 'o', repo: 'r', title: 'Test Issue', body: 'Description',
        milestone: 1
      });

      expect(result.number).toBe(42);
      expect(thinkingChain.addThought).toHaveBeenCalledWith('chain_001', expect.stringContaining('42'), expect.any(Object));
    });

    it('should use chain_id over current chain', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 1, number: 10, html_url: 'https://github.com/o/r/issues/10', title: 'T' })
      });

      await bridge.createIssue({
        owner: 'o', repo: 'r', title: 'T', body: 'B', chain_id: 'explicit_chain'
      });

      expect(thinkingChain.addThought).toHaveBeenCalledWith('explicit_chain', expect.any(String), expect.any(Object));
    });

    it('should handle fetch error', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));
      const result = bridge.createIssue({
        owner: 'o', repo: 'r', title: 'T', body: 'B'
      });
      await expect(result).rejects.toThrow('Network error');
    });
  });

  describe('createPR', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should return dry-run preview when dry_run is true', async () => {
      const result = await bridge.createPR({
        owner: 'o', repo: 'r', title: 'PR Title', body: 'Desc',
        head: 'feature', base: 'main', dry_run: true
      });
      expect(result._meta.dryRun).toBe(true);
      expect(result.requestPreview.title).toBe('PR Title');
      expect(result.confirmationNeeded).toBe(true);
    });

    it('should create PR successfully', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 1, number: 100, title: 'New PR' })
      });

      const result = await bridge.createPR({
        owner: 'o', repo: 'r', title: 'New PR', body: 'Desc', head: 'f', base: 'main', draft: true
      });
      expect(result.number).toBe(100);
    });

    it('should handle fetch error', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));
      await expect(bridge.createPR({
        owner: 'o', repo: 'r', title: 'T', body: 'B', head: 'f', base: 'main'
      })).rejects.toThrow('Network error');
    });
  });

  describe('reviewPR', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should return dry-run preview', async () => {
      const result = await bridge.reviewPR({
        owner: 'o', repo: 'r', pr_number: 5, body: 'LGTM', event: 'APPROVE', dry_run: true
      });
      expect(result._meta.dryRun).toBe(true);
      expect(result.requestPreview.pr_number).toBe(5);
      expect(result.reviewOptions).toEqual(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']);
    });

    it('should submit review and create sub-chain when body present', async () => {
      thinkingChain.getCurrentChain.mockReturnValue({ id: 'chain_001' });
      thinkingChain.createChain.mockReturnValue({ id: 'sub_chain_001' });
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 99 })
      });

      const result = await bridge.reviewPR({
        owner: 'o', repo: 'r', pr_number: 5, body: 'Great work!', event: 'APPROVE'
      });

      expect(result.id).toBe(99);
      expect(thinkingChain.createChain).toHaveBeenCalled();
      expect(thinkingChain.completeChain).toHaveBeenCalledWith('sub_chain_001', '审查意见已保存');
      expect(thinkingChain.addThought).toHaveBeenCalledWith('chain_001', expect.any(String), expect.any(Object));
    });
  });

  describe('mergePR', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should return dry-run preview', async () => {
      await bridge.mergePR({
        owner: 'o', repo: 'r', pr_number: 3, merge_method: 'squash', dry_run: true
      });
      expect(dryRunEngine.previewMergePR).toHaveBeenCalledWith({
        owner: 'o', repo: 'r', prNumber: 3, mergeMethod: 'squash'
      });
    });

    it('should merge PR successfully', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ merged: true, sha: 'abc123' })
      });

      const result = await bridge.mergePR({
        owner: 'o', repo: 'r', pr_number: 3, merge_method: 'merge'
      });
      expect(result.merged).toBe(true);
    });
  });

  describe('read operations', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('listRepositories should include visibility param', async () => {
      global.fetch.mockResolvedValue({
        ok: true, json: () => Promise.resolve([{ id: 1, name: 'repo1' }])
      });
      const result = await bridge.listRepositories({ visibility: 'public' });
      expect(result._meta).toBeDefined();
      expect(result[0].name).toBe('repo1');
    });

    it('listRepositories should default to all visibility', async () => {
      global.fetch.mockResolvedValue({
        ok: true, json: () => Promise.resolve([])
      });
      await bridge.listRepositories({});
      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain('visibility=all');
    });

    it('getRepository should call correct endpoint', async () => {
      global.fetch.mockResolvedValue({
        ok: true, json: () => Promise.resolve({ id: 1, name: 'repo', full_name: 'o/repo' })
      });
      const result = await bridge.getRepository({ owner: 'o', repo: 'repo' });
      expect(result.full_name).toBe('o/repo');
    });

    it('getIssue should call correct endpoint', async () => {
      global.fetch.mockResolvedValue({
        ok: true, json: () => Promise.resolve({ id: 10, number: 10 })
      });
      const result = await bridge.getIssue({ owner: 'o', repo: 'r', issue_number: 10 });
      expect(result.number).toBe(10);
    });

    it('listIssues should build query string', async () => {
      global.fetch.mockResolvedValue({
        ok: true, json: () => Promise.resolve([])
      });
      await bridge.listIssues({ owner: 'o', repo: 'r', state: 'closed' });
      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain('state=closed');
    });

    it('searchRepositories should encode query', async () => {
      global.fetch.mockResolvedValue({
        ok: true, json: () => Promise.resolve({ items: [] })
      });
      await bridge.searchRepositories({ query: 'test repo' });
      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain(encodeURIComponent('test repo'));
      expect(url).toContain('sort=stars');
    });

    it('searchRepositories should allow custom sort', async () => {
      global.fetch.mockResolvedValue({
        ok: true, json: () => Promise.resolve({ items: [] })
      });
      await bridge.searchRepositories({ query: 'test', sort: 'updated' });
      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain('sort=updated');
    });

    it('getPR should call correct endpoint', async () => {
      global.fetch.mockResolvedValue({
        ok: true, json: () => Promise.resolve({ id: 5, number: 5 })
      });
      const result = await bridge.getPR({ owner: 'o', repo: 'r', pr_number: 5 });
      expect(result.number).toBe(5);
    });

    it('listPRs should default to open state', async () => {
      global.fetch.mockResolvedValue({
        ok: true, json: () => Promise.resolve([])
      });
      await bridge.listPRs({ owner: 'o', repo: 'r' });
      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain('state=open');
    });

    it('getPRDiff should fetch raw diff', async () => {
      global.fetch.mockResolvedValue({
        ok: true, text: () => Promise.resolve('diff --git a/file b/file')
      });
      const result = await bridge.getPRDiff({ owner: 'o', repo: 'r', pr_number: 1 });
      expect(result.diff).toContain('diff --git');
    });
  });

  describe('write operations', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('updateIssue should send PATCH', async () => {
      global.fetch.mockResolvedValue({
        ok: true, json: () => Promise.resolve({ id: 1, title: 'Updated' })
      });
      const result = await bridge.updateIssue({ owner: 'o', repo: 'r', issue_number: 1, title: 'Updated' });
      expect(result.title).toBe('Updated');
      const callArgs = global.fetch.mock.calls[0][1];
      expect(callArgs.method).toBe('PATCH');
    });

    it('closeIssue should send PATCH with closed state', async () => {
      global.fetch.mockResolvedValue({
        ok: true, json: () => Promise.resolve({ state: 'closed' })
      });
      const result = await bridge.closeIssue({ owner: 'o', repo: 'r', issue_number: 1 });
      expect(result.state).toBe('closed');
    });

    it('commentOnIssue should send POST', async () => {
      global.fetch.mockResolvedValue({
        ok: true, json: () => Promise.resolve({ id: 100, body: 'comment' })
      });
      const result = await bridge.commentOnIssue({ owner: 'o', repo: 'r', issue_number: 1, body: 'Nice work!' });
      expect(result.id).toBe(100);
    });

    it('closePR should send PATCH with closed state', async () => {
      global.fetch.mockResolvedValue({
        ok: true, json: () => Promise.resolve({ state: 'closed' })
      });
      const result = await bridge.closePR({ owner: 'o', repo: 'r', pr_number: 1 });
      expect(result.state).toBe('closed');
    });

    it('requestReview should send POST with reviewers', async () => {
      global.fetch.mockResolvedValue({
        ok: true, json: () => Promise.resolve({ requested_reviewers: [{ login: 'user1' }] })
      });
      const result = await bridge.requestReview({ owner: 'o', repo: 'r', pr_number: 1, reviewers: ['user1'] });
      expect(result.requested_reviewers).toHaveLength(1);
    });
  });

  describe('constructor - default config', () => {
    it('should use empty object as default config', () => {
      const oldToken = process.env.GITHUB_TOKEN;
      process.env.GITHUB_TOKEN = 'default_config_token';
      const b = new GitHubBridge();
      expect(b.token).toBe('default_config_token');
      expect(b.baseUrl).toBe('https://api.github.com');
      if (oldToken !== undefined) {
        process.env.GITHUB_TOKEN = oldToken;
      } else {
        delete process.env.GITHUB_TOKEN;
      }
    });
  });

  describe('_tool', () => {
    it('should use empty inputSchema when not provided', () => {
      const tool = bridge._tool('list_repositories', 'List repos');
      expect(tool.name).toBe('list_repositories');
      expect(tool.inputSchema).toEqual({});
      expect(typeof tool.handler).toBe('function');
    });
  });

  describe('createIssue - no chain context', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
      thinkingChain.getCurrentChain.mockReturnValue(null);
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should create issue without chain context or dry run', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 1, number: 50, html_url: 'https://github.com/o/r/issues/50', title: 'No Chain' })
      });
      const result = await bridge.createIssue({
        owner: 'o', repo: 'r', title: 'No Chain', body: 'Just a test'
      });
      expect(result.number).toBe(50);
      expect(global.fetch.mock.calls[0][1].body).not.toContain('Thinking Chain');
      expect(thinkingChain.addThought).not.toHaveBeenCalled();
    });
  });

  describe('createPR - chain context', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should record thought in thinking chain when context exists', async () => {
      thinkingChain.getCurrentChain.mockReturnValue({ id: 'chain_001' });
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 1, number: 200, title: 'Chained PR' })
      });
      const result = await bridge.createPR({
        owner: 'o', repo: 'r', title: 'Chained PR', body: 'Desc', head: 'f', base: 'main'
      });
      expect(result.number).toBe(200);
      expect(thinkingChain.addThought).toHaveBeenCalledWith('chain_001', expect.stringContaining('200'), expect.any(Object));
    });
  });

  describe('reviewPR - edge cases', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should not create sub-chain when body is missing but chain context exists', async () => {
      thinkingChain.getCurrentChain.mockReturnValue({ id: 'chain_001' });
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 100 })
      });
      const result = await bridge.reviewPR({
        owner: 'o', repo: 'r', pr_number: 5, event: 'APPROVE'
      });
      expect(result.id).toBe(100);
      expect(thinkingChain.createChain).not.toHaveBeenCalled();
      expect(thinkingChain.addThought).toHaveBeenCalledWith('chain_001', expect.any(String), expect.any(Object));
    });

    it('should not create sub-chain when chain context missing but body exists', async () => {
      thinkingChain.getCurrentChain.mockReturnValue(null);
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 101 })
      });
      const result = await bridge.reviewPR({
        owner: 'o', repo: 'r', pr_number: 6, body: 'Looks good', event: 'COMMENT'
      });
      expect(result.id).toBe(101);
      expect(thinkingChain.createChain).not.toHaveBeenCalled();
      expect(thinkingChain.addThought).not.toHaveBeenCalled();
    });

    it('should submit review without any chain interaction', async () => {
      thinkingChain.getCurrentChain.mockReturnValue(null);
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 102 })
      });
      const result = await bridge.reviewPR({
        owner: 'o', repo: 'r', pr_number: 7, event: 'REQUEST_CHANGES'
      });
      expect(result.id).toBe(102);
      expect(thinkingChain.createChain).not.toHaveBeenCalled();
      expect(thinkingChain.addThought).not.toHaveBeenCalled();
    });
  });

  describe('mergePR - edge cases', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should merge PR with chain context and without merge_method', async () => {
      thinkingChain.getCurrentChain.mockReturnValue({ id: 'chain_001' });
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ merged: true, sha: 'def456' })
      });
      const result = await bridge.mergePR({
        owner: 'o', repo: 'r', pr_number: 10
      });
      expect(result.merged).toBe(true);
      const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(callBody).toEqual({});
      expect(thinkingChain.addThought).toHaveBeenCalledWith('chain_001', expect.any(String), expect.any(Object));
    });
  });

  describe('listIssues - default state', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('listIssues should default state to open', async () => {
      global.fetch.mockResolvedValue({
        ok: true, json: () => Promise.resolve([])
      });
      await bridge.listIssues({ owner: 'o', repo: 'r' });
      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain('state=open');
    });
  });

    describe('createPR - falsy thinkingContext path', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
      thinkingChain.getCurrentChain.mockReturnValue(null);
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should skip addThought when no chain context exists', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 1, number: 400, title: 'Falsy Path PR' })
      });
      const result = await bridge.createPR({
        owner: 'o', repo: 'r', title: 'Falsy Path PR', body: 'Desc', head: 'f', base: 'main'
      });
      expect(result.number).toBe(400);
      expect(thinkingChain.addThought).not.toHaveBeenCalled();
    });
  });

  describe('mergePR - falsy thinkingContext path', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
      thinkingChain.getCurrentChain.mockReturnValue(null);
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should skip addThought when no chain context exists', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ merged: true, sha: 'xyz789' })
      });
      const result = await bridge.mergePR({
        owner: 'o', repo: 'r', pr_number: 15
      });
      expect(result.merged).toBe(true);
      expect(thinkingChain.addThought).not.toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    afterEach(() => {
      delete global.fetch;
    });

    it('should return healthy when API responds', async () => {
      global.fetch.mockResolvedValue({
        ok: true, json: () => Promise.resolve({ login: 'testuser' })
      });
      const result = await bridge.healthCheck();
      expect(result.status).toBe('healthy');
      expect(result.authenticated).toBe(true);
    });

    it('should return unhealthy on error', async () => {
      global.fetch.mockRejectedValue(new Error('API timeout'));
      const result = await bridge.healthCheck();
      expect(result.status).toBe('unhealthy');
      expect(result.authenticated).toBe(false);
      expect(result.error).toMatch(/API timeout/);
    });

    it('should return unhealthy on API error', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Bad credentials' })
      });
      const result = await bridge.healthCheck();
      expect(result.status).toBe('unhealthy');
    });
  });
});
