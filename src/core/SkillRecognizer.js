/**
 * SkillRecognizer - Skill 自动识别与加载模块
 *
 * 根据用户输入自动识别并推荐合适的 Skill
 */

const fs = require('fs');
const path = require('path');

class SkillRecognizer {
  constructor(options = {}) {
    this.skillsDir = options.skillsDir || 'D:/龙虾/.opencode/skills';
    this.skills = [];
    this.categories = {};
    this.keywordMap = new Map();

    // 自有系统注册表
    this.customSystems = new Map();
    this._registerCustomSystems();

    this._initKeywordMap();
    this._loadSkills();
  }

  /**
   * 注册自有系统
   * 支持动态添加新的自定义模块/工具/系统
   */
  _registerCustomSystems() {
    // 拾号-爬虫系统
    this.customSystems.set('DynamicScraper', {
      name: 'DynamicScraper',
      path: 'src/agent/DynamicScraper.js',
      description: '拾号-爬虫系统 - 多平台动态网页爬取',
      type: '爬虫系统',
      category: '拾号-爬虫',
      keywords: [
        '爬虫', '抓取', '爬取', '网页', '数据',
        '抖音', 'B站', '小红书', '微博', 'youtube', 'twitter',
        'dynamic-scraper', 'dynamicScraper', 'bilibili', 'B站'
      ],
      features: {
        isDomestic: true,
        isVideo: true,
        isSocial: true,
        isDynamic: true
      },
      priority: 10  // 优先级
    });

    // 未来可添加更多自有系统:
    // this.customSystems.set('AnotherSystem', { ... });

    // AutoClip - AI视频高光切片系统
    this.customSystems.set('AutoClip', {
      name: 'AutoClip',
      path: null,  // 第三方开源项目
      description: 'AutoClip - AI视频高光切片系统，智能提取视频精彩片段',
      type: '视频切片系统',
      category: '开源项目',
      keywords: [
        '高光', '切片', '精彩片段', '视频切片', 'AI剪辑',
        'autoclip', 'AutoClip',
        'YouTube视频', 'B站视频', '视频二创',
        '直播回放', '课程切片', '视频合集'
      ],
      features: {
        isVideo: true,
        isAI: true,
        isClip: true
      },
      priority: 8
    });

    // Tailor - AI视频智能裁剪工具
    this.customSystems.set('Tailor', {
      name: 'Tailor',
      path: null,
      description: 'Tailor - AI视频智能裁剪工具，支持人脸剪辑、背景更换、清晰度优化等13种方法',
      type: '视频处理工具',
      category: '开源项目',
      keywords: [
        'Tailor', 'tailor', '视频剪辑', 'AI剪辑',
        '人脸剪辑', '语音剪辑', '口播生成', '字幕生成',
        '背景更换', '黑白上色', '清晰度', '流畅度',
        '目标消除', '字幕消除', '语言更换', '局部处理'
      ],
      features: {
        isVideo: true,
        isAI: true,
        isEdit: true,
        isDesktop: true
      },
      priority: 8
    });
  }

  /**
 * 添加自定义系统（供外部调用）
 */
  registerSystem(name, config) {
    this.customSystems.set(name, {
      name,
      priority: config.priority || 5,
      keywords: config.keywords || [],
      features: config.features || {},
      ...config
    });
    console.log(`[SkillRecognizer] 已注册自有系统: ${name}`);
  }

  /**
   * 获取所有自有系统
   */
  getCustomSystems() {
    return Array.from(this.customSystems.values());
  }

