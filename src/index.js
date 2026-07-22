const path = require('path');
const PluginManager = require('./plugins/PluginManager');
const { PersonalityManager } = require('./personality/PersonalityManager');
const ChatAgent = require('./agents/ChatAgent');
const MemoryAgent = require('./agents/MemoryAgent');
const MediaAgent = require('./agents/MediaAgent');
const GameAgent = require('./agents/GameAgent');
const RouterAgent = require('./agents/RouterAgent');
const InferenceBridge = require('./localInferencing/InferBridge');
const { SelfLearningSystem } = require('./core');
const { UnifiedMemory } = require('./memory');
const { SettingsSync } = require('./config');
const { FuzzyMatcher } = require('./utils');
const { MessageService, BoundedUUIDSet: _BoundedUUIDSet, BrowserAgent: _BrowserAgent } = require('./agent');
const { MCPManager } = require('./mcp');

// ========== 意图识别系统 ==========

class IntentRecognizer {
  constructor(options = {}) {
    this.fuzzyMatcher = options.fuzzyMatcher || null;
    this.patterns = {
      code: {
        keywords: ['写代码', '写函数', '写类', '代码', 'function', 'class', 'def ', 'import '],
        label: '代码开发'
      },
      test: {
        keywords: ['测试', '单元测试', 'test', 'spec', '用例'],
        label: '测试相关'
      },
      git: {
        keywords: ['git', 'commit', 'branch', 'push', 'pull', 'merge', 'stash'],
        label: 'Git操作'
      },
      debug: {
        keywords: ['调试', 'debug', '错误', 'bug', '修复', 'fix'],
        label: '调试修复'
      },
      review: {
        keywords: ['review', '审查', '检查', 'review'],
        label: '代码审查'
      },
      refactor: {
        keywords: ['重构', 'refactor', '优化', '重写'],
        label: '代码重构'
      },
      search: {
        keywords: ['搜索', '查找', 'search', 'find', 'grep'],
        label: '搜索查询'
      },
      config: {
        keywords: ['配置', 'config', 'setting', '设置'],
        label: '配置管理'
      },
      help: {
        keywords: ['帮助', 'help', '怎么', '如何', '?'],
        label: '寻求帮助'
      },
      chat: {
        keywords: ['聊聊', '聊天', 'hello', 'hi', '你好'],
        label: '日常聊天'
      }
    };
  }

  recognize(message) {
    const lower = (message || '').toLowerCase();
    const results = [];

    for (const [type, config] of Object.entries(this.patterns)) {
      const matchedKeywords = config.keywords.filter((kw) => lower.includes(kw.toLowerCase()));
      if (matchedKeywords.length > 0) {
        results.push({
          type,
          label: config.label,
          confidence: Math.min(0.5 + matchedKeywords.length * 0.15, 0.95),
          keywords: matchedKeywords
        });
      }
    }

    // 使用 FuzzyMatcher 增强识别
    if (this.fuzzyMatcher && results.length === 0) {
      const allKeywords = [];
      for (const [type, config] of Object.entries(this.patterns)) {
        for (const kw of config.keywords) {
          allKeywords.push({ keyword: kw, type, label: config.label });
        }
      }

      const scores = [];
      for (const item of allKeywords) {
        const score = this.fuzzyMatcher.score(message, item.keyword);
        if (score > 0.5) {
          scores.push({ ...item, score });
        }
      }

      if (scores.length > 0) {
        scores.sort((a, b) => b.score - a.score);
        const best = scores[0];
        results.push({
          type: best.type,
          label: best.label,
          confidence: Math.round(best.score * 100) / 100,
          keywords: [best.keyword],
          fuzzyMatch: true
        });
      }
    }

    // 按置信度排序
    results.sort((a, b) => b.confidence - a.confidence);

    return results.length > 0 ? results[0] : { type: 'unknown', label: '一般任务', confidence: 0.5 };
  }

  visualize(intent) {
    const bar = '█'.repeat(Math.floor(intent.confidence * 10));
    const fuzzyTag = intent.fuzzyMatch ? '🔍' : '';
    return `[${intent.label}]${fuzzyTag} ${bar} ${Math.round(intent.confidence * 100)}%`;
  }
}

let intentRecognizer = null;

// ========== MessageService - 对话消息管理 ==========
let messageService = null;
try {
  messageService = new MessageService({
    maxMessages: 500,
    uuidSetCapacity: 1000
  });
  console.log('[MessageService] Initialized - 对话消息管理已启用');
} catch (e) {
  console.warn('[MessageService] Failed to initialize:', e.message);
}

