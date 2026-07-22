/**
 * ProjectTracker - 开源项目追踪与更新模块
 *
 * 自动检测开源项目更新并更新对应的 SKILL.md
 */

const { safeExecSync } = require('../utils/SafeExec');
const fs = require('fs');
const path = require('path');

const isWindows = process.platform === 'win32';
const curlCmd = isWindows ? 'curl.exe' : 'curl';

class ProjectTracker {
  constructor(options = {}) {
    this.skillsDir = options.skillsDir || 'D:/龙虾/.opencode/skills';
    this.projects = new Map();
    this._initProjects();
  }

  /**
   * 初始化追踪项目列表
   */
  _initProjects() {
    // Tailor - AI视频智能裁剪工具
    this.projects.set('Tailor', {
      owner: 'FutureUniant',
      repo: 'Tailor',
      skillPath: path.join(this.skillsDir, 'tailor', 'SKILL.md'),
      currentVersion: 'v0.1.5',
      lastCheckTime: null,
      features: {
        '视觉聚焦': /视觉聚焦|visual focusing/i,
        '动态背景': /动态背景|dynamic background/i,
        '时间修正': /时间修正|accurate time/i,
        '补丁更新': /补丁更新|patch/i,
        '模型权重': /模型权重|weights/i,
        '口播生成': /口播生成|talking head/i,
        '字幕生成': /字幕|subtitle/i,
        '黑白上色': /黑白上色|color.*generation/i,
        '目标消除': /目标消除|target.*remove/i,
        '字幕消除': /字幕消除|erase.*subtitle/i,
        '流畅度': /流畅度|frame.*interpolation/i,
        '清晰度': /清晰度|super.*resolution/i,
        '背景更换': /背景更换|background/i,
        '人脸剪辑': /人脸剪辑|face.*cut/i,
        '语音剪辑': /语音剪辑|voice.*cut/i
      }
    });

    // AutoClip - AI视频高光切片
    this.projects.set('AutoClip', {
      owner: 'zhouxiaoka',
      repo: 'autoclip',
      skillPath: path.join(this.skillsDir, 'autoclip', 'SKILL.md'),
      currentVersion: 'v1.0.0',
      lastCheckTime: null,
      features: {}
    });

    // OpenWebUI - 自托管AI平台
    this.projects.set('OpenWebUI', {
      owner: 'open-webui',
      repo: 'open-webui',
      skillPath: path.join(this.skillsDir, 'open-webui', 'SKILL.md'),
      currentVersion: 'v0.9.1',
      lastCheckTime: null,
      features: {}
    });

    // n8n - 工作流自动化
    this.projects.set('n8n', {
      owner: 'n8n-io',
      repo: 'n8n',
      skillPath: path.join(this.skillsDir, 'n8n-workflow', 'SKILL.md'),
      currentVersion: 'stable',
      lastCheckTime: null,
      features: {}
    });

    // Dify - LLM应用开发平台
    this.projects.set('Dify', {
      owner: 'langgenius',
      repo: 'dify',
      skillPath: path.join(this.skillsDir, 'dify-platform', 'SKILL.md'),
      currentVersion: '1.13.3',
      lastCheckTime: null,
      features: {}
    });

    // LangChain - LLM框架
    this.projects.set('LangChain', {
      owner: 'langchain-ai',
      repo: 'langchain',
      skillPath: path.join(this.skillsDir, 'langchain', 'SKILL.md'),
      currentVersion: 'langchain-core==1.3.0',
      lastCheckTime: null,
      features: {}
    });

    // LlamaIndex - RAG框架
    this.projects.set('LlamaIndex', {
      owner: 'run-llama',
      repo: 'llamaindex',
      skillPath: path.join(this.skillsDir, 'llamaindex', 'SKILL.md'),
      currentVersion: 'latest',
      lastCheckTime: null,
      features: {}
    });

    // Semantic Kernel - 微软AI SDK
    this.projects.set('SemanticKernel', {
      owner: 'microsoft',
      repo: 'semantic-kernel',
      skillPath: path.join(this.skillsDir, 'semantic-kernel', 'SKILL.md'),
      currentVersion: 'python-1.41.2',
      lastCheckTime: null,
      features: {}
    });

    // Haystack - RAG管道
    this.projects.set('Haystack', {
      owner: 'deepset-ai',
      repo: 'haystack',
      skillPath: path.join(this.skillsDir, 'haystack', 'SKILL.md'),
      currentVersion: 'v2.28.0',
      lastCheckTime: null,
      features: {}
    });

    // Mem0 - AI记忆层
    this.projects.set('Mem0', {
      owner: 'mem0ai',
      repo: 'mem0',
      skillPath: path.join(this.skillsDir, 'mem0-memory', 'SKILL.md'),
      currentVersion: 'openclaw-v1.0.7',
      lastCheckTime: null,
      features: {}
    });

    // DSPy - 声明式编程框架
    this.projects.set('DSPy', {
      owner: 'stanfordnlp',
      repo: 'dspy',
      skillPath: path.join(this.skillsDir, 'dspy', 'SKILL.md'),
      currentVersion: '3.2.0',
      lastCheckTime: null,
      features: {}
    });

    // Letta - 有状态AI Agent
    this.projects.set('Letta', {
      owner: 'letta-ai',
      repo: 'letta',
      skillPath: path.join(this.skillsDir, 'letta-architecture', 'SKILL.md'),
      currentVersion: '0.16.7',
      lastCheckTime: null,
      features: {}
    });

    // AutoGen - 多Agent对话框架
    this.projects.set('AutoGen', {
      owner: 'microsoft',
      repo: 'autogen',
      skillPath: path.join(this.skillsDir, 'autogen-framework', 'SKILL.md'),
      currentVersion: 'python-v0.7.5',
      lastCheckTime: null,
      features: {}
    });

    // Crawlee - Python爬虫框架
    this.projects.set('Crawlee', {
      owner: 'apify',
      repo: 'crawlee-python',
      skillPath: path.join(this.skillsDir, 'crawlee-patterns', 'SKILL.md'),
      currentVersion: 'v1.6.2',
      lastCheckTime: null,
      features: {}
    });

    // Lightpanda - 超轻量浏览器
    this.projects.set('Lightpanda', {
      owner: 'lightpanda-io',
      repo: 'browser',
      skillPath: path.join(this.skillsDir, 'lightpanda-browser', 'SKILL.md'),
      currentVersion: 'nightly',
      lastCheckTime: null,
      features: {}
    });

    // Scrapling - 自适应爬虫
    this.projects.set('Scrapling', {
      owner: 'D4Vinci',
      repo: 'Scrapling',
      skillPath: path.join(this.skillsDir, 'scrapling', 'SKILL.md'),
      currentVersion: 'v0.4.7',
      lastCheckTime: null,
      features: {}
    });

    // DeerFlow - 超级Agent
    this.projects.set('DeerFlow', {
      owner: 'bytedance',
      repo: 'deer-flow',
      skillPath: path.join(this.skillsDir, 'deerflow-superagent', 'SKILL.md'),
      currentVersion: 'latest',
      lastCheckTime: null,
      features: {}
    });

    // CrewAI - 多Agent框架
    this.projects.set('CrewAI', {
      owner: 'crewaiinc',
      repo: 'crewai',
      skillPath: path.join(this.skillsDir, 'crewai-multiagent', 'SKILL.md'),
      currentVersion: '1.14.2',
      lastCheckTime: null,
      features: {}
    });

    // BrowserUse - 浏览器自动化
    this.projects.set('BrowserUse', {
      owner: 'browser-use',
      repo: 'browser-use',
      skillPath: path.join(this.skillsDir, 'browser-use', 'SKILL.md'),
      currentVersion: '0.12.6',
      lastCheckTime: null,
      features: {}
    });

    // Swarms - 多Agent编排
    this.projects.set('Swarms', {
      owner: 'kyegomez',
      repo: 'swarms',
      skillPath: path.join(this.skillsDir, 'swarms-framework', 'SKILL.md'),
      currentVersion: '6.8.1',
      lastCheckTime: null,
      features: {}
    });

    // OpenClaw - Agent框架
    this.projects.set('OpenClaw', {
      owner: 'openclaw',
      repo: 'openclaw',
      skillPath: path.join(this.skillsDir, 'openclaw', 'SKILL.md'),
      currentVersion: 'v2026.4.21',
      lastCheckTime: null,
      features: {}
    });

    // Pixelle-Video - AI短视频引擎
    this.projects.set('Pixelle-Video', {
      owner: 'AIDC-AI',
      repo: 'Pixelle-Video',
      skillPath: path.join(this.skillsDir, 'pixelle-video', 'SKILL.md'),
      currentVersion: 'v0.1.15',
      lastCheckTime: null,
      features: {
        '动作迁移': /动作迁移|motion/i,
        '数字人口播': /数字人|数字人/i,
        '图生视频': /图生视频/i,
        '背景音乐': /BGM|背景音乐/i
      }
    });
  }