  /**
   * 初始化关键词映射表
   */
  _initKeywordMap() {
    this.keywordMap = new Map([
      // 安全相关
      ['安全', 'security-audit'],
      ['审计', 'security-audit'],
      ['漏洞', 'security-audit'],
      ['permission', 'permission-system'],
      ['权限', 'permission-system'],

      // Agent 相关
      ['agent', 'multi-agent-orchestration'],
      ['多Agent', 'multi-agent-orchestration'],
      ['协作', 'multi-agent-orchestration'],
      ['autogen', 'autogen-framework'],
      ['crewai', 'crewai'],
      ['langchain', 'langchain'],

      // 浏览器/爬虫
      ['浏览器自动化', 'browser-automation'],
      ['拾号-爬虫', 'module:DynamicScraper'],
      ['拾号爬虫', 'module:DynamicScraper'],
      ['爬虫系统', 'module:DynamicScraper'],
      ['我的爬虫', 'module:DynamicScraper'],
      ['爬虫抓取', 'module:DynamicScraper'],
      ['抓取网站数据', 'module:DynamicScraper'],
      ['抓取', 'module:DynamicScraper'],
      ['爬取', 'module:DynamicScraper'],
      ['网页抓取', 'module:DynamicScraper'],
      ['网站数据', 'module:DynamicScraper'],
      ['网页数据', 'module:DynamicScraper'],
      ['dynamic-scraper', 'module:DynamicScraper'],

      // 平台关键词
      ['抖音视频', 'module:DynamicScraper'],
      ['抖音', 'module:DynamicScraper'],
      ['B站', 'module:DynamicScraper'],
      ['bilibili', 'module:DynamicScraper'],
      ['小红书', 'module:DynamicScraper'],
      ['微博', 'module:DynamicScraper'],
      ['youtube', 'module:DynamicScraper'],
      ['twitter', 'module:DynamicScraper'],

      // 第三方爬虫
      ['crawl4ai', 'crawl4ai-patterns'],
      ['scrapling', 'scrapling'],
      ['selenium', 'seleniumbase-patterns'],
      ['selenium自动化', 'seleniumbase-patterns'],
      ['playwright', 'browser-automation'],
      ['playwright自动化', 'browser-automation'],
      ['firecrawl', 'firecrawl-patterns'],
      ['easyspider', 'easyspider-patterns'],

      // Tailor - AI视频智能裁剪工具
      ['Tailor', 'module:Tailor'],
      ['tailor', 'module:Tailor'],
      ['视频剪辑', 'module:Tailor'],
      ['人脸剪辑', 'module:Tailor'],
      ['语音剪辑', 'module:Tailor'],
      ['口播生成', 'module:Tailor'],
      ['字幕生成', 'module:Tailor'],
      ['背景更换', 'module:Tailor'],
      ['黑白上色', 'module:Tailor'],
      ['目标消除', 'module:Tailor'],
      ['字幕消除', 'module:Tailor'],
      ['语言更换', 'module:Tailor'],
      ['局部处理', 'module:Tailor'],
      ['Tailor清晰度', 'module:Tailor'],
      ['Tailor流畅度', 'module:Tailor'],
      ['Tailor目标消除', 'module:Tailor'],
      ['Tailor背景', 'module:Tailor'],
      ['Tailor人脸', 'module:Tailor'],
      ['Tailor语音', 'module:Tailor'],
      ['Tailor语音剪辑', 'module:Tailor'],

      // AutoClip - AI视频高光切片系统
      ['高光切片', 'module:AutoClip'],
      ['视频切片', 'module:AutoClip'],
      ['AI剪辑', 'module:AutoClip'],
      ['AutoClip', 'module:AutoClip'],
      ['autoclip', 'module:AutoClip'],
      ['精彩片段', 'module:AutoClip'],
      ['视频二创', 'module:AutoClip'],
      ['直播回放', 'module:AutoClip'],
      ['课程切片', 'module:AutoClip'],
      ['视频合集', 'module:AutoClip'],

      // 部署
      ['部署', 'docker-deployment'],
      ['docker', 'docker-deployment'],
      ['kubernetes', 'kubernetes-helm-charts'],
      ['k8s', 'kubernetes-helm-charts'],
      ['vercel', 'online-deployment'],

      // 前端
      ['vue', 'vue-frontend'],
      ['react', 'frontend-vue'],
      ['css', 'css-animations'],
      ['动画', 'advanced-css-animations'],
      ['ui', 'ui-ux-design'],
      ['界面', 'ui-ux-design'],

      // 测试
      ['测试', 'test-driven-development'],
      ['test', 'test-driven-development'],
      ['tdd', 'test-driven-development'],
      ['e2e测试', 'e2e-testing-playwright'],
      ['e2e', 'e2e-testing-playwright'],
      ['压力测试', 'stress-testing'],

      // LLM/AI
      ['llm', 'llm-client-patterns'],
      ['模型', 'ai-model-integration'],
      ['语音合成', 'multi-tts-engine'],
      ['tts', 'multi-tts-engine'],
      ['语音', 'voice-interaction'],
      ['ollama', 'ollama-adapter'],

      // MCP
      ['mcp', 'mcp-integration'],

      // 记忆
      ['记忆', 'mem0-memory'],
      ['memory', 'mem0-memory'],
      ['知识库', 'tavily-search-rag'],

      // VTuber/虚拟形象
      ['vtuber', 'vtuber-integration'],
      ['vrm', 'vrm-integration'],
      ['虚拟形象', 'ai-virtual-character-engine'],
      [' avatar', 'enhanced-avatar-system'],

      // 代码质量
      ['code review', 'code-review'],
      ['代码审查', 'code-review'],
      ['lint', 'verify'],

      // 工作流
      ['workflow', 'workflow-engine'],
      ['ci/cd', 'cicd-pipeline'],
      ['pipeline', 'cicd-pipeline'],

      // 监控
      ['监控', 'monitoring-dashboard'],
      ['prometheus', 'monitoring-ops'],
      ['metrics', 'prometheus-health-metrics'],

      // 性能
      ['性能', 'performance-optimization'],
      ['优化', 'performance-tuning'],
      ['延迟', 'latency-optimizer'],

      // 开发流程
      ['头脑风暴', 'brainstorming'],
      ['debug', 'systematic-debugging'],
      ['调试', 'systematic-debugging'],
      ['tdd', 'test-driven-development'],

      // 垂直领域
      ['交易', 'tradingagents-cn'],
      ['股票', 'tradingagents-cn'],
      ['小说', 'novel-assistant'],
      ['写作', 'novel-assistant'],
      ['电商', 'ecommerce-solutions'],

      // 工具
      ['下载', 'vidbee_download'],

      // 工作流：AutoClip + 拾号-爬虫
      ['视频采集切片', 'module:DynamicScraper'],
      ['视频下载切片', 'module:DynamicScraper'],
      ['批量视频切片', 'module:AutoClip'],
      ['批量下载', 'module:DynamicScraper']
    ]);
  }