// ========== 初始化新模块 ==========

// HooksManager - 命令钩子系统
let hooksManager = null;
try {
  const { defaultManager } = require('./hooks');
  hooksManager = defaultManager;
  console.log('[HooksManager] Initialized and ready');
} catch (e) {
  console.warn('[HooksManager] Failed to initialize:', e.message);
}

// SuggestionPipeline - 建议管道系统
let suggestionPipeline = null;
try {
  const { SuggestionPipeline } = require('./agent');
  suggestionPipeline = new SuggestionPipeline({ enabled: true });

  // 添加智能建议阶段
  suggestionPipeline.use('skillSuggestion', async (ctx) => {
    const { message } = ctx;
    const skillKeywords = {
      'test': ['测试', '测试用例', '单元测试'],
      'git': ['git', 'commit', 'branch', 'push'],
      'docker': ['docker', 'container', '镜像'],
      'api': ['api', '接口', 'endpoint', 'rest'],
      'db': ['数据库', 'db', 'sql', 'query']
    };

    const suggestions = [];
    const lowerMsg = (message || '').toLowerCase();

    for (const [skill, keywords] of Object.entries(skillKeywords)) {
      if (keywords.some((kw) => lowerMsg.includes(kw))) {
        suggestions.push({
          type: 'skill',
          name: skill,
          reason: `检测到关键词: ${keywords.find((k) => lowerMsg.includes(k))}`
        });
      }
    }

    return { ...ctx, suggestions };
  });

  console.log('[SuggestionPipeline] Initialized with skill suggestion');
} catch (e) {
  console.warn('[SuggestionPipeline] Failed to initialize:', e.message);
}

// ========== UnifiedMemory - 统一内存系统 ==========
let unifiedMemory = null;
try {
  unifiedMemory = new UnifiedMemory();
  (async () => {
    try {
      await unifiedMemory.initialize();
      console.log('[UnifiedMemory] Initialized - 会话记忆已启用');
    } catch (e) {
      console.warn('[UnifiedMemory] Failed to initialize:', e.message);
    }
  })();
} catch (e) {
  console.warn('[UnifiedMemory] Failed to create:', e.message);
}

// ========== SettingsSync - 设置同步系统 ==========
let settingsSync = null;
try {
  settingsSync = new SettingsSync({
    localPath: path.join(process.cwd(), '.opencode', 'settings')
  });
  console.log('[SettingsSync] Initialized - 设置同步已启用');
} catch (e) {
  console.warn('[SettingsSync] Failed to initialize:', e.message);
}

// ========== FuzzyMatcher - 模糊匹配器 ==========
let fuzzyMatcher = null;
try {
  fuzzyMatcher = new FuzzyMatcher({
    threshold: 0.3,
    ignoreCase: true,
    ignoreAccents: true
  });
  console.log('[FuzzyMatcher] Initialized - 模糊匹配已启用');
} catch (e) {
  console.warn('[FuzzyMatcher] Failed to initialize:', e.message);
}

// IntentRecognizer - 意图识别器（依赖 FuzzyMatcher）
try {
  intentRecognizer = new IntentRecognizer({ fuzzyMatcher });
} catch (e) {
  console.warn('[IntentRecognizer] Failed to initialize:', e.message);
}

// ========== SelfLearningSystem - 自主学习系统 ==========

let selfLearning = null;
try {
  selfLearning = new SelfLearningSystem({ enabled: true });
  console.log('[SelfLearning] System ready - 学习中...');
  // 注意: 定期检查已移至 mainLoopInterval
} catch (e) {
  console.warn('[SelfLearning] Failed to initialize:', e.message);
}

// ========== MCPManager - MCP服务器管理（条件初始化） ==========
let mcpManager = null;
try {
  const mcpConfigPath = path.join(process.cwd(), '.opencode', 'mcp-config.json');
  const fs = require('fs');
  if (fs.existsSync(mcpConfigPath)) {
    const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
    if (mcpConfig && Object.keys(mcpConfig).length > 0) {
      mcpManager = new MCPManager({ maxConcurrent: 3 });
      mcpManager.updateServers(mcpConfig).catch((e) => {
        console.warn('[MCPManager] Failed to update servers:', e.message);
        mcpManager = null;
      });
      console.log('[MCPManager] Initialized - MCP服务器管理已启用');
    } else {
      console.log('[MCPManager] No MCP configuration found, skipping');
    }
  } else {
    console.log('[MCPManager] No MCP configuration file, skipping');
  }
} catch (e) {
  console.warn('[MCPManager] Failed to initialize:', e.message);
}

