/**
 * SessionMemory - 会话记忆系统
 * 基于 Claude Code SessionMemory 设计模式
 *
 * 核心功能:
 * - Fork 子 Agent 自动提取关键信息
 * - 双重阈值触发 (token + toolCall)
 * - 结构化记忆文件 (10个 section)
 * - 夜间蒸馏机制
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * 记忆 Section 定义
 */
const MemorySections = {
  SESSION_TITLE: 'Session Title',
  CURRENT_STATE: 'Current State',
  TASK_SPECIFICATION: 'Task specification',
  FILES_FUNCTIONS: 'Files and Functions',
  WORKFLOW: 'Workflow',
  ERRORS_CORRECTIONS: 'Errors & Corrections',
  CODEBASE_DOCS: 'Codebase and System Documentation',
  LEARNINGS: 'Learnings',
  KEY_RESULTS: 'Key results',
  WORKLOG: 'Worklog'
};

/**
 * 记忆 Section 限制
 */
const SectionLimits = {
  MAX_SECTION_TOKENS: 2000,
  MAX_TOTAL_TOKENS: 12000
};

/**
 * 默认配置
 */
const DefaultConfig = {
  minimumTokensBetweenUpdate: 5000,
  toolCallsBetweenUpdates: 3,
  minimumMessageTokensToInit: 10000,
  enabled: true,
  autoExtract: true
};

/**
 * 会话记忆类
 */
class SessionMemory {
  constructor(options = {}) {
    this.config = { ...DefaultConfig, ...options };
    this.content = new Map();
    this.sessionId = options.sessionId || this.generateSessionId();
    this.filePath = options.filePath || this.getDefaultPath();

    // 触发状态
    this.tokenCount = 0;
    this.toolCallCount = 0;
    this.lastUpdateTokenCount = 0;

    // 初始化 sections
    for (const section of Object.values(MemorySections)) {
      this.content.set(section, '');
    }
  }

