const mockThinkingChain = {
  getCurrentChain: jest.fn(),
  addThought: jest.fn(),
  getChain: jest.fn()
};

jest.mock('../../src/mcp/engines/ThinkingChain', () => ({
  thinkingChain: mockThinkingChain
}));

const mockDryRunEngine = {
  previewDeleteMemo: jest.fn()
};

jest.mock('../../src/mcp/engines/DryRunEngine', () => ({
  dryRunEngine: mockDryRunEngine
}));

const { MemosBridge } = require('../../src/mcp/bridges/MemosBridge');

describe('MemosBridge', () => {
  let bridge;

  beforeEach(() => {
    jest.clearAllMocks();
    bridge = new MemosBridge({ baseUrl: 'http://localhost:5230', defaultInstance: 'default' });
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const b = new MemosBridge();
      expect(b.baseUrl).toBe('http://localhost:5230');
      expect(b.currentInstance).toBe('default');
      expect(b.instances).toBeInstanceOf(Map);
      expect(b.localMemos).toEqual([]);
    });

    it('should accept custom config', () => {
      const b = new MemosBridge({
        baseUrl: 'http://memos.local:8080',
        token: 'abc123',
        defaultInstance: 'work'
      });
      expect(b.baseUrl).toBe('http://memos.local:8080');
      expect(b.token).toBe('abc123');
      expect(b.currentInstance).toBe('work');
    });
  });

  describe('getTools', () => {
    it('should return all tool definitions', () => {
      const tools = bridge.getTools();
      expect(Array.isArray(tools)).toBe(true);
      tools.forEach((t) => {
        expect(t).toHaveProperty('name');
        expect(t).toHaveProperty('description');
        expect(t).toHaveProperty('handler');
      });
    });

    it('should include read tools', () => {
      const names = bridge.getTools().map((t) => t.name);
      expect(names).toContain('list_memos');
      expect(names).toContain('get_memo');
      expect(names).toContain('search_memos');
    });

    it('should include write tools', () => {
      const names = bridge.getTools().map((t) => t.name);
      expect(names).toContain('create_memo');
      expect(names).toContain('update_memo');
      expect(names).toContain('delete_memo');
    });

    it('should include instance management tools', () => {
      const names = bridge.getTools().map((t) => t.name);
      expect(names).toContain('connect_instance');
      expect(names).toContain('switch_instance');
      expect(names).toContain('list_instances');
    });

    it('should include tag tools', () => {
      const names = bridge.getTools().map((t) => t.name);
      expect(names).toContain('create_tag');
      expect(names).toContain('delete_tag');
      expect(names).toContain('auto_tag');
    });

    it('should include attachment tool', () => {
      const names = bridge.getTools().map((t) => t.name);
      expect(names).toContain('upload_attachment');
    });

    it('should include thinking chain tool', () => {
      const names = bridge.getTools().map((t) => t.name);
      expect(names).toContain('save_thinking_to_memo');
    });
  });

  describe('createMemo', () => {
    it('should create a memo and add to local list', async () => {
      const memo = await bridge.createMemo({
        content: 'Test note', visibility: 'PUBLIC', tags: ['test'], pinned: true
      });
      expect(memo.content).toBe('Test note');
      expect(memo.visibility).toBe('PUBLIC');
      expect(memo.tags).toEqual(['test']);
      expect(memo.pinned).toBe(true);
      expect(memo.id).toMatch(/^memo_/);
      expect(memo.instance).toBe('default');
      expect(bridge.localMemos.length).toBe(1);
    });

    it('should return dry-run preview when dry_run param set', async () => {
      const result = await bridge.createMemo({
        content: 'Dry run note', dry_run: true
      });
      expect(result._meta.dryRun).toBe(true);
      expect(result.confirmationNeeded).toBe(true);
      expect(bridge.localMemos.length).toBe(0);
    });

    it('should return dry-run preview when dryRun param set', async () => {
      const result = await bridge.createMemo({
        content: 'Dry run note', dryRun: true
      });
      expect(result._meta.dryRun).toBe(true);
    });

    it('should record to thinking chain when chain_id provided', async () => {
      mockThinkingChain.getCurrentChain.mockReturnValue(null);

      await bridge.createMemo({
        content: 'Chain memo', chain_id: 'chain-123'
      });
      expect(mockThinkingChain.addThought).toHaveBeenCalledWith(
        'chain-123',
        expect.stringContaining('Chain memo'),
        expect.objectContaining({ reasoning: '笔记创建成功' })
      );
    });
  });

  describe('searchMemos', () => {
    beforeEach(async () => {
      await bridge.createMemo({ content: 'Bug fix for login', tags: ['bug'] });
      await bridge.createMemo({ content: 'New feature for dashboard', tags: ['feature'] });
      await bridge.createMemo({ content: 'Update documentation', tags: ['docs'] });
    });

    it('should find memos matching query by content', async () => {
      const result = await bridge.searchMemos({ query: 'bug', limit: 10 });
      expect(result.results.length).toBe(1);
      expect(result.results[0].content).toContain('Bug fix');
    });

    it('should find memos matching query by tags', async () => {
      const result = await bridge.searchMemos({ query: 'feature', limit: 10 });
      expect(result.results.length).toBe(1);
    });

    it('should limit results', async () => {
      const result = await bridge.searchMemos({ query: 'for', limit: 1 });
      expect(result.results.length).toBe(1);
    });

    it('should return count and total in response', async () => {
      const result = await bridge.searchMemos({ query: '', limit: 10 });
      expect(result.count).toBe(3);
      expect(result.total).toBe(3);
    });

    it('should use default limit of 10 when not provided', async () => {
      for (let i = 0; i < 12; i++) {
        await bridge.createMemo({ content: `Memo ${i}`, tags: ['test'] });
      }
      const result = await bridge.searchMemos({ query: 'Memo' });
      expect(result.results.length).toBe(10);
      expect(result.count).toBe(10);
    });
  });

  describe('listMemos', () => {
    beforeEach(async () => {
      await bridge.createMemo({ content: 'Memo 1' });
      await bridge.createMemo({ content: 'Memo 2' });
      await bridge.createMemo({ content: 'Memo 3' });
    });

    it('should return paginated memos', async () => {
      const result = await bridge.listMemos({ limit: 2, offset: 0 });
      expect(result.memos.length).toBe(2);
      expect(result.total).toBe(3);
    });

    it('should respect offset', async () => {
      const result = await bridge.listMemos({ limit: 10, offset: 2 });
      expect(result.memos.length).toBe(1);
    });

    it('should use default limit and offset', async () => {
      const result = await bridge.listMemos({});
      expect(result.memos.length).toBe(3);
      expect(result.offset).toBe(0);
      expect(result.limit).toBe(20);
    });
  });

  describe('getMemo', () => {
    it('should find memo by id', async () => {
      const created = await bridge.createMemo({ content: 'Find me' });
      const found = await bridge.getMemo({ id: created.id });
      expect(found.content).toBe('Find me');
    });

    it('should return error for missing memo', async () => {
      const result = await bridge.getMemo({ id: 'missing' });
      expect(result.error).toBe('Memo not found');
    });
  });

  describe('updateMemo', () => {
    it('should update existing memo fields', async () => {
      const created = await bridge.createMemo({ content: 'Original' });
      const updated = await bridge.updateMemo({ id: created.id, content: 'Updated', pinned: true });
      expect(updated.content).toBe('Updated');
      expect(updated.pinned).toBe(true);
      expect(updated.updatedAt).toBeTruthy();
    });

    it('should return error for missing memo', async () => {
      const result = await bridge.updateMemo({ id: 'missing', content: 'New' });
      expect(result).toEqual({ error: 'Memo not found' });
    });

    it('should return dry-run preview when dry_run param set', async () => {
      const created = await bridge.createMemo({ content: 'Original' });
      const result = await bridge.updateMemo({ id: created.id, content: 'New', dry_run: true });
      expect(result._meta.dryRun).toBe(true);
      expect(result.preview.before.content).toBe('Original');
      expect(result.preview.after.content).toBe('New');
    });

    it('should not update fields that are undefined', async () => {
      const created = await bridge.createMemo({ content: 'Original', visibility: 'PUBLIC' });
      const updated = await bridge.updateMemo({ id: created.id });
      expect(updated.content).toBe('Original');
      expect(updated.visibility).toBe('PUBLIC');
    });

    it('should update visibility when provided', async () => {
      const created = await bridge.createMemo({ content: 'Test' });
      const updated = await bridge.updateMemo({ id: created.id, visibility: 'PRIVATE' });
      expect(updated.visibility).toBe('PRIVATE');
    });
  });

  describe('deleteMemo', () => {
    it('should delete existing memo', async () => {
      const created = await bridge.createMemo({ content: 'Delete me' });
      const result = await bridge.deleteMemo({ id: created.id });
      expect(result.success).toBe(true);
      expect(result.deleted.content).toBe('Delete me');
      expect(bridge.localMemos.length).toBe(0);
    });

    it('should return error for missing memo', async () => {
      const result = await bridge.deleteMemo({ id: 'missing' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Memo not found');
    });

    it('should delegate to dryRunEngine when dry_run param set', async () => {
      const created = await bridge.createMemo({ content: 'Dry delete' });
      mockDryRunEngine.previewDeleteMemo.mockReturnValue({ dryRun: true });
      const result = await bridge.deleteMemo({ id: created.id, dry_run: true });
      expect(mockDryRunEngine.previewDeleteMemo).toHaveBeenCalledWith(created.id, 'Dry delete');
      expect(result).toEqual({ dryRun: true });
    });
  });

  describe('pinMemo', () => {
    it('should pin a memo', async () => {
      const created = await bridge.createMemo({ content: 'Pin me' });
      const result = await bridge.pinMemo({ id: created.id, pinned: true });
      expect(result.success).toBe(true);
      expect(result.memo.pinned).toBe(true);
    });

    it('should unpin a memo', async () => {
      const created = await bridge.createMemo({ content: 'Unpin me', pinned: true });
      const result = await bridge.pinMemo({ id: created.id, pinned: false });
      expect(result.success).toBe(true);
      expect(result.memo.pinned).toBe(false);
    });

    it('should default pinned to true', async () => {
      const created = await bridge.createMemo({ content: 'Pin default' });
      const result = await bridge.pinMemo({ id: created.id });
      expect(result.success).toBe(true);
      expect(result.memo.pinned).toBe(true);
    });

    it('should return error for missing memo', async () => {
      const result = await bridge.pinMemo({ id: 'missing' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Memo not found');
    });
  });

  describe('listTags', () => {
    it('should return unique tags from all memos', async () => {
      await bridge.createMemo({ content: 'A', tags: ['tag1', 'tag2'] });
      await bridge.createMemo({ content: 'B', tags: ['tag2', 'tag3'] });
      const result = await bridge.listTags({});
      expect(result.tags).toEqual(expect.arrayContaining(['tag1', 'tag2', 'tag3']));
      expect(result.count).toBe(3);
    });

    it('should return empty tags when no memos', async () => {
      const result = await bridge.listTags({});
      expect(result.tags).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('should handle memos without tags field', async () => {
      bridge.localMemos.push({ content: 'tagless memo' });
      const result = await bridge.listTags({});
      expect(result.tags).toEqual([]);
      expect(result.count).toBe(0);
    });
  });

  describe('createTag / deleteTag', () => {
    it('should create a tag', async () => {
      const result = await bridge.createTag({ name: 'urgent' });
      expect(result.success).toBe(true);
      expect(result.tag).toBe('urgent');
      expect(result.createdAt).toBeTruthy();
    });

    it('should delete a tag', async () => {
      const result = await bridge.deleteTag({ name: 'old-tag' });
      expect(result.success).toBe(true);
      expect(result.tag).toBe('old-tag');
      expect(result.deletedAt).toBeTruthy();
    });
  });

  describe('autoTag', () => {
    it('should detect bug/fix keywords', async () => {
      const result = await bridge.autoTag({ content: 'Fixed a bug in login' });
      expect(result.suggestedTags).toContain('bug');
    });

    it('should detect feature keyword', async () => {
      const result = await bridge.autoTag({ content: 'New feature for dashboard' });
      expect(result.suggestedTags).toContain('feature');
    });

    it('should detect docs/document keywords', async () => {
      const result = await bridge.autoTag({ content: 'Update documentation' });
      expect(result.suggestedTags).toContain('docs');
    });

    it('should detect test keyword', async () => {
      const result = await bridge.autoTag({ content: 'Add unit test' });
      expect(result.suggestedTags).toContain('testing');
    });

    it('should detect refactor keyword', async () => {
      const result = await bridge.autoTag({ content: 'Refactor auth module' });
      expect(result.suggestedTags).toContain('refactor');
    });

    it('should return low confidence when no keywords match', async () => {
      const result = await bridge.autoTag({ content: 'Random note content' });
      expect(result.suggestedTags).toEqual([]);
      expect(result.confidence).toBe('low');
    });

    it('should return medium confidence when keywords match', async () => {
      const result = await bridge.autoTag({ content: 'Bug in feature' });
      expect(result.suggestedTags.length).toBeGreaterThan(0);
      expect(result.confidence).toBe('medium');
    });

    it('should truncate content to 100 chars', async () => {
      const long = 'a'.repeat(200);
      const result = await bridge.autoTag({ content: long });
      expect(result.content.length).toBe(100);
    });
  });

  describe('connectInstance', () => {
    it('should connect and set as current', async () => {
      const result = await bridge.connectInstance({ name: 'work', url: 'http://work:5230', token: 'xyz' });
      expect(result.success).toBe(true);
      expect(result.instance).toBe('work');
      expect(bridge.currentInstance).toBe('work');
      expect(bridge.instances.has('work')).toBe(true);
    });
  });

  describe('switchInstance', () => {
    it('should switch to existing instance', async () => {
      await bridge.connectInstance({ name: 'work', url: 'http://work:5230', token: 'xyz' });
      await bridge.connectInstance({ name: 'personal', url: 'http://personal:5230', token: 'abc' });

      const result = await bridge.switchInstance({ name: 'work' });
      expect(result.success).toBe(true);
      expect(result.instance).toBe('work');
      expect(bridge.currentInstance).toBe('work');
    });

    it('should return error for non-existent instance', async () => {
      const result = await bridge.switchInstance({ name: 'ghost' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Instance not found');
    });
  });

  describe('listInstances', () => {
    it('should list all connected instances', async () => {
      await bridge.connectInstance({ name: 'a', url: 'http://a:5230', token: 't1' });
      await bridge.connectInstance({ name: 'b', url: 'http://b:5230', token: 't2' });

      const result = await bridge.listInstances({});
      expect(result.instances.length).toBe(2);
      expect(result.current).toBe('b');
    });

    it('should return empty list when no instances', async () => {
      const result = await bridge.listInstances({});
      expect(result.instances).toEqual([]);
    });
  });

  describe('listShortcuts', () => {
    it('should return empty shortcuts list', async () => {
      const result = await bridge.listShortcuts({});
      expect(result.shortcuts).toEqual([]);
      expect(result.count).toBe(0);
    });
  });

  describe('uploadAttachment', () => {
    it('should return attachment metadata', async () => {
      const result = await bridge.uploadAttachment({ file: 'screenshot.png', memo_id: 'memo_123' });
      expect(result.success).toBe(true);
      expect(result.attachmentId).toMatch(/^attach_/);
      expect(result.memoId).toBe('memo_123');
      expect(result.filename).toBe('screenshot.png');
    });
  });

  describe('saveThinkingToMemo', () => {
    it('should save chain to memo when chain exists', async () => {
      const mockChain = { id: 'chain-1', serialized: 'Step 1\nStep 2', thoughts: ['t1', 't2'] };
      mockThinkingChain.getChain.mockReturnValue(mockChain);

      const result = await bridge.saveThinkingToMemo({ chain_id: 'chain-1' });
      expect(result.success).toBe(true);
      expect(result.chainId).toBe('chain-1');
      expect(result.steps).toBe(2);
      expect(bridge.localMemos.length).toBe(1);
      expect(bridge.localMemos[0].tags).toContain('thinking-chain');
    });

    it('should return error when chain not found', async () => {
      mockThinkingChain.getChain.mockReturnValue(null);
      const result = await bridge.saveThinkingToMemo({ chain_id: 'ghost' });
      expect(result.error).toBe('Thinking chain not found');
    });

    it('should use default instance when no chain_id provided', async () => {
      const mockChain = { id: 'default', serialized: 'Step', thoughts: ['t1'] };
      mockThinkingChain.getChain.mockReturnValue(mockChain);

      const result = await bridge.saveThinkingToMemo({});
      expect(result.success).toBe(true);
      expect(mockThinkingChain.getChain).toHaveBeenCalledWith('default');
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      const result = await bridge.healthCheck();
      expect(result.status).toBe('healthy');
      expect(result.instance).toBe('default');
      expect(result.memos).toBe(0);
      expect(result.connected).toBe(true);
    });

    it('should reflect current memo count', async () => {
      await bridge.createMemo({ content: 'One' });
      await bridge.createMemo({ content: 'Two' });
      const result = await bridge.healthCheck();
      expect(result.memos).toBe(2);
    });
  });
});