  /**
   * 获取 releases（支持 gh CLI 或 curl）
   */
  async getLatestRelease(projectName) {
    const project = this.projects.get(projectName);
    if (!project) {return null;}

    // 尝试使用 gh CLI
    try {
      const result = safeExecSync('gh', [
        'release', 'view', '-R', `${project.owner}/${project.repo}`,
        '--json', 'tagName,body,publishedAt',
        '--jq', '{tagName: .tagName, body: .body, publishedAt: .publishedAt}'
      ], { encoding: 'utf8', timeout: 10000 });
      return JSON.parse(result);
    } catch (e) {
      // gh CLI 不可用，尝试使用 curl
      console.log('[ProjectTracker] gh CLI 不可用，使用 curl 备用方案');
    }

    // 备用方案：使用 curl 调用 GitHub API
    try {
      const url = `https://api.github.com/repos/${project.owner}/${project.repo}/releases/latest`;
      const result = safeExecSync(curlCmd, ['-s', url], { encoding: 'utf8', timeout: 15000 });
      const data = JSON.parse(result);
      return {
        tagName: data.tag_name,
        body: data.body,
        publishedAt: data.published_at
      };
    } catch (e) {
      console.error(`[ProjectTracker] 获取 ${projectName} release 失败:`, e.message);
      return null;
    }
  }