// ========== AgentLoop - 保留备用（复杂任务时使用） ==========
const _agentLoop = null;
try {
  const { AgentLoop: _AgentLoop } = require('./agent');
  console.log('[AgentLoop] Available as fallback for complex tasks');
} catch (e) {
  console.warn('[AgentLoop] Not available:', e.message);
}

// ========== 初始化 personality system ==========

const dataPath = path.resolve(__dirname, '../data/personalities.json');
const pm = new PersonalityManager(dataPath);
pm.load();
// Default to 'default' if available
if (pm.personalities && pm.personalities['default']) {
  pm.setActive('default');
}
pm.saveActive();

// Initialize plugins (Phase 5) - optional, non-fatal if plugins missing
let pluginManager = null;
try {
  pluginManager = new PluginManager(path.resolve(__dirname, '..'));
  if (pluginManager && typeof pluginManager.loadPlugins === 'function') {
    pluginManager.loadPlugins();
  }
} catch (e) {
  pluginManager = null;
}

// Initialize agents (skeletons)
const chatAgent = new ChatAgent(pm);
const memoryAgent = new MemoryAgent();
const mediaAgent = new MediaAgent();
const gameAgent = new GameAgent();
const router = new RouterAgent(pm, chatAgent, memoryAgent, mediaAgent, gameAgent, { hooksManager, suggestionPipeline });
const ib = new InferenceBridge();
ib.loadModel();

// ========== CLI Loop ==========

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