  /**
   * 加载所有 Skills
   */
  _loadSkills() {
    if (!fs.existsSync(this.skillsDir)) {
      console.log('[SkillRecognizer] Skills目录不存在:', this.skillsDir);
      return;
    }

    const files = this._getSkillFiles(this.skillsDir);

    for (const file of files) {
      const skill = this._parseSkill(file);
      if (skill) {
        this.skills.push(skill);

        // 分类
        const cat = skill.category || '其他';
        if (!this.categories[cat]) {
          this.categories[cat] = [];
        }
        this.categories[cat].push(skill);
      }
    }

    console.log('[SkillRecognizer] 已加载', this.skills.length, '个Skills');
  }

  /**
   * 获取所有 Skill 文件
   */
  _getSkillFiles(dir) {
    const files = [];
    if (!fs.existsSync(dir)) {return files;}

    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        files.push(...this._getSkillFiles(fullPath));
      } else if (item.name === 'SKILL.md') {
        files.push(fullPath);
      }
    }
    return files;
  }

  /**
   * 解析 Skill 文件
   */
  _parseSkill(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);

      if (!fmMatch) {
        return {
          name: path.basename(path.dirname(filePath)),
          description: '',
          path: filePath,
          category: this._guessCategory(filePath)
        };
      }

      const fm = fmMatch[1];
      const nameMatch = fm.match(/^name:\s*(.+)$/m);
      const descMatch = fm.match(/^description:\s*(.+)$/m);

      return {
        name: nameMatch ? nameMatch[1].trim() : path.basename(path.dirname(filePath)),
        description: descMatch ? descMatch[1].trim() : '',
        path: filePath,
        category: this._guessCategory(filePath)
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * 猜测分类
   */
  _guessCategory(filePath) {
    const p = filePath.toLowerCase();
    if (p.includes('claude-code')) {return 'Claude Code';}
    if (p.includes('security') || p.includes('audit')) {return '安全';}
    if (p.includes('browser') || p.includes('crawl')) {return '浏览器/爬虫';}
    if (p.includes('agent')) {return 'AI Agent';}
    if (p.includes('mcp')) {return 'MCP';}
    if (p.includes('deploy') || p.includes('docker')) {return '部署';}
    if (p.includes('test')) {return '测试';}
    if (p.includes('vue') || p.includes('frontend')) {return '前端';}
    if (p.includes('llm') || p.includes('tts') || p.includes('voice')) {return 'LLM/语音';}
    if (p.includes('vrm') || p.includes('vtuber')) {return 'VTuber';}
    if (p.includes('memory')) {return '记忆系统';}
    return '其他';
  }

  /**
   * 识别用户输入，返回匹配的 Skills 或自定义模块
   */
  recognize(input, options = {}) {
    const { topN = 3, threshold = 0.3 } = options;
    const inputLower = input.toLowerCase();
    const results = [];
    const _matchedKeywords = new Set();

    // 1. 关键词精确匹配 - 优先匹配自定义模块
    // 优先匹配输入中最长的关键词
    const matched = [];
    for (const [keyword, skillName] of this.keywordMap) {
      if (inputLower.includes(keyword.toLowerCase())) {
        matched.push({ keyword, skillName, len: keyword.length });
      }
    }
    matched.sort((a, b) => b.len - a.len);
    const sortedKeywords = matched.map((m) => [m.keyword, m.skillName]);
    // 使用更精确的匹配：完全匹配或作为独立词匹配
    for (const [keyword, skillName] of sortedKeywords) {
      const kwLower = keyword.toLowerCase();
      const isExactMatch = inputLower === kwLower;
      const isWordBoundary = new RegExp(`\\b${kwLower}\\b`).test(inputLower);
      const isContained = inputLower.includes(kwLower);

      // 优先完全匹配，其次是词边界匹配，最后是包含匹配
      // 中文关键词(Unicode范围)长度>=2允许匹配
      const isChinese = /[\u4e00-\u9fa5]/.test(kwLower);
      const minLen = isChinese ? 2 : 3;
      if (isExactMatch || isWordBoundary || (isContained && kwLower.length >= minLen)) {
        // 检查是否是自有系统/模块
        if (skillName.startsWith('module:')) {
          const moduleName = skillName.replace('module:', '');
          const module = this._getCustomModule(moduleName);
          if (module) {
            results.push({
              skill: {
                name: moduleName,
                description: module.description,
                path: module.path,
                type: module.type,           // 如 "爬虫系统"
                category: module.category,   // 如 "拾号-爬虫"
                isSystem: module.isSystem,   // true 表示是系统而非普通模块
                platforms: module.platforms, // 支持的平台
                isCustomModule: true
              },
              score: 1.0,
              match: module.type === '爬虫系统' ? 'crawler-system' : 'custom-module'
            });
          }
        } else {
          // 普通 Skill
          const skill = this.skills.find((s) => s.name === skillName);
          if (skill) {
            results.push({ skill, score: 1.0, match: 'keyword' });
          }
        }
      }
    }

    // 2. 描述模糊匹配
    if (results.length < topN) {
      for (const skill of this.skills) {
        if (results.some((r) => r.skill.name === skill.name)) {continue;}

        const descLower = (skill.description || '').toLowerCase();
        const nameLower = (skill.name || '').toLowerCase();

        let score = 0;

        for (const word of inputLower.split(/\s+/)) {
          if (nameLower.includes(word)) {score += 0.5;}
          if (descLower.includes(word)) {score += 0.3;}
        }

        if (score >= threshold) {
          results.push({ skill, score, match: 'fuzzy' });
        }
      }
    }

    // 去重：按 name 去重，保留分数最高的
    const uniqueMap = new Map();
    for (const r of results) {
      const key = r.skill.name + (r.skill.isCustomModule ? '-custom' : '');
      if (!uniqueMap.has(key) || uniqueMap.get(key).score < r.score) {
        uniqueMap.set(key, r);
      }
    }
    const uniqueResults = Array.from(uniqueMap.values());

    // 按原始顺序返回（关键词长度排序的结果）
    return uniqueResults.slice(0, topN);
  }

  /**
   * 获取自有系统/模块
   * 包括: 拾号-爬虫系统、其他自有工具
   */
  _getCustomModule(moduleName) {
    const modules = {
      'DynamicScraper': {
        path: 'src/agent/DynamicScraper.js',
        description: '拾号-爬虫系统 - 多平台动态网页爬取，支持抖音/B站/小红书等',
        type: '爬虫系统',
        category: '拾号-爬虫',
        isSystem: true,
        platforms: ['抖音', 'B站', '小红书', '微博', 'YouTube', 'Twitter']
      },
      'AutoClip': {
        path: null,  // 第三方开源项目
        description: 'AutoClip - AI视频高光切片系统，智能提取视频精彩片段',
        type: '视频切片系统',
        category: '开源项目',
        isSystem: true,
        isExternal: true,
        github: 'https://github.com/zhouxiaoka/autoclip',
        features: ['多平台视频下载', 'AI智能分析', '自动切片', '智能合集']
      },
      'Tailor': {
        path: null,  // 第三方开源项目
        description: 'Tailor - AI视频智能裁剪工具，支持人脸剪辑、背景更换、清晰度优化等13种方法',
        type: '视频处理工具',
        category: '开源项目',
        isSystem: true,
        isExternal: true,
        github: 'https://github.com/FutureUniant/Tailor',
        features: ['人脸剪辑', '语音剪辑', '口播生成', '字幕生成', '背景更换', '黑白上色', '清晰度优化']
      }
    };
    return modules[moduleName] || null;
  }

  /**
   * 加载 Skill 内容
   */
  loadSkill(skillName) {
    const skill = this.skills.find((s) => s.name === skillName);
    if (!skill) {return null;}

    try {
      const content = fs.readFileSync(skill.path, 'utf8');
      return {
        ...skill,
        content
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * 按分类获取 Skills
   */
  getByCategory(category) {
    return this.categories[category] || [];
  }

  /**
   * 获取所有分类
   */
  getCategories() {
    return Object.keys(this.categories);
  }

  /**
   * 智能决策 - 判断使用自有系统、第三方 Skills 或组合
   * @param {string} input - 用户输入
   * @returns {object} 决策结果
   */
  decide(input) {
    const results = {
      recommendation: null,
      reason: '',
      options: [],
      combine: false,
      analysis: {},
      customSystems: [],
      skills: []
    };

    const inputLower = input.toLowerCase();
    const _words = inputLower.split(/\s+/);

    // 1. 分析输入特征
    results.analysis = this._analyzeInput(input);

    // 2. 匹配自有系统
    const matchedSystems = this._matchCustomSystems(input, results.analysis);
    results.customSystems = matchedSystems;

    // 3. 匹配第三方 Skills
    const matchedSkills = this._matchSkills(input);
    results.skills = matchedSkills;

    // 4. 智能决策
    const decision = this._makeDecision(matchedSystems, matchedSkills, results.analysis);
    results.recommendation = decision.recommendation;
    results.reason = decision.reason;
    results.combine = decision.combine;
    results.options = decision.options;

    return results;
  }

  /**
   * 分析输入特征
   */
  _analyzeInput(input) {
    const _inputLower = input.toLowerCase();
    return {
      // 平台特征
      isDomestic: /抖音|B站|小红书|微博/.test(input),
      isVideo: /视频|抖音|B站|youtube/.test(input),
      isSocial: /微博|twitter|x\.com|小红书/.test(input),
      isEcommerce: /电商|淘宝|京东|拼多多/.test(input),

      // 任务特征
      isLargeScale: /批量|大规模|爬取全部|抓取整个/.test(input),
      isDeepCrawl: /深度|递归|多层/.test(input),
      isLLMOutput: /markdown|结构化|llm/.test(input),
      isAntiDetect: /反检测|stealth|隐藏/.test(input),
      isAPI: /api|接口/.test(input),
      isSimple: /简单|单个|一条/.test(input),

      // 工具指定
      isSpecificTool: /crawl4ai|scrapling|selenium|playwright|firecrawl|easyspider/.test(input),
      isCustomSystem: /拾号|我的|自有/.test(input),

      // 任务类型（可扩展）
      isAnalysis: /分析|统计|报表/.test(input),
      isGeneration: /生成|创作|写作/.test(input),
      isSearch: /搜索|查询|检索/.test(input)
    };
  }

  /**
   * 匹配自有系统
   */
  _matchCustomSystems(input, analysis) {
    const matches = [];
    const inputLower = input.toLowerCase();

    for (const [_name, system] of this.customSystems) {
      let score = 0;
      const reasons = [];

      // 关键词匹配
      for (const kw of system.keywords) {
        if (inputLower.includes(kw.toLowerCase())) {
          score += 1;
          reasons.push(`包含关键词: ${kw}`);
        }
      }

      // 特征匹配
      if (system.features) {
        if (analysis.isDomestic && system.features.isDomestic) {
          score += 0.5;
          reasons.push('匹配国内平台');
        }
        if (analysis.isVideo && system.features.isVideo) {
          score += 0.3;
          reasons.push('匹配视频内容');
        }
      }

      if (score > 0) {
        matches.push({
          ...system,
          score,
          reasons,
          matchType: 'custom-system'
        });
      }
    }

    // 按分数排序
    matches.sort((a, b) => b.score - a.score);
    return matches;
  }

  /**
   * 匹配第三方 Skills
   */
  _matchSkills(input) {
    const matched = [];
    const recognized = this.recognize(input, { topN: 10 });

    for (const r of recognized) {
      if (!r.skill.isCustomModule) {
        matched.push({
          name: r.skill.name,
          description: r.skill.description,
          category: r.skill.category,
          score: r.score,
          matchType: r.match || 'skill'  // 保留原始匹配类型
        });
      }
    }
    return matched;
  }

  /**
   * 做出决策
   */
  _makeDecision(customSystems, skills, analysis) {
    const options = [];

    // 1. 自有系统优先（得分>=3）
    if (customSystems.length > 0) {
      const best = customSystems[0];
      options.push({
        type: best.type || '自有系统',
        name: best.name,
        reason: best.description,
        score: best.score,
        matchType: 'keyword'  // 自有系统也作为关键词匹配
      });
    }

    // 2. 第三方 Skills - 保留原始匹配类型
    if (skills.length > 0) {
      for (const skill of skills) {
        const isKeywordMatch = skill.matchType === 'keyword';
        options.push({
          type: 'Skill',
          name: skill.name,
          reason: skill.description,
          score: isKeywordMatch ? 1.0 : skill.score * 0.8,  // 关键词精确匹配给满分
          matchType: skill.matchType || 'skill'
        });
      }
    }

    // 3. 组合方案
    if (analysis.isLargeScale || analysis.isDeepCrawl) {
      if (customSystems.length > 0 && skills.length > 0) {
        options.push({
          type: '组合',
          name: `${customSystems[0].name} + ${skills[0].name}`,
          reason: '大规模任务需要多种工具协同',
          score: 0.7,
          combine: true
        });
      }
    }

    // 关键词精确匹配优先 - 使用 recognize 返回的顺序
    const keywordMatches = options.filter((o) => o.matchType === 'keyword');
    if (keywordMatches.length > 0) {
      return {
        recommendation: { type: 'Skill', name: keywordMatches[0].name },
        reason: `推荐: ${keywordMatches[0].name}`,
        combine: false,
        options
      };
    }

    // 排序
    options.sort((a, b) => b.score - a.score);

    // 生成推荐
    const best = options[0] || { type: '未知', name: '待定', reason: '无法判断' };
    let reason;
    let combine = false;

    if (best.matchType === 'custom-system') {
      reason = `推荐使用自有系统 ${best.name}：${best.reason}`;
    } else if (best.combine) {
      reason = `推荐组合使用：${best.name}`;
      combine = true;
    } else {
      reason = `推荐使用 Skill: ${best.name}`;
    }

    return {
      recommendation: { type: best.type, name: best.name },
      reason,
      combine,
      options
    };
  }

  /**
   * 兼容旧接口
   */
  decideCrawler(input) {
    const _inputLower = input.toLowerCase();
    const results = {
      recommendation: null,
      reason: '',
      options: [],
      combine: false,
      analysis: {}
    };

    // 分析输入特征
    const features = {
      isDomestic: /抖音|B站|小红书|微博/.test(input),  // 国内平台
      isVideo: /视频|抖音|B站|youtube|视频下载/.test(input),
      isSocial: /微博|twitter|x\.com|小红书/.test(input),
      isEcommerce: /电商|淘宝|京东|拼多多/.test(input),
      isNews: /新闻|资讯/.test(input),
      isSpecificTool: /crawl4ai|scrapling|selenium|playwright|firecrawl|easyspider/.test(input),
      isLargeScale: /批量|大规模|爬取全部|抓取整个/.test(input),
      isDeepCrawl: /深度|递归|多层/.test(input),
      isLLMOutput: /markdown|结构化|llm/.test(input),
      isAntiDetect: /反检测| stealth |隐藏/.test(input),
      isAPI: /api|接口/.test(input),
      isSimple: /简单|单个|一条/.test(input)
    };
    results.analysis = features;

    // 决策逻辑
    const options = [];

    // 场景1: 国内平台 → 拾号-爬虫
    if (features.isDomestic) {
      options.push({
        type: '拾号-爬虫',
        name: 'DynamicScraper',
        reason: '国内平台，拾号-爬虫有针对性优化',
        score: 1.0
      });
    }

    // 场景2: 通用抓取 → 拾号-爬虫
    if (/抓取|爬取|网页|数据/.test(input) && !features.isSpecificTool) {
      options.push({
        type: '拾号-爬虫',
        name: 'DynamicScraper',
        reason: '通用网页抓取，拾号-爬虫是首选',
        score: 0.9
      });
    }

    // 场景3: 显式指定第三方工具
    if (features.isSpecificTool) {
      if (/crawl4ai/.test(input)) {
        options.push({
          type: 'Skill',
          name: 'crawl4ai-patterns',
          reason: 'Crawl4AI 适合 LLM 友好输出',
          score: 1.0
        });
      }
      if (/scrapling/.test(input)) {
        options.push({
          type: 'Skill',
          name: 'scrapling',
          reason: 'Scrapling 擅长反爬绕过',
          score: 1.0
        });
      }
      if (/selenium/.test(input)) {
        options.push({
          type: 'Skill',
          name: 'seleniumbase-patterns',
          reason: 'Selenium 适合复杂交互',
          score: 1.0
        });
      }
      if (/playwright/.test(input)) {
        options.push({
          type: 'Skill',
          name: 'browser-automation',
          reason: 'Playwright 浏览器自动化',
          score: 1.0
        });
      }
      if (/easyspider/.test(input)) {
        options.push({
          type: 'Skill',
          name: 'easyspider-patterns',
          reason: 'EasySpider 可视化流程',
          score: 1.0
        });
      }
    }

    // 场景4: 大规模/深度爬取 → 两者结合
    if (features.isLargeScale || features.isDeepCrawl) {
      options.push({
        type: '组合',
        name: '拾号-爬虫 + crawl4ai',
        reason: '大规模爬取需要多种工具协同',
        score: 0.8,
        combine: true
      });
    }

    // 场景5: 简单任务 → 拾号-爬虫
    if (features.isSimple) {
      options.push({
        type: '拾号-爬虫',
        name: 'DynamicScraper',
        reason: '简单任务用拾号-爬虫更高效',
        score: 0.95
      });
    }

    // 排序并选择最优
    options.sort((a, b) => b.score - a.score);
    results.options = options;

    // 推荐最优方案
    if (options.length > 0) {
      const best = options[0];
      results.recommendation = {
        type: best.type,
        name: best.name,
        reason: best.reason
      };
      results.combine = best.combine || false;

      // 生成理由
      if (best.type === '拾号-爬虫') {
        results.reason = `推荐使用拾号-爬虫系统：${best.reason}`;
      } else if (best.combine) {
        results.reason = `推荐组合使用：${best.reason}`;
      } else {
        results.reason = `推荐使用 ${best.name}：${best.reason}`;
      }
    }

    // 默认推荐拾号-爬虫
    if (!results.recommendation) {
      results.recommendation = {
        type: '拾号-爬虫',
        name: 'DynamicScraper',
        reason: '默认推荐拾号-爬虫系统'
      };
      results.reason = '通用场景推荐使用拾号-爬虫系统';
    }

    return results;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      total: this.skills.length,
      categories: Object.keys(this.categories).length,
      byCategory: Object.fromEntries(
        Object.entries(this.categories).map(([k, v]) => [k, v.length])
      )
    };
  }
}

module.exports = SkillRecognizer;