  /**
   * 获取 commits
   */
  async getRecentCommits(projectName, count = 5) {
    const project = this.projects.get(projectName);
    if (!project) {return [];}

    // 尝试 gh CLI
    try {
      const result = safeExecSync('gh', [
        'api', `repos/${project.owner}/${project.repo}/commits`,
        '--jq', `.[:${count}] | .[] | {sha: .sha, message: .commit.message, date: .commit.author.date}`
      ], { encoding: 'utf8', timeout: 10000 });
      return result.split('\n').filter(Boolean).map((line) => JSON.parse(line));
    } catch (e) {
      // 备用：使用 curl
    }

    // 备用方案：使用 curl
    try {
      const url = `https://api.github.com/repos/${project.owner}/${project.repo}/commits?per_page=${count}`;
      const result = safeExecSync(curlCmd, ['-s', url], { encoding: 'utf8', timeout: 15000 });
      const data = JSON.parse(result);
      return data.map((c) => ({
        sha: c.sha,
        message: c.commit.message,
        date: c.commit.author.date
      }));
    } catch (e) {
      console.error(`[ProjectTracker] 获取 ${projectName} commits 失败:`, e.message);
      return [];
    }
  }

  /**
   * 获取 GitHub API 数据
   */
  async fetchFromAPI(endpoint) {
    try {
      const result = safeExecSync('gh', ['api', `repos/${endpoint}`], { encoding: 'utf8', timeout: 15000 });
      return JSON.parse(result);
    } catch (e) {
      // 备用：使用 curl
      const url = `https://api.github.com/${endpoint}`;
      const result = safeExecSync(curlCmd, ['-s', url], { encoding: 'utf8', timeout: 15000 });
      return JSON.parse(result);
    }
  }

