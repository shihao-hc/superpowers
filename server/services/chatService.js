/**
 * UltraWork AI 聊天服务
 */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const _config = require('../config');

// 集成 Claude Code 风格的上下文压缩服务
const { ContextCompactService } = require('../../src/agent/ContextCompactService');

// 会话持久化文件（server 重启后恢复多轮上下文）
const CONVERSATIONS_FILE = path.join(process.cwd(), 'data', 'conversations.json');

class ChatService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.conversations = new Map();
    this.messageQueue = [];
    this._loadConversations();
    this.stats = {
      totalMessages: 0,
      totalLatency: 0,
      errors: 0,
      llm: { attempts: 0, successes: 0, fallbacks: 0 },
      tokens: { prompt: 0, completion: 0, total: 0, requests: 0 },
      tools: {
        calls: 0,
        success: 0,
        failed: 0,
        filesGenerated: 0,
        byType: {}
      }
    };

    // LLM 推理（Ollama）— 可注入 mock，默认惰性创建
    this.ollamaBridge = options.ollamaBridge || null;
    this._ollamaTried = false;

    // 真实上下文窗口（与 OllamaBridge 的 num_ctx 对齐）：压缩预算必须等于模型真实能力，
    // 否则压缩永远不触发、模型静默截断（此前 100K 预算 vs ~2K 真实上下文是核心质量缺陷）
    this.contextLength = parseInt(process.env.OLLAMA_NUM_CTX, 10) || 8192;

    // 初始化上下文压缩服务（预算 = 真实 num_ctx，预留输出 + 安全余量）
    this.contextCompact = new ContextCompactService({
      maxTokens: this.contextLength,
      bufferTokens: Math.max(512, Math.round(this.contextLength * 0.1)),
      warningThreshold: Math.max(1024, Math.round(this.contextLength * 0.2)),
      preserveRecentMessages: 10,
      autoCompactEnabled: true
    });
  }

  /**
   * 获取或惰性创建 Ollama bridge
   */
  _getOllamaBridge() {
    if (this.ollamaBridge) {return this.ollamaBridge;}
    // 不在首次失败后永久禁用 — 每次请求重试（Ollama 重启等瞬时故障不应永久降级）
    this._ollamaTried = true;
    try {
      const { OllamaBridge } = require('../../src/localInferencing/OllamaBridge');
      this.ollamaBridge = new OllamaBridge();
      return this.ollamaBridge;
    } catch (e) { /* Ollama 不可用时回退话术 */ }
    return null;
  }

  /**
   * 获取或惰性创建 MCP plugin（供 LLM 自主调用 MCP 只读工具）
   */
  _getMCPPlugin() {
    if (this._mcpPlugin) {return this._mcpPlugin;}
    if (this._mcpTried) {return null;} // 一次失败后不再重试（进程级）
    this._mcpTried = true;
    try {
      const path = require('path');
      const { MCPPlugin } = require('../../src/mcp/MCPPlugin');
      const plugin = new MCPPlugin({ configPath: path.join(process.cwd(), 'config', 'mcp-servers.json') });
      this._mcpPlugin = plugin;
      return plugin;
    } catch (e) { /* MCP 不可用，仅 generate_document 技能 */ }
    return null;
  }

  /**
   * Ollama 调用带重试（瞬时故障自动恢复）
   */
  async _chatWithRetry(bridge, sysPrompt, history, options = {}) {
    const { RetryHandler } = require('../../src/utils/UltraWorkUtils');
    const messages = [
      { role: 'system', content: sysPrompt },
      ...history
    ];
    const result = await RetryHandler.retry(
      () => bridge.chat(messages, { temperature: 0.7, tools: options.tools }),
      { maxAttempts: 3, delay: 500, backoff: 2 }
    );
    if (result && result.ok) {
      this._recordTokenUsage(result);
    }
    return result;
  }

  /**
   * 真实 token 账本：用 Ollama 返回的 prompt_eval_count/eval_count 记账（非估算）
   * 同时在 prompt 逼近 num_ctx 时预警（静默截断 = 质量风险）
   */
  _recordTokenUsage(result) {
    if (!result || typeof result !== 'object') { return; }
    const prompt = Number(result.promptEvalCount);
    const completion = Number(result.evalCount);
    if (Number.isFinite(prompt) && prompt > 0) { this.stats.tokens.prompt += prompt; }
    if (Number.isFinite(completion) && completion > 0) { this.stats.tokens.completion += completion; }
    if ((Number.isFinite(prompt) && prompt > 0) || (Number.isFinite(completion) && completion > 0)) {
      this.stats.tokens.requests++;
    }
    this.stats.tokens.total = this.stats.tokens.prompt + this.stats.tokens.completion;
    if (Number.isFinite(prompt) && prompt > 0 && this.contextLength > 0) {
      const utilization = prompt / this.contextLength;
      if (utilization > 0.8) {
        console.warn(`[chatService] 上下文利用率 ${(utilization * 100).toFixed(1)}%（${prompt}/${this.contextLength} tokens）接近上限，可能发生静默截断（质量风险）`);
      }
    }
  }

  /**
   * 规则解析文档生成请求（确定性兜底，不依赖 LLM tool_calls）
   */
  _ruleBasedDocumentCall(text) {
    const t = String(text || '');
    // 解析标题：引号内或"标题为/标题：/名为"后
    const titleMatch = t.match(/["“”]([^"“”']{1,50})["“”'']/) ||
      t.match(/标题[为是：:\s]+([^，。,.]{1,30})/) ||
      t.match(/名为[：:\s]*([^，。,.]{1,30})/);
    const title = titleMatch ? titleMatch[1].trim() : '未命名文档';
    // 解析类型
    let type = 'docx';
    if (/pdf/i.test(t)) { type = 'pdf'; }
    else if (/图形|海报|图片|图标|chart|canvas/i.test(t)) { type = 'canvas-design'; }
    else if (/excel|xlsx|电子表格|工作表/i.test(t)) { type = 'xlsx'; }
    else if (/word|docx|文档|报告|周报/i.test(t)) { type = 'docx'; }
    // 若只是问"能生成吗"而非明确请求，不触发
    if (/能(否|不能|可以)?生成|是否|怎么生成|如何生成/.test(t) && !/帮我|请|给我|帮我生成|请生成/.test(t)) {
      return null;
    }
    return { name: 'generate_document', arguments: { type, title } };
  }

  /**
   * 描述工具执行结果（供兜底回复）
   */
  _describeToolResult(toolResults) {
    const r = (toolResults || [])[0];
    if (!r) { return '我尝试生成文档，但没有成功。'; }
    if (r.ok) {
      return `我已为你生成${r.result && r.result.type ? r.result.type.toUpperCase() : '文档'}：${r.result && r.result.message ? r.result.message : '已生成'}${r.result && r.result.path ? `（${r.result.path}）` : ''}`;
    }
    return `生成文档时遇到问题：${r.error || '未知错误'}`;
  }

  /**
   * 工具调用 schema（供 LLM 自主调用技能）
   */
  async _buildToolsSchema() {
    const tools = [
      {
        type: 'function',
        function: {
          name: 'generate_document',
          description: '生成 Office 文档（Word/PDF/Excel/Canvas 图形）。当用户要求创建/生成文档、报告、表格、Excel 表格、图形时使用。',
          parameters: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['docx', 'pdf', 'xlsx', 'canvas-design'], description: '文档类型' },
              title: { type: 'string', description: '文档标题' },
              content: { type: 'string', description: '文档内容或描述' },
              action: { type: 'string', enum: ['create', 'createWithData'], description: '操作，默认 create' }
            },
            required: ['type']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'scrape_web',
          description: '爬取公开网页内容（含 SSRF 防护，仅允许公开 http/https URL）。当用户要求抓取网页、爬取网站数据、获取网页内容时使用。',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: '要爬取的公开网页 URL' }
            },
            required: ['url']
          }
        }
      }
    ];

    // 追加 MCP 只读工具（读写分离：写操作不暴露给 LLM，门禁仅作深度防御）
    try {
      const plugin = this._getMCPPlugin();
      if (plugin) {
        try {
          if (plugin.status !== 'loaded' && plugin.status !== 'ready' && typeof plugin.onLoad === 'function') {
            await Promise.race([
              plugin.onLoad(),
              new Promise((_, rej) => setTimeout(() => rej(new Error('MCP init timeout')), 5000))
            ]);
          }
        } catch (e) { /* MCP 初始化失败/超时，仅 generate_document */ }
        if (typeof plugin.getAvailableTools === 'function') {
          const readOnlyAllowlist = [
            'filesystem:read_file', 'filesystem:read_text_file', 'filesystem:read_media_file',
            'filesystem:list_directory', 'filesystem:directory_tree', 'filesystem:search_files',
            'filesystem:get_file_info', 'filesystem:list_allowed_directories',
            'sequential-thinking:sequentialthinking'
          ];
          const available = plugin.getAvailableTools({ includeSchema: true }) || [];
          for (const t of available) {
            if (readOnlyAllowlist.includes(t.name)) {
              tools.push({
                type: 'function',
                function: {
                  name: t.name,
                  description: t.description || t.name,
                  parameters: t.parameters || { type: 'object', properties: {} }
                }
              });
            }
          }
        }
      }
    } catch (e) { /* MCP 工具可选，仅 generate_document */ }

    return tools;
  }

  /**
   * 执行 LLM 请求的工具调用（白名单 + 真实技能执行）
   */
  async _executeToolCalls(toolCalls) {
    const results = [];
    for (const call of (toolCalls || [])) {
      const fn = call.function || call;
      const name = fn.name || '';
      const args = (typeof fn.arguments === 'string' ? (() => { try { return JSON.parse(fn.arguments); } catch { return {}; } })() : fn.arguments) || {};
      let executor = null;
      try {
        if (name.includes(':') && name !== 'generate_document') {
          // MCP 工具调用（只读白名单已在 schema 层限制，此处再校验防直接注入）
          const readOnlyAllowlist = [
            'filesystem:read_file', 'filesystem:read_text_file', 'filesystem:read_media_file',
            'filesystem:list_directory', 'filesystem:directory_tree', 'filesystem:search_files',
            'filesystem:get_file_info', 'filesystem:list_allowed_directories',
            'sequential-thinking:sequentialthinking'
          ];
          if (!readOnlyAllowlist.includes(name)) {
            results.push({ tool: name, ok: false, error: `Tool '${name}' is not allowed for autonomous use` });
            continue;
          }
          const plugin = this._getMCPPlugin();
          if (!plugin || typeof plugin.executeTool !== 'function') {
            results.push({ tool: name, ok: false, error: 'MCP plugin not available' });
            continue;
          }
          const mcpResult = await plugin.executeTool(name, args);
          results.push({
            tool: name,
            ok: true,
            result: { type: 'mcp', tool: name, output: mcpResult }
          });
          continue;
        }
        if (name === 'generate_document') {
          const skillName = args.type || 'docx';
          if (process.env.NODE_ENV === 'test' && process.env.DEBUG_TOOLS === '1') {
            console.log('[_executeToolCalls] executing:', skillName, JSON.stringify(args).slice(0, 80));
          }
          const { AsyncExecutor } = require('../../src/skills/agent/AsyncExecutor');
          executor = new AsyncExecutor();
          const execution = await executor.execute(skillName, {
            action: args.action || 'create',
            title: args.title || args.content || '',
            content: args.content || ''
          });
          const finalResult = await executor.waitForCompletion(execution.executionId, { timeout: 30000 });
          // 提取文件路径（兼容 result 包装或直接返回）
          const filePath = (finalResult && finalResult.result && finalResult.result.path) ||
            (finalResult && finalResult.path) ||
            null;
          // placeholder 非真实执行 → 诚实失败
          const placeholder = finalResult ? finalResult.placeholder : false;
          if (placeholder) {
            results.push({ tool: name, ok: false, error: `Skill '${skillName}' has no real executor (placeholder)` });
          } else {
            results.push({
              tool: name,
              ok: true,
              result: {
                type: skillName,
                message: filePath ? `已生成到 ${filePath}` : 'generated',
                path: filePath
              }
            });
          }
        } else if (name === 'scrape_web') {
          const { AsyncExecutor } = require('../../src/skills/agent/AsyncExecutor');
          executor = new AsyncExecutor();
          const execution = await executor.execute('dynamic-scraper', { url: args.url });
          const finalResult = await executor.waitForCompletion(execution.executionId, { timeout: 60000 });
          const r = (finalResult && finalResult.result) || {};
          if (finalResult && finalResult.error) {
            results.push({ tool: name, ok: false, error: finalResult.error });
          } else if (r.error) {
            results.push({ tool: name, ok: false, error: r.error });
          } else {
            results.push({ tool: name, ok: true, result: { type: 'scrape', url: args.url, data: r.data } });
          }
        } else {
          results.push({ tool: name, ok: false, error: `Unknown tool: ${name}` });
        }
      } catch (e) {
        results.push({ tool: name, ok: false, error: e.message });
      } finally {
        // 清理 AsyncExecutor 定时器（防泄漏）
        if (executor && typeof executor.destroy === 'function') {
          executor.destroy();
        }
      }
    }
    if (process.env.DEBUG_TOOLS === '1') {
      console.log('[_executeToolCalls] results:', JSON.stringify(results).slice(0, 200));
    }
    // 工具调用统计（可观测性）
    for (const r of results) {
      this.stats.tools.calls++;
      if (r.ok === true) {
        this.stats.tools.success++;
        if (r.result && r.result.type) {
          this.stats.tools.byType[r.result.type] = (this.stats.tools.byType[r.result.type] || 0) + 1;
        }
        if (r.result && r.result.path) {
          this.stats.tools.filesGenerated++;
        }
      } else {
        this.stats.tools.failed++;
      }
    }
    return results;
  }

  /**
   * 构建动态 system prompt（记忆 + 教训 + 思考注入 + 工具提示）
   * @returns {{sysPrompt: string, toolTrigger: boolean}}
   */
  async _buildSysPrompt(text, conversation, userId) {
    const personality = (conversation && conversation.personality) || 'default';
    const lastIntent = conversation && conversation.context ? conversation.context.lastIntent : null;
    let memoryText = '';
    try {
      const { BrainSystem } = require('../../src/core/BrainSystem');
      let mem = [];
      if (BrainSystem.smartSearchSemantic) {
        mem = (await BrainSystem.smartSearchSemantic(text, 3, userId)) || [];
      }
      if (mem.length === 0 && BrainSystem.smartSearch) {
        mem = BrainSystem.smartSearch(text, 3, userId);
      }
      if (mem.length > 0) {
        // 提取可读内容（value.input 优先），避免把含 userId 的原始 JSON 塞进 prompt（不友好 + 隐私）
        let memBody = mem.map((m) => {
          if (typeof m.value === 'string') { return m.value; }
          if (m.value && typeof m.value.input === 'string') { return m.value.input; }
          return JSON.stringify(m.value);
        }).join('；');
        // 安全阀：限长防止超长记忆撑爆上下文（正常 3 条记忆远小于上限，不触发）
        if (memBody.length > 600) { memBody = `${memBody.slice(0, 600)}…`; }
        memoryText = `你记得与该用户相关的信息：${memBody}。`;
      }
    } catch (e) { /* 记忆可选，失败静默 */ }
    let lessonText = '';
    try {
      const LessonLibrary = require('../../src/core/LessonLibrary');
      const lib = new LessonLibrary({ quiet: true });
      const lessons = lib.search ? lib.search(text, { limit: 3 }) : [];
      if (Array.isArray(lessons) && lessons.length > 0) {
        // 安全阀：限长（每条已截 60 字符，此处再限总长，防极端情况）
        let lessonBody = lessons.map((l) => (l.lesson || l.problem || '').substring(0, 60)).filter(Boolean).join('；');
        if (lessonBody.length > 300) { lessonBody = `${lessonBody.slice(0, 300)}…`; }
        lessonText = `参考经验教训：${lessonBody}。`;
      }
    } catch (e) { /* 教训可选，失败静默 */ }
    // 注意：不再注入 thinkText（forceThink 元认知提问）。A/B/C 实测（2026-09-16）:
    // 对 llama3.2 这类弱模型，"回答前请先思考：…？" 会被误认为用户输入（真实出现
    // "我看到你发送的两个question符号"），且干扰技能遵循（场景2 去 thinkText 后质量更高）。
    // forceThink 本身保留（BrainSystem 内部能力），仅不注入用户 prompt。
    // 技能指导注入：识别任务领域 → 注入相关 SKILL.md（让 LLM 按技能指令行动，发挥 305 技能价值）
    const skillText = this._buildSkillGuidance(text, conversation);
    const toolTrigger = /生成|创建|制作|设计|文档|报告|表格|图形|word|pdf|docx|周报|ppt|海报|图片|图标|读取|搜索|查看|列出|目录|文件|思维|分析文件|sequential/i.test(text);
    const toolPrompt = toolTrigger ? '当用户要求生成文档/报告/表格/图形时，调用 generate_document 工具（type 可选 docx/pdf/canvas-design，title 为标题）。当用户要求读取文件/目录、搜索文件、查看文件信息时，调用 filesystem:* 只读工具（如 filesystem:read_file, filesystem:list_directory, filesystem:search_files）。当需要深度思考时可用 sequential-thinking:sequentialthinking。调用工具后根据结果回复用户。' : '';
    const sysPrompt = `你是一个乐于助人的中文 AI 助手，回答简洁友好。你当前的人格是「${personality}」。${lastIntent && lastIntent.intent ? `用户最近的意图是「${lastIntent.intent}」。` : ''}${memoryText}${lessonText}${skillText}${toolPrompt}`;
    return { sysPrompt, toolTrigger };
  }

  /**
   * 技能指导注入：识别任务领域 → 匹配技能 → 注入相关 SKILL.md（让 LLM 按技能指令行动）
   * 非侵入式：无匹配/失败 → 返回空，不影响对话
   * 无损去重：同一会话内同一技能只完整注入一次，后续用极简引用（省重复开销，质量不变）
   */
  _buildSkillGuidance(text, conversation) {
    try {
      const t = String(text || '').trim();
      // 空/极短文本不注入（避免 SkillRecognizer 对空输入的兜底匹配注入无关技能）
      if (t.length < 2) { return ''; }
      if (!this._skillRecognizer) {
        const SkillRecognizer = require('../../src/core/SkillRecognizer');
        this._skillRecognizer = new SkillRecognizer();
      }
      const matches = this._skillRecognizer.recognize(t, { topN: 1 });
      if (matches && matches.length > 0 && matches[0].score >= 0.5) {
        const skill = matches[0].skill;
        // 同会话同技能：完整 essence 已注入过 → 只给极简引用（LLM 可从对话历史延续）
        if (conversation && conversation.context && conversation.context.lastInjectedSkill === skill.name) {
          return `\n任务领域「${skill.name}」：请继续沿用上文的技能方法，直接回答。`;
        }
        // 自定义代码模块（如爬虫系统）→ 注入能力描述（告知 LLM 系统具备该能力）
        if (skill.isCustomModule) {
          this._markSkillInjected(conversation, skill.name);
          return `\n系统具备相关能力「${skill.name}」：${skill.description || skill.type || ''}。`;
        }
        const skMd = path.join(process.cwd(), '.opencode', 'skills', skill.name, 'SKILL.md');
        if (fs.existsSync(skMd)) {
          // 缓存技能内容（避免每消息读盘同步 IO）
          if (!this._skillEssenceCache) { this._skillEssenceCache = new Map(); }
          if (!this._skillEssenceCache.has(skill.name)) {
            const body = fs.readFileSync(skMd, 'utf8').replace(/^---[\s\S]*?---/, '').trim();
            const essence = this._extractSkillEssence(body);
            this._skillEssenceCache.set(skill.name, { body, essence });
          }
          const cached = this._skillEssenceCache.get(skill.name);
          this._markSkillInjected(conversation, skill.name);
          if (cached.essence) {
            return `\n任务领域「${skill.name}」的技能方法论（请遵循）：\n${cached.essence}`;
          }
          return `\n任务领域「${skill.name}」的技能指导（请参考并遵循）：\n${cached.body.slice(0, 800)}`;
        }
      }
      return '';
    } catch (e) {
      if (process.env.DEBUG_SKILL === '1') { console.error('[skill injection error]', e.message); }
      return '';
    }
  }

  /**
   * 记录会话已注入的技能（供同会话去重）
   */
  _markSkillInjected(conversation, skillName) {
    if (!conversation) { return; }
    if (!conversation.context) { conversation.context = {}; }
    conversation.context.lastInjectedSkill = skillName;
  }

  /**
   * 从 SKILL.md 提取结构化骨架（章节标题/步骤/要点，跳过代码块），供注入
   */
  _extractSkillEssence(body) {
    const lines = String(body || '').split('\n');
    const out = [];
    let inCode = false;
    let topSections = 0; // 主章节计数（## 级别）
    for (const line of lines) {
      if (line.trim().startsWith('```')) { inCode = !inCode; continue; }
      if (inCode) { continue; }
      const t = line.trim();
      if (/^##\s/.test(t)) {
        topSections++;
        if (topSections > 3) { break; } // 只取前 3 个主章节（核心内容），跳过尾部元数据（更新日志等）
        out.push(`【${t.replace(/^##\s*/, '').replace(/[#*`]/g, '').trim()}】`);
      } else if (/^###\s/.test(t) && topSections <= 3) {
        out.push(`· ${t.replace(/^###\s*/, '').replace(/[#*`]/g, '').trim().slice(0, 60)}`);
      } else if (/^\d+[.、)]\s/.test(t) && topSections <= 3) {
        out.push(t.replace(/^(\d+)[.、)]\s*/, '$1. ').slice(0, 90));
      } else if (/^[-*]\s/.test(t) && topSections <= 3) {
        out.push(`  - ${t.replace(/^[-*]\s*/, '').slice(0, 80)}`);
      }
      if (out.length >= 15) { break; }
    }
    return out.join('\n');
  }

  /**
   * 处理消息
   */
  async processMessage({ text, personality, context, userId }) {
    const startTime = Date.now();

    try {
      // 获取或创建会话
      let conversation = this.conversations.get(userId);
      if (!conversation) {
        conversation = {
          id: userId,
          messages: [],
          personality: personality || 'default',
          context: context || {},
          createdAt: new Date(),
          lastActivity: new Date()
        };
        this.conversations.set(userId, conversation);
      }

      // 更新会话
      conversation.personality = personality || conversation.personality;
      conversation.context = { ...conversation.context, ...context };
      conversation.lastActivity = new Date();

      // 添加用户消息
      const userMessage = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        role: 'user',
        content: text,
        timestamp: new Date()
      };

      conversation.messages.push(userMessage);

      // BrainSystem 感知：意图分析 + 记忆存储（非侵入式，失败不影响对话）
      try {
        const { BrainSystem } = require('../../src/core/BrainSystem');
        if (BrainSystem.analyzeIntent) {
          const intent = BrainSystem.analyzeIntent(text);
          conversation.context = { ...conversation.context, lastIntent: intent };
        }
        if (BrainSystem.smartStore && userId && userId !== 'anonymous') {
          BrainSystem.smartStore(`chat_${userId}_${Date.now()}`, { input: text, role: 'user', userId });
        }
        const hooks = require('../../src/hooks');
        if (hooks && hooks.HookEvents && hooks.triggerHook) {
          await hooks.triggerHook(hooks.HookEvents.MESSAGE_RECEIVE, { text, userId, conversation: conversation.id });
        }
      } catch (e) { /* BrainSystem 可选，失败静默 */ }

      // 学习闭环：检测用户纠正 → 学习教训（让学习在真实对话中运转，非侵入式）
      try {
        const lastReply = conversation.messages.filter((m) => m.role === 'assistant').slice(-1)[0];
        const LessonLearner = require('../../src/core/LessonLearner');
        const learner = new LessonLearner();
        const pending = learner.recordFeedback({ feedback: text, previousReply: lastReply ? lastReply.content : '' });
        if (pending) {
          learner.autoApproveSafeLessons(); // 低风险教训自动生效（security 保持人工）
        }
      } catch (e) { /* 学习可选，失败静默 */ }

      // Claude Code 风格的上下文压缩
      this.contextCompact.addMessage(userMessage);

      // 检查是否需要压缩（非侵入式：压缩失败不影响对话）
      if (this.contextCompact.shouldCompact()) {
        try {
          const compacted = await this.contextCompact.compact();
          if (compacted && compacted.success) {
            // 从 ContextCompactService 取压缩后的消息（compact 内部更新了 this.messages）
            const compactedMessages = this.contextCompact.messages || [];
            if (Array.isArray(compactedMessages) && compactedMessages.length > 0) {
              conversation.messages = compactedMessages.map((m) => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.content || '',
                timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
              }));
            }
          }
          this.emit('context:compacted', { userId, compacted });
        } catch (e) { /* 压缩失败静默，不影响对话 */ }
      }

      // 生成回复
      const response = await this.generateResponse(text, conversation, userId);

      // 添加助手回复
      const assistantMessage = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        role: 'assistant',
        content: response.text,
        personality: conversation.personality,
        timestamp: new Date(),
        latency: Date.now() - startTime
      };

      conversation.messages.push(assistantMessage);
      conversation.lastActivity = new Date();

      // 持久化会话（server 重启后恢复多轮上下文）
      this._saveConversations();

      // BrainSystem 记忆：存储交互 + 发送钩子（非侵入式）
      try {
        const { BrainSystem } = require('../../src/core/BrainSystem');
        if (BrainSystem.smartStore && userId && userId !== 'anonymous') {
          BrainSystem.smartStore(`chat_reply_${userId}_${Date.now()}`, { input: text, output: response.text, userId });
        }
        const hooks = require('../../src/hooks');
        if (hooks && hooks.HookEvents && hooks.triggerHook) {
          await hooks.triggerHook(hooks.HookEvents.MESSAGE_SEND, { text: response.text, input: text, userId, conversation: conversation.id });
        }
      } catch (e) { /* BrainSystem 可选，失败静默 */ }

      // 限制会话长度
      if (conversation.messages.length > 100) {
        conversation.messages = conversation.messages.slice(-50);
      }

      // 更新统计
      this.stats.totalMessages++;
      this.stats.totalLatency += (Date.now() - startTime);

      // 发出事件
      this.emit('message:processed', {
        userId,
        messageId: assistantMessage.id,
        latency: Date.now() - startTime
      });

      return {
        id: assistantMessage.id,
        text: response.text,
        source: response.source,
        toolResults: response.toolResults,
        ruleBased: response.ruleBased,
        personality: conversation.personality,
        timestamp: assistantMessage.timestamp,
        metadata: {
          latency: Date.now() - startTime,
          conversationLength: conversation.messages.length
        }
      };
    } catch (error) {
      this.stats.errors++;
      this.emit('message:error', { userId, error });
      throw error;
    }
  }

  /**
   * 生成回复
   */
  async generateResponse(text, conversation, userId) {
    // 重置工具结果（防跨请求残留泄漏到其他用户）
    this._lastToolResults = null;
    // 优先使用 Ollama 真实推理（非侵入式，失败回退话术）
    try {
      const bridge = this._getOllamaBridge();
      if (bridge) {
        const history = (conversation.messages || []).slice(-6).map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        }));
        // 动态 system prompt：融入人格 + 意图 + 记忆 + 教训 + 思考 + 工具提示
        const { sysPrompt, toolTrigger } = await this._buildSysPrompt(text, conversation, userId);
        const toolSchema = toolTrigger ? await this._buildToolsSchema() : undefined;
        let result = await this._chatWithRetry(bridge, sysPrompt, history, { tools: toolSchema });
        this.stats.llm.attempts++;
        // LLM 成功但返回空文本 → 重试一次（带强化指令），避免静默降级到 canned 话术（质量）
        if (result && result.ok && !result.text &&
            !(Array.isArray(result.tool_calls) && result.tool_calls.length > 0)) {
          result = await this._chatWithRetry(bridge, `${sysPrompt} 请直接给出完整回答，不要输出空内容。`, history, { tools: toolSchema });
          this.stats.llm.attempts++;
        }
        // 确定性兜底：用户明确请求生成文档但 LLM 未触发工具 → 规则解析直接执行（不依赖模型 tool_calls 质量）
        if (toolTrigger && result && result.ok && Array.isArray(result.tool_calls) && result.tool_calls.length === 0) {
          const ruleBased = this._ruleBasedDocumentCall(text);
          if (ruleBased) {
            const toolResults = await this._executeToolCalls([{ function: ruleBased }]);
            return { text: this._describeToolResult(toolResults), confidence: 0.8, source: 'ollama', toolResults, ruleBased: true };
          }
        }
        if (result && result.ok && result.text) {
          this.stats.llm.successes++;
          return { text: result.text, confidence: 0.9, source: 'ollama' };
        }
        // 重试后仍空（且无工具调用）→ 诚实告知空回复，不伪装为"AI 服务不可用"（Round 98 诚实原则）
        if (result && result.ok && !result.text &&
            !(Array.isArray(result.tool_calls) && result.tool_calls.length > 0)) {
          this.stats.llm.fallbacks++;
          return { text: 'AI 未能生成回复（返回了空内容）。请换个说法再试一次，或简化你的问题。', confidence: 0.4, source: 'empty-response' };
        }
        // 工具调用多轮循环（自主做事）：LLM 请求工具 → 执行 → 结果回填 → 再调 LLM，直至无工具调用或达上限
        if (result && result.ok && Array.isArray(result.tool_calls) && result.tool_calls.length > 0) {
          const maxRounds = 4;
          let roundHistory = [...history];
          const allToolResults = [];
          let roundResult = result;
          for (let round = 0; round < maxRounds; round++) {
            if (!(roundResult && roundResult.ok && Array.isArray(roundResult.tool_calls) && roundResult.tool_calls.length > 0)) {
              break;
            }
            const toolResults = await this._executeToolCalls(roundResult.tool_calls);
            allToolResults.push(...toolResults);
            this._lastToolResults = allToolResults;
            const toolMessages = [
              { role: 'assistant', content: roundResult.text || '', tool_calls: roundResult.tool_calls },
              ...toolResults.map((r) => ({
                role: 'tool',
                content: JSON.stringify(r).substring(0, 500)
              }))
            ];
            roundHistory = [...roundHistory, ...toolMessages];
            roundResult = await this._chatWithRetry(bridge, sysPrompt, roundHistory, { tools: toolSchema });
            this.stats.llm.attempts++;
          }
          if (roundResult && roundResult.ok && roundResult.text) {
            this.stats.llm.successes++;
            return { text: roundResult.text, confidence: 0.9, source: 'ollama', toolResults: allToolResults };
          }
          // 摘要 LLM 调用失败/无文本但工具已执行 → 诚实告知工具结果（不静默吞掉副作用）
          if (allToolResults.length > 0) {
            this.stats.llm.successes++;
            const partial = allToolResults.some((r) => r.ok === true);
            return {
              text: partial
                ? this._describeToolResult(allToolResults)
                : '工具调用未能成功完成。已尝试的操作见工具结果。',
              confidence: 0.6,
              source: 'ollama',
              toolResults: allToolResults,
              truncated: allToolResults.length >= 4
            };
          }
        }
      }
    } catch (e) {
      // 工具已执行但后续 LLM 失败 → 诚实告知工具结果（不静默吞掉副作用）
      if (this._lastToolResults && this._lastToolResults.length > 0) {
        const partial = this._lastToolResults.some((r) => r.ok === true);
        return {
          text: partial
            ? this._describeToolResult(this._lastToolResults)
            : '工具调用未能成功完成。已尝试的操作见工具结果。',
          confidence: 0.5,
          source: 'ollama',
          toolResults: this._lastToolResults
        };
      }
      /* Ollama 不可用，回退话术 */
    }
    this.stats.llm.fallbacks++;

    // 确定性兜底：Ollama 不可用时，用户明确请求文档仍可生成（不依赖 LLM）
    const fallbackTrigger = /生成|创建|制作|设计|文档|报告|表格|图形|word|pdf|docx|excel|xlsx|周报|海报|图片|图标/i.test(text);
    if (fallbackTrigger) {
      try {
        const ruleBased = this._ruleBasedDocumentCall(text);
        if (ruleBased) {
          const toolResults = await this._executeToolCalls([{ function: ruleBased }]);
          if (toolResults.some((r) => r.ok === true)) {
            return { text: this._describeToolResult(toolResults), confidence: 0.7, source: 'rule-based', toolResults, ruleBased: true };
          }
        }
      } catch (e) { /* 规则兜底失败，继续话术 */ }
    }

    const personality = conversation.personality || 'default';
    const _context = conversation.context || {};

    // 根据人格生成不同的回复风格
    const responses = {
      default: [
        '我理解你的意思。',
        '这是一个有趣的问题。',
        '让我想想...',
        '好的，我明白了。',
        '谢谢你的分享！'
      ],
      playful: [
        '哈哈，这太有趣了！',
        '哇，你真厉害！',
        '我也觉得很好玩呢~',
        '嘻嘻，你想到了什么？',
        '太棒了！继续说~'
      ],
      professional: [
        '我已经收到您的信息。',
        '根据您的描述，我建议...',
        '这个问题需要进一步分析。',
        '我理解您的需求。',
        '让我为您详细说明。'
      ],
      creative: [
        '让我用不同的角度思考...',
        '这让我想到了一个有趣的故事...',
        '也许我们可以这样看...',
        '想象一下...',
        '如果换一种方式呢？'
      ]
    };

    const responseList = responses[personality] || responses.default;
    const randomResponse = responseList[Math.floor(Math.random() * responseList.length)];

    // 模拟AI处理延迟
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

    return {
      text: randomResponse,
      confidence: 0.8 + Math.random() * 0.2,
      source: 'fallback'
    };
  }

  /**
   * 流式处理消息
   */
  async processStream({ text, personality, context, userId, onData, onEnd, onError }) {
    try {
      const startTime = Date.now();

      // 获取或创建会话
      let conversation = this.conversations.get(userId);
      if (!conversation) {
        conversation = {
          id: userId,
          messages: [],
          personality: personality || 'default',
          context: context || {},
          createdAt: new Date(),
          lastActivity: new Date()
        };
        this.conversations.set(userId, conversation);
      }

      // 添加用户消息
      conversation.messages.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        role: 'user',
        content: text,
        timestamp: new Date()
      });
      conversation.lastActivity = new Date();

      // BrainSystem 感知：意图分析 + 记忆存储（非侵入式，与 processMessage 对称）
      try {
        const { BrainSystem } = require('../../src/core/BrainSystem');
        if (BrainSystem.analyzeIntent) {
          const intent = BrainSystem.analyzeIntent(text);
          conversation.context = { ...conversation.context, lastIntent: intent };
        }
        if (BrainSystem.smartStore && userId && userId !== 'anonymous') {
          BrainSystem.smartStore(`chat_${userId}_${Date.now()}`, { input: text, role: 'user', userId });
        }
      } catch (e) { /* BrainSystem 可选，失败静默 */ }

      // 真实 Ollama 流式输出（非侵入式，Ollama 不可用回退话术）
      const bridge = this._getOllamaBridge();
      if (bridge) {
        try {
          const history = conversation.messages.slice(-6).map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content
          }));
          const { sysPrompt, toolTrigger } = await this._buildSysPrompt(text, conversation, userId);
          const messages = [{ role: 'system', content: sysPrompt }, ...history];

          // 工具调用多轮循环（与 generateResponse 一致）：LLM 请求工具 → 执行 → 结果回填 → 再调 LLM
          if (toolTrigger) {
            try {
              const toolSchema = await this._buildToolsSchema();
              const maxRounds = 4;
              let roundHistory = [...history];
              let roundResult = await this._chatWithRetry(bridge, sysPrompt, roundHistory, { tools: toolSchema });
              this.stats.llm.attempts++;
              const allToolResults = [];
              for (let round = 0; round < maxRounds; round++) {
                if (!(roundResult && roundResult.ok && Array.isArray(roundResult.tool_calls) && roundResult.tool_calls.length > 0)) {
                  break;
                }
                const toolResults = await this._executeToolCalls(roundResult.tool_calls);
                allToolResults.push(...toolResults);
                this._lastToolResults = allToolResults;
                const toolMessages = [
                  { role: 'assistant', content: roundResult.text || '', tool_calls: roundResult.tool_calls },
                  ...toolResults.map((r) => ({
                    role: 'tool',
                    content: JSON.stringify(r).substring(0, 500)
                  }))
                ];
                roundHistory = [...roundHistory, ...toolMessages];
                roundResult = await this._chatWithRetry(bridge, sysPrompt, roundHistory, { tools: toolSchema });
                this.stats.llm.attempts++;
              }
              if (allToolResults.length > 0) {
                const partial = allToolResults.some((r) => r.ok === true);
                const finalText = partial
                  ? this._describeToolResult(allToolResults)
                  : '工具调用未能成功完成。已尝试的操作见工具结果。';
                conversation.messages.push({
                  id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                  role: 'assistant',
                  content: finalText,
                  timestamp: new Date(),
                  latency: Date.now() - startTime
                });
                if (conversation.messages.length > 100) {
                  conversation.messages = conversation.messages.slice(-50);
                }
                this.stats.totalMessages++;
                this.stats.totalLatency += (Date.now() - startTime);
                this.stats.llm.successes++;
                // 单次发送工具结果（前端无需逐 token）
                onData({ type: 'chunk', content: finalText, fullText: finalText, progress: 1 });
                this._saveConversations();
                onEnd({ source: 'ollama', text: finalText, toolResults: allToolResults });
                return;
              }
              // 无工具结果 → 回退到流式（不在此返回，落到下方 stream 分支）
              // 达轮次上限但工具部分执行 → 诚实告知
              if (allToolResults.length > 0) {
                const partial = allToolResults.some((r) => r.ok === true);
                const finalText = partial
                  ? this._describeToolResult(allToolResults)
                  : '工具调用未能成功完成。已尝试的操作见工具结果。';
                conversation.messages.push({
                  id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                  role: 'assistant',
                  content: finalText,
                  timestamp: new Date(),
                  latency: Date.now() - startTime
                });
                if (conversation.messages.length > 100) {
                  conversation.messages = conversation.messages.slice(-50);
                }
                this.stats.totalMessages++;
                this.stats.totalLatency += (Date.now() - startTime);
                this.stats.llm.successes++;
                onData({ type: 'chunk', content: finalText, fullText: finalText, progress: 1 });
                this._saveConversations();
                onEnd({ source: 'ollama', text: finalText, toolResults: allToolResults, truncated: true });
                return;
              }
            } catch (e) { /* 工具检测失败，回退流式 */ }
          }

          const stream = await bridge.chat(messages, { stream: true, temperature: 0.7 });
          let fullText = '';
          for await (const chunk of stream) {
            const delta = chunk && chunk.message && chunk.message.content ? chunk.message.content : '';
            if (delta) {
              fullText += delta;
              onData({ type: 'chunk', content: delta, fullText, progress: 0.5 });
            }
          }

          // 流为空（模型未输出任何内容）→ 诚实告知，不静默返回空（与 POST 路径一致）
          if (!fullText) {
            fullText = 'AI 未能生成回复（返回了空内容）。请换个说法再试一次。';
            onData({ type: 'chunk', content: fullText, fullText, progress: 1 });
          }

          // 添加助手回复
          conversation.messages.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            role: 'assistant',
            content: fullText || '（无回复）',
            timestamp: new Date(),
            latency: Date.now() - startTime
          });
          // 消息上限（与 processMessage 对称）
          if (conversation.messages.length > 100) {
            conversation.messages = conversation.messages.slice(-50);
          }
          // 统计 + 记忆（与 processMessage 对称）
          this.stats.totalMessages++;
          this.stats.totalLatency += (Date.now() - startTime);
          this.stats.llm.attempts++;
          this.stats.llm.successes++;
          try {
            const { BrainSystem } = require('../../src/core/BrainSystem');
            if (BrainSystem.smartStore && userId && userId !== 'anonymous') {
              BrainSystem.smartStore(`chat_reply_${userId}_${Date.now()}`, { input: text, output: fullText, userId });
            }
          } catch (e) { /* 记忆可选，失败静默 */ }
          this._saveConversations();
          onEnd({ source: 'ollama', text: fullText });
          return;
        } catch (e) { /* Ollama 流失败，回退话术 */ }
      }

      // 回退话术（Ollama 不可用）
      const fullResponse = `收到你的消息: "${text}"。这是${conversation.personality}人格的回复。`;
      const words = fullResponse.split('');

      let currentText = '';

      for (let i = 0; i < words.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 30));

        currentText += words[i];

        onData({
          type: 'chunk',
          content: words[i],
          fullText: currentText,
          progress: (i + 1) / words.length
        });
      }

      // 添加助手回复
      conversation.messages.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        role: 'assistant',
        content: currentText,
        timestamp: new Date(),
        latency: Date.now() - startTime
      });
      conversation.lastActivity = new Date();
      // 统计 + 持久化（与 Ollama 路径对称）
      this.stats.totalMessages++;
      this.stats.totalLatency += (Date.now() - startTime);
      this.stats.llm.fallbacks++;
      this._saveConversations();

      onEnd({ source: 'fallback', text: currentText });
    } catch (error) {
      onError(error);
    }
  }

  /**
   * 获取聊天历史
   */
  async getHistory(userId, options = {}) {
    const conversation = this.conversations.get(userId);
    if (!conversation) {
      return { messages: [], total: 0 };
    }

    const { limit = 50, offset = 0 } = options;
    const messages = conversation.messages.slice(offset, offset + limit);

    return {
      messages,
      total: conversation.messages.length,
      offset,
      limit,
      personality: conversation.personality,
      lastActivity: conversation.lastActivity
    };
  }

  /**
   * 清除聊天历史
   */
  async clearHistory(userId) {
    const conversation = this.conversations.get(userId);
    if (conversation) {
      conversation.messages = [];
      conversation.lastActivity = new Date();
      this._saveConversations(); // 持久化清空（防止磁盘保留旧历史重启复活）
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      contextLength: this.contextLength,
      activeConversations: this.conversations.size,
      averageLatency: this.stats.totalMessages > 0 ?
        this.stats.totalLatency / this.stats.totalMessages : 0
    };
  }

  /**
   * 清理不活跃会话（持久化删除，防止磁盘保留僵尸会话重启复活）
   */
  cleanupInactiveSessions(maxInactiveTime = 3600000) { // 默认1小时
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, conversation] of this.conversations) {
      if (now - conversation.lastActivity.getTime() > maxInactiveTime) {
        this.conversations.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this._saveConversations();
    }

    return cleaned;
  }

  /**
   * 会话数量上限（LRU 淘汰最久未活跃的会话，防止 data/conversations.json 无限增长）
   */
  enforceConversationLimit(maxConversations = 5000, silent = false) {
    if (this.conversations.size <= maxConversations) { return 0; }
    const sorted = [...this.conversations.entries()]
      .sort((a, b) => (a[1].lastActivity ? a[1].lastActivity.getTime() : 0) - (b[1].lastActivity ? b[1].lastActivity.getTime() : 0));
    let evicted = 0;
    while (this.conversations.size > maxConversations && sorted.length > evicted) {
      const [userId] = sorted[evicted];
      this.conversations.delete(userId);
      evicted++;
    }
    if (evicted > 0 && !silent) {
      this._saveConversations();
    }
    return evicted;
  }

  /**
   * Shutdown: 清理 MCPPlugin（释放 MCP 子进程）
   */
  async shutdown() {
    if (this._mcpPlugin && typeof this._mcpPlugin.shutdown === 'function') {
      try {
        await this._mcpPlugin.shutdown();
      } catch (e) { /* 关闭失败静默 */ }
    }
    this._mcpPlugin = null;
    this._mcpTried = false;

    // flush 未保存的会话（防抖 timer 未触发时保证不丢失）
    // 先清理不活跃 + 限制会话数量（其内部 _saveConversations 的防抖 timer 随后被 clear）
    this.cleanupInactiveSessions();
    this.enforceConversationLimit(5000);
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (this._conversationsDirty) {
      this._conversationsDirty = false;
      try {
        const data = {};
        for (const [userId, c] of this.conversations) {
          data[userId] = {
            id: c.id,
            personality: c.personality,
            context: c.context,
            messages: c.messages,
            lastActivity: c.lastActivity instanceof Date ? c.lastActivity.toISOString() : c.lastActivity,
            compacted: c.compacted,
            compactionCount: c.compactionCount
          };
        }
        const dir = path.dirname(CONVERSATIONS_FILE);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(data, null, 2));
      } catch (e) { /* flush 失败静默 */ }
    }
  }

  /**
   * 从磁盘恢复会话（server 重启后保留多轮上下文）
   */
  _loadConversations() {
    try {
      if (!fs.existsSync(CONVERSATIONS_FILE)) { return; }
      const raw = JSON.parse(fs.readFileSync(CONVERSATIONS_FILE, 'utf8'));
      if (!raw || typeof raw !== 'object') { return; }
      for (const [userId, data] of Object.entries(raw)) {
        if (!userId || !data || !Array.isArray(data.messages)) { continue; }
        this.conversations.set(userId, {
          id: data.id || userId,
          personality: data.personality || 'default',
          context: data.context || {},
          messages: data.messages.map((m) => ({
            ...m,
            timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
          })),
          lastActivity: data.lastActivity ? new Date(data.lastActivity) : new Date(),
          compacted: data.compacted || false,
          compactionCount: data.compactionCount || 0
        });
      }
    } catch (e) { /* 恢复失败从空开始 */ }
  }

  /**
   * 持久化会话到磁盘（防抖 + 异步，避免频繁同步写盘阻塞事件循环）
   */
  _saveConversations() {
    this._conversationsDirty = true;
    if (this._saveTimer) { return; }
    // 防抖：合并短时间内的多次变更，500ms 后统一写盘
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      if (!this._conversationsDirty) { return; }
      this._conversationsDirty = false;
      // 每次保存前限制会话数量（防止长期运行累积超出上限）
      this.enforceConversationLimit(5000, true);
      try {
        const dir = path.dirname(CONVERSATIONS_FILE);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const data = {};
        for (const [userId, c] of this.conversations) {
          data[userId] = {
            id: c.id,
            personality: c.personality,
            context: c.context,
            messages: c.messages,
            lastActivity: c.lastActivity instanceof Date ? c.lastActivity.toISOString() : c.lastActivity,
            compacted: c.compacted,
            compactionCount: c.compactionCount
          };
        }
        // 异步写盘（不阻塞事件循环）
        fs.writeFile(CONVERSATIONS_FILE, JSON.stringify(data, null, 2), (err) => {
          if (err) { /* 持久化失败静默（不阻塞对话） */ }
        });
      } catch (e) { /* 持久化失败静默（不阻塞对话） */ }
    }, 500);
    // 防抖 timer 不阻止进程退出（生产有 shutdown flush 兜底）
    if (this._saveTimer && typeof this._saveTimer.unref === 'function') {
      this._saveTimer.unref();
    }
  }
}

module.exports = new ChatService();