console.log('AI persona initialized. Type a message to chat (or prefix with "infer:" to run browser inferencer):');
rl.on('line', async (line) => {
  let inputLine = line;
  const startTime = Date.now();

  // ========== 意图识别可视化 ==========
  const intent = intentRecognizer.recognize(line);
  console.log(intentRecognizer.visualize(intent));

  // 0. UnifiedMemory - 记录用户消息
  if (unifiedMemory && unifiedMemory.initialized) {
    unifiedMemory.recordActivity('user', line);
  }

  // 0.1 MessageService - 记录用户消息
  if (messageService) {
    messageService.addMessage(
      messageService.createUserMessage(line, { origin: 'cli' })
    );
  }

  // 1. 插件预处理
  if (pluginManager && typeof pluginManager.onMessage === 'function') {
    try {
      const pmRes = await pluginManager.onMessage(line, {});
      if (pmRes && pmRes.message) {inputLine = pmRes.message;}
    } catch (e) {
      // ignore plugin errors to avoid breaking core flow
    }
  }

  // 2. HooksManager - 命令前钩子检查
  if (hooksManager) {
    try {
      const hookResult = await hooksManager.preToolUse('routeMessage', { message: inputLine });
      if (!hookResult.allowed) {
        console.log('[HooksManager] Message blocked:', hookResult.reason || 'Hook rejected');
        return;
      }
      if (hookResult.modified) {
        inputLine = hookResult.modified;
      }
    } catch (e) {
      console.warn('[HooksManager] Hook error:', e.message);
    }
  }

  // 3. SuggestionPipeline - 建议生成
  let suggestions = [];
  let adjustedParams = null;
  if (suggestionPipeline) {
    try {
      // 获取调整后的参数
      if (selfLearning) {
        adjustedParams = selfLearning.getAdjustedParameters();
        if (adjustedParams.adjustmentReason !== '使用默认参数') {
          console.log(`[SelfLearning] 🔧 ${adjustedParams.adjustmentReason}`);
        }
      }

      // 根据调整后的参数生成建议
      const maxSuggestions = adjustedParams?.suggestionCount || 3;
      const suggestionResult = await suggestionPipeline.execute({
        message: inputLine,
        maxSuggestions
      });

      if (suggestionResult.suggestions && suggestionResult.suggestions.length > 0) {
        // 根据类型权重过滤建议
        let filteredSuggestions = suggestionResult.suggestions;
        if (adjustedParams?.typeWeights && Object.keys(adjustedParams.typeWeights).length > 0) {
          filteredSuggestions = suggestionResult.suggestions.filter((s) => {
            const weight = adjustedParams.typeWeights[s.type] || 0.5;
            return weight >= 0.3; // 过滤掉采纳率低于30%的建议类型
          });
        }

        suggestions = filteredSuggestions.slice(0, maxSuggestions);

        if (suggestions.length > 0) {
          console.log('[💡 Suggestion]', suggestions.map((s) => `${s.name}(${s.reason})`).join(', '));
        }
      }
    } catch (e) {
      console.warn('[SuggestionPipeline] Error:', e.message);
    }
  }

  if (inputLine.toLowerCase().startsWith('infer:')) {
    const input = inputLine.slice(6).trim();
    const res = ib.infer(input);
    console.log('InferenceBridge:', res.text);
    return;
  }

  // 4. 路由消息
  const res = router.routeMessage(inputLine, {});
  console.log(res.reply);

  // 4.1 UnifiedMemory - 记录 AI 响应
  if (unifiedMemory && unifiedMemory.initialized) {
    unifiedMemory.recordActivity('assistant', res.reply);

    // 定期提取重要信息到长期记忆
    if (unifiedMemory.session && unifiedMemory.session.shouldExtract()) {
      unifiedMemory.extractIfNeeded({
        messages: unifiedMemory.session.messages,
        summary: res.reply
      }).catch(() => {});
    }
  }

  // 4.2 MessageService - 记录 AI 响应
  if (messageService) {
    messageService.addMessage(
      messageService.createAssistantMessage(res.reply || '', {
        stopReason: 'stop',
        responseTime: Date.now() - startTime
      })
    );
  }

  // 5. 后置钩子 - 消息发送后
  if (hooksManager) {
    hooksManager.postMessageSend({
      message: inputLine,
      response: res.reply
    }).catch((_e) => {});
  }

  // ========== 自我学习记录 ==========
  if (selfLearning) {
    // 记录意图识别结果（假设成功，后续反馈可修正）
    selfLearning.recordIntent(line, intent.type, true);

    // 记录响应质量（基于响应长度和时间）
    const responseTime = Date.now() - startTime;
    const quality = res.reply && res.reply.length > 10 ?
      Math.min(0.5 + responseTime / 10000, 1) : 0.3;
    selfLearning.recordResponse(line, res.reply || '', quality);

    // 学习技能加载效果
    if (res.skills && res.skills.length > 0) {
      res.skills.forEach((skill) => {
        selfLearning.recordSkillLoad(skill, intent.type, true);
      });
    }

    // 记录上下文推荐
    if (suggestions.length > 0) {
      suggestions.forEach((suggestion) => {
        selfLearning.recordSuggestion(suggestion, 'adopted');
      });
    }
  }

  // optional TTS simulation
  if (process.env.TTS_ENABLED === '1') {
    console.log(`(TTS) speaking: ${res.reply}`);
  }

  // ========== 学习命令 ==========
  if (line.toLowerCase() === '/learn' || line.toLowerCase() === '/learning') {
    if (selfLearning) {
      const stats = selfLearning.getStats();
      const improvements = selfLearning.getImprovements();
      const adjustedParams = selfLearning.getAdjustedParameters();

      console.log('\n📊 [学习统计]');
      console.log(`   意图样本: ${stats.intents.samples}`);
      console.log(`   建议样本: ${stats.suggestions.samples}`);
      console.log(`   技能样本: ${stats.skills.samples}`);
      console.log(`   响应历史: ${stats.responses}`);
      console.log(`   反馈记录: ${stats.feedback}`);
      console.log(`   改进机会: ${improvements.length}`);

      console.log('\n🔧 [当前行为调整]');
      console.log(`   建议数量: ${adjustedParams.suggestionCount} (基础3)`);
      console.log(`   建议频率: ${stats.adjustments?.suggestionFrequency >= 0 ? '↑' : '↓'} ${Math.abs(stats.adjustments?.suggestionFrequency || 0)}`);
      console.log(`   响应风格: ${adjustedParams.responseStyle}`);
      console.log(`   调整原因: ${adjustedParams.adjustmentReason}`);

      if (Object.keys(adjustedParams.typeWeights).length > 0) {
        console.log('\n📈 [类型采纳率]');
        for (const [type, weight] of Object.entries(adjustedParams.typeWeights)) {
          console.log(`   ${type}: ${(weight * 100).toFixed(0)}%`);
        }
      }

      if (improvements.length > 0) {
        console.log('\n💡 [改进建议]');
        improvements.forEach((imp, i) => {
          console.log(`   ${i + 1}. [${imp.priority}] ${imp.message}`);
        });
      }
      console.log('');
    } else {
      console.log('[SelfLearning] 学习系统未启用');
    }
    return;
  }

  // ========== 自动反馈识别 ==========
  const autoFeedbackPatterns = Object.freeze({
    positive: Object.freeze([
      '好', '不错', '很棒', '很好', '优秀', '赞', '给力', '完美',
      '谢谢', 'thanks', 'thx', 'thank', 'good', 'great', 'perfect',
      '对的', '正确', '就是', '可以', '行', '有用', '解决了'
    ]),
    negative: Object.freeze([
      '差', '烂', '错', '不好', '不对', '垃圾', '废物', '没用',
      '不行', '糟糕', '差劲', '离谱', '胡扯', '乱说', 'bad', 'wrong',
      '不是', '不要', '别', '停', '烦'
    ]),
    ignore: Object.freeze([
      '/learn', '/feedback', '/help', '/quit', '/exit', 'infer:',
      '好的', 'ok', 'okay'
    ])
  });

  function detectFeedback(message) {
    // 安全检查：确保 message 是字符串
    const safeMessage = typeof message === 'string' ? message : String(message || '');
    const lower = safeMessage.toLowerCase();

    // 忽略命令类消息
    for (const pattern of autoFeedbackPatterns.ignore) {
      if (lower.includes(pattern)) {return null;}
    }

    // 检查正面反馈
    for (const pattern of autoFeedbackPatterns.positive) {
      if (lower.includes(pattern)) {
        return { sentiment: 'positive', content: safeMessage, matched: pattern };
      }
    }

    // 检查负面反馈
    for (const pattern of autoFeedbackPatterns.negative) {
      if (lower.includes(pattern)) {
        return { sentiment: 'negative', content: safeMessage, matched: pattern };
      }
    }

    return null;
  }

  // 处理自动反馈
  const detectedFeedback = detectFeedback(line);
  if (detectedFeedback && selfLearning) {
    selfLearning.recordFeedback({
      type: 'auto',
      content: detectedFeedback.content,
      sentiment: detectedFeedback.sentiment
    });

    const emoji = detectedFeedback.sentiment === 'positive' ? '👍' : '👎';
    console.log(`[SelfLearning] ${emoji} 已学习: "${detectedFeedback.matched}"`);
  }

  // 学习反馈命令（保留手动方式）
  if (line.toLowerCase().startsWith('/feedback ')) {
    const feedbackContent = line.substring(10).trim();
    if (selfLearning) {
      selfLearning.recordFeedback({
        type: 'manual',
        content: feedbackContent,
        sentiment: selfLearning._analyzeSentiment(feedbackContent)
      });
      console.log('[SelfLearning] 反馈已记录，感谢您的反馈！');
    }
    return;
  }
});