  /**
   * 检测项目更新
   */
  async checkUpdate(projectName) {
    const project = this.projects.get(projectName);
    if (!project) {
      console.log(`[ProjectTracker] 未找到项目: ${projectName}`);
      return null;
    }

    console.log(`[ProjectTracker] 检查更新: ${projectName}`);

    const release = await this.getLatestRelease(projectName);
    if (!release) {return null;}

    const update = {
      projectName,
      latestVersion: release.tagName,
      currentVersion: project.currentVersion,
      publishedAt: release.publishedAt,
      hasUpdate: this._compareVersions(project.currentVersion, release.tagName) > 0,
      changelog: this._parseChangelog(release.body, project.features)
    };

    // 更新追踪状态
    project.lastCheckTime = new Date().toISOString();

    return update;
  }

  /**
   * 解析更新日志，提取新功能
   */
  _parseChangelog(body, featurePatterns) {
    if (!body) {return [];}

    const features = [];
    for (const [name, pattern] of Object.entries(featurePatterns)) {
      if (pattern.test(body)) {
        features.push(name);
      }
    }
    return features;
  }

  /**
   * 比较版本号
   * 返回: 0 相等, 正数 newVer 更新, 负数 oldVer 更新
   */
  _compareVersions(oldVer, newVer) {
    if (!oldVer || !newVer) {return 0;}

    // 移除 v 前缀
    const v1 = oldVer.replace(/^v/, '').split('.');
    const v2 = newVer.replace(/^v/, '').split('.');

    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
      const n1 = parseInt(v1[i] || '0', 10);
      const n2 = parseInt(v2[i] || '0', 10);
      if (n1 < n2) {return 1;}  // 新版本更旧
      if (n1 > n2) {return -1;} // 旧版本更新
    }
    return 0;
  }

  /**
   * 检查所有项目更新
   */
  async checkAllUpdates() {
    const results = [];

    for (const projectName of this.projects.keys()) {
      const update = await this.checkUpdate(projectName);
      if (update) {
        results.push(update);
      }
    }

    return results;
  }

  /**
   * 更新 SKILL.md 的更新日志
   */
  updateSkillMarkdown(projectName, update) {
    const project = this.projects.get(projectName);
    if (!project || !update.hasUpdate) {return false;}

    const skillPath = project.skillPath;
    if (!fs.existsSync(skillPath)) {
      console.log(`[ProjectTracker] SKILL.md 不存在: ${skillPath}`);
      return false;
    }

    let content = fs.readFileSync(skillPath, 'utf8');

    // 解析日期
    const date = new Date(update.publishedAt);
    const dateStr = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;

    // 检查是否已存在该版本
    if (content.includes(update.latestVersion)) {
      console.log(`[ProjectTracker] ${projectName} ${update.latestVersion} 已存在`);
      return false;
    }

    // 构建更新条目
    const newEntry = `| ${dateStr} | **${update.latestVersion}**: ${update.changelog.join('，')} |`;

    // 替换更新日志表格的最后一行
    content = content.replace(
      /(\| 日期 \| 更新内容 \|\n\|---\|---\|\n)(.*?)(\n## |$)(\n#|$)/,
      `$1${newEntry}\n$3`
    );

    // 更新版本号
    content = content.replace(
      /\*\*版本\*\*:.*/,
      `**版本**: ${update.latestVersion}`
    );

    // 保存
    fs.writeFileSync(skillPath, content);

    // 更新追踪状态
    project.currentVersion = update.latestVersion;

    console.log(`[ProjectTracker] ✅ 已更新 ${projectName} SKILL.md: ${update.latestVersion}`);
    return true;
  }

  /**
   * 获取追踪状态报告
   */
  getStatusReport() {
    const report = [];

    for (const [name, project] of this.projects) {
      report.push({
        name,
        owner: project.owner,
        repo: project.repo,
        currentVersion: project.currentVersion,
        lastCheckTime: project.lastCheckTime
      });
    }

    return report;
  }
}

module.exports = ProjectTracker;