  generateSessionId() {
    return `session-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  getDefaultPath() {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    return path.join(homeDir, '.claude', 'session-memory', `${this.sessionId}.md`);
  }

  /**
   * 记录消息
   */
  recordMessage(role, content, tokens = 0) {
    this.tokenCount += tokens;
    this.checkThreshold();
  }

  /**
   * 记录工具调用
   */
  recordToolCall(toolName, _args = {}) {
    this.toolCallCount++;
    this.checkThreshold();
  }

  /**
   * 检查是否触发提取
   */
  checkThreshold() {
    if (!this.config.autoExtract) {return false;}

    const tokenThresholdMet = this.tokenCount - this.lastUpdateTokenCount >= this.config.minimumTokensBetweenUpdate;
    const toolCallThresholdMet = this.toolCallCount >= this.config.toolCallsBetweenUpdates;

    return tokenThresholdMet && toolCallThresholdMet;
  }

  /**
   * 触发提取
   */
  async extract(session) {
    if (!this.checkThreshold()) {return null;}

    try {
      const result = await this.runExtractionAgent(session);
      this.mergeExtraction(result);
      this.lastUpdateTokenCount = this.tokenCount;
      this.toolCallCount = 0;
      return result;
    } catch (error) {
      console.error('Memory extraction failed:', error.message);
      return null;
    }
  }

  /**
   * 运行提取 Agent（Fork 子进程）
   */
  async runExtractionAgent(session) {
    const prompt = this.buildExtractionPrompt(session);
    const os = require('os');
    const fsSync = require('fs');
    const { safeSpawn } = require('../utils/SafeExec');

    const tempFile = path.join(os.tmpdir(), `session-extract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mjs`);
    const code = `
import AgentLoop from './src/agent/AgentLoop.js';

const agent = new AgentLoop({
  goal: ${JSON.stringify(prompt)},
  model: 'haiku'
});

const result = await agent.run();
console.log(JSON.stringify(result));
`;
    fsSync.writeFileSync(tempFile, code);

    return new Promise((resolve, reject) => {
      const child = safeSpawn('node', [tempFile], {
        cwd: process.cwd(),
        timeout: 30000
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      const cleanup = () => {
        try { fsSync.unlinkSync(tempFile); } catch { /* ignore */ }
      };

      child.on('close', (code) => {
        cleanup();
        if (code !== 0) {
          reject(new Error(`Extraction agent failed: ${errorOutput}`));
        } else {
          try {
            resolve(JSON.parse(output));
          } catch {
            resolve({ raw: output });
          }
        }
      });

      child.on('error', (e) => {
        cleanup();
        reject(e);
      });
    });
  }

  /**
   * 构建提取提示词
   */
  buildExtractionPrompt(session) {
    return `请分析以下会话内容，提取关键信息并按以下格式输出：

# Session Title
一句话描述本次会话的核心主题

# Current State
当前工作进展状态

# Task specification
任务的具体要求和目标

# Files and Functions
涉及的重要文件和函数

# Workflow
工作流程和步骤

# Errors & Corrections
遇到的错误和修正

# Codebase and System Documentation
代码库和系统相关文档

# Learnings
学到的知识和经验

# Key results
关键结果和产出

# Worklog
工作日志（按时间顺序）

会话内容：
${this.getRecentMessages(session).slice(-20).map((m) => `${m.role}: ${m.content}`).join('\n')}
`;
  }

  /**
   * 获取最近消息
   */
  getRecentMessages(session, count = 20) {
    if (!session || !session.messages) {return [];}
    return session.messages.slice(-count);
  }

  /**
   * 合并提取结果
   */
  mergeExtraction(extraction) {
    if (!extraction) {return;}

    // 解析 extraction 结构
    const sections = this.parseExtraction(extraction);

    for (const [name, content] of Object.entries(sections)) {
      const existing = this.content.get(name) || '';
      const merged = this.mergeSection(existing, content, SectionLimits.MAX_SECTION_TOKENS);
      this.content.set(name, merged);
    }

    // 持久化
    this.save();
  }

  /**
   * 解析提取结果
   */
  parseExtraction(extraction) {
    const sections = {};

    for (const section of Object.values(MemorySections)) {
      sections[section] = '';
    }

    if (typeof extraction === 'string') {
      // 从原始文本解析
      const lines = extraction.split('\n');
      let currentSection = null;
      let currentContent = [];

      for (const line of lines) {
        const sectionMatch = line.match(/^#\s+(.+)$/);
        if (sectionMatch) {
          if (currentSection) {
            sections[currentSection] = currentContent.join('\n').trim();
          }
          currentSection = sectionMatch[1];
          currentContent = [];
        } else if (currentSection) {
          currentContent.push(line);
        }
      }

      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
    } else if (extraction.sections) {
      // 结构化数据
      Object.assign(sections, extraction.sections);
    } else if (extraction.result) {
      // AgentLoop 返回格式
      Object.assign(sections, { KEY_RESULTS: JSON.stringify(extraction.result) });
    }

    return sections;
  }

  /**
   * 合并 Section 内容
   */
  mergeSection(existing, newContent, maxTokens) {
    const combined = existing
      ? `${existing}\n---\n${newContent}`
      : newContent;

    // 如果超过限制，保留后半部分（更新鲜）
    const tokens = this.estimateTokens(combined);
    if (tokens > maxTokens) {
      const lines = combined.split('\n');
      const halfLines = Math.floor(lines.length / 2);
      return lines.slice(halfLines).join('\n');
    }

    return combined;
  }

  /**
   * 估算 token 数量（简化版）
   */
  estimateTokens(text) {
    if (!text) {return 0;}
    return Math.ceil(text.length / 4);
  }

  /**
   * 保存到文件
   */
  async save() {
    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      const content = this.toMarkdown();
      await fs.writeFile(this.filePath, content, 'utf-8');

      return true;
    } catch (error) {
      console.error('Failed to save session memory:', error.message);
      return false;
    }
  }

  /**
   * 加载文件
   */
  async load() {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      this.parseFromMarkdown(content);
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to load session memory:', error.message);
      }
      return false;
    }
  }

  /**
   * 转换为 Markdown
   */
  toMarkdown() {
    const lines = [
      '# Session Memory',
      `<!-- Session: ${this.sessionId} -->`,
      `<!-- Last Updated: ${new Date().toISOString()} -->`,
      ''
    ];

    for (const [name, content] of this.content) {
      if (content) {
        lines.push(`## ${name}`);
        lines.push(content);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * 从 Markdown 解析
   */
  parseFromMarkdown(content) {
    const lines = content.split('\n');
    let currentSection = null;
    let currentContent = [];

    for (const line of lines) {
      const sectionMatch = line.match(/^##\s+(.+)$/);
      if (sectionMatch) {
        if (currentSection && currentContent.length > 0) {
          this.content.set(currentSection, currentContent.join('\n').trim());
        }
        currentSection = sectionMatch[1];
        currentContent = [];
      } else if (currentSection && line.trim()) {
        currentContent.push(line);
      }
    }

    if (currentSection && currentContent.length > 0) {
      this.content.set(currentSection, currentContent.join('\n').trim());
    }
  }

  /**
   * 获取记忆内容
   */
  get(sectionName) {
    return this.content.get(sectionName) || '';
  }

  /**
   * 获取所有记忆
   */
  getAll() {
    return Object.fromEntries(this.content);
  }

  /**
   * 获取格式化提示
   */
  getPromptContext() {
    const parts = [];

    for (const [name, content] of this.content) {
      if (content) {
        parts.push(`[${name}]\n${content}`);
      }
    }

    return parts.length > 0
      ? `\n\n---\n## Session Memory\n\n${parts.join('\n\n---\n')}\n---`
      : '';
  }

  /**
   * 清空记忆
   */
  clear() {
    for (const section of this.content.keys()) {
      this.content.set(section, '');
    }
    this.tokenCount = 0;
    this.toolCallCount = 0;
    this.lastUpdateTokenCount = 0;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    let totalTokens = 0;
    for (const content of this.content.values()) {
      totalTokens += this.estimateTokens(content);
    }

    return {
      sessionId: this.sessionId,
      sections: this.content.size,
      totalTokens,
      pendingTokens: this.tokenCount - this.lastUpdateTokenCount,
      pendingToolCalls: this.toolCallCount,
      nextExtractIn: this.config.minimumTokensBetweenUpdate - (this.tokenCount - this.lastUpdateTokenCount)
    };
  }

  /**
   * 销毁
   */
  destroy() {
    this.content.clear();
    this.clear();
  }
}

module.exports = {
  SessionMemory,
  MemorySections,
  SectionLimits,
  DefaultConfig
};