// ========== 优雅退出 ==========

let mainLoopInterval = null;
try {
  mainLoopInterval = setInterval(async () => {
    // SelfLearning 定期检查
    const improvements = selfLearning?.getImprovements();
    if (improvements?.length > 0) {
      console.log('[SelfLearning] 发现改进机会:');
      improvements.forEach((imp, i) => {
        console.log(`  ${i + 1}. [${imp.priority}] ${imp.message}`);
      });
    }

    // SettingsSync 定期同步
    if (settingsSync?.authToken) {
      try {
        const localSettings = {
          learningAdjustments: selfLearning?.data?.adjustments,
          lastSync: Date.now()
        };
        await settingsSync.upload(localSettings, { key: 'local/settings.json' });
        console.log('[SettingsSync] 已同步本地设置');
      } catch (e) {
        // 静默失败，不影响主流程
      }
    }

    // UnifiedMemory 定期提取
    if (unifiedMemory?.initialized) {
      const stats = unifiedMemory.getSessionStats();
      if (stats && stats.messageCount > 50) {
        console.log('[UnifiedMemory] 会话统计:', stats);
      }
    }
  }, 60000);
} catch (e) {}

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  if (hooksManager) {hooksManager.destroy();}
  if (suggestionPipeline) {suggestionPipeline.destroy();}
  if (mcpManager) {mcpManager.cleanup();}
  if (mainLoopInterval) {clearInterval(mainLoopInterval);}

  // 保存 UnifiedMemory
  if (unifiedMemory?.initialized) {
    try {
      await unifiedMemory.session.save();
      console.log('[UnifiedMemory] 会话已保存');
    } catch (e) {}
  }

  // 保存 MessageService 状态
  if (messageService) {
    const stats = messageService.getStats();
    console.log(`[MessageService] 会话统计: ${stats.total} 条消息`);
  }

  process.exit(0);
});

process.on('exit', () => {
  if (mainLoopInterval) {clearInterval(mainLoopInterval);}
});
