/**
 * 全栈集成测试：chat → 真实 _executeToolCalls → 真实 DocxExecutor → 真实文件
 * crown-jewel 功能回归锁（Rounds 71-77: 自主文档生成 + 路径穿越防御）
 */

process.env.NODE_ENV = 'test';
const os = require('os');
const fs = require('fs');
const path = require('path');

describe('Full-stack autonomous document generation', () => {
  const origCwd = process.cwd();
  let tmpCwd;

  beforeEach(() => {
    tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-fullstack-'));
    process.chdir(tmpCwd);
    jest.resetModules();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    process.chdir(origCwd);
    try { fs.rmSync(tmpCwd, { recursive: true, force: true }); } catch (e) { /* */ }
    // 清理 BrainSystem 共享实例定时器（_buildSysPrompt → forceThink → _getSharedInstance）
    try {
      const { BrainSystem } = require('../../src/core/BrainSystem');
      const inst = BrainSystem._sharedInstance;
      if (inst) {
        if (inst.selfCheckInterval) { clearInterval(inst.selfCheckInterval); inst.selfCheckInterval = null; }
        if (inst.monitoringInterval) { clearInterval(inst.monitoringInterval); inst.monitoringInterval = null; }
      }
    } catch (e) { /* */ }
  });

  it('chat → real _executeToolCalls → real DocxExecutor → real file', async () => {
    // 真实 BrainSystem 初始化 + 真实 docx 生成较慢，全量并行下会超默认 5s（同 Round 96 xlsx 修复）
    jest.setTimeout(20000);
    const chatService = require('../../server/services/chatService');
    // mock bridge 返回 generate_document tool_call，让循环执行真实工具
    const mockBridge = {
      chat: jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          text: '',
          tool_calls: [{ function: { name: 'generate_document', arguments: { type: 'docx', title: '集成测试文档' } } }]
        })
        .mockResolvedValueOnce({ ok: true, text: '已生成 Word 文档' })
    };
    chatService.ollamaBridge = mockBridge;
    // 禁用 MCP（防 spawn 真实进程）
    chatService._mcpTried = true;

    const conv = { personality: 'default', messages: [{ role: 'user', content: '生成文档' }], context: {} };
    const r = await chatService.generateResponse('帮我生成一份 Word 文档', conv);

    expect(r.text).toBe('已生成 Word 文档');
    expect(r.toolResults).toBeDefined();
    expect(r.toolResults.length).toBeGreaterThan(0);
    expect(r.toolResults[0].ok).toBe(true);
    expect(r.toolResults[0].tool).toBe('generate_document');
    expect(r.toolResults[0].result.type).toBe('docx');
  });

  it('generates a real .docx file on disk via real executors', async () => {
    const { AsyncExecutor } = require('../../src/skills/agent/AsyncExecutor');
    const executor = new AsyncExecutor();
    const execution = await executor.execute('docx', { action: 'create', title: '磁盘文件测试', content: '正文' });
    const finalResult = await executor.waitForCompletion(execution.executionId, { timeout: 30000 });
    executor.destroy();

    expect(finalResult).toBeDefined();
    expect(finalResult.placeholder).toBeUndefined(); // 真实执行，非 placeholder
    // 文件真实存在于 uploads/skills/docx/（相对 tmpCwd）
    const files = fs.readdirSync(path.join(tmpCwd, 'uploads', 'skills', 'docx'));
    expect(files.length).toBeGreaterThan(0);
    const docxFile = files.find((f) => f.endsWith('.docx'));
    expect(docxFile).toBeDefined();
    expect(fs.statSync(path.join(tmpCwd, 'uploads', 'skills', 'docx', docxFile)).size).toBeGreaterThan(100);
  });

  it('path-traversal skillName is rejected by whitelist (no file escapes uploads)', async () => {
    const { AsyncExecutor } = require('../../src/skills/agent/AsyncExecutor');
    const executor = new AsyncExecutor();
    const execution = await executor.execute('docx', { action: 'create', title: '安全测试', skill: { name: '../../evil' } });
    await executor.waitForCompletion(execution.executionId, { timeout: 30000 });
    executor.destroy();

    // 文件应写回 uploads/skills/docx/（白名单强制覆盖），而非逃逸到 tmpCwd/evil
    expect(fs.existsSync(path.join(tmpCwd, 'evil'))).toBe(false);
    const files = fs.readdirSync(path.join(tmpCwd, 'uploads', 'skills', 'docx'));
    expect(files.length).toBeGreaterThan(0);
  });
});