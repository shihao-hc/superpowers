/**
 * 中文翻译拦截器 - Chinese Translation Interceptor
 * 
 * 功能特性:
 * - 实时翻译AI回复为中文
 * - 保留专业术语和代码
 * - 上下文感知翻译
 * - 术语表支持
 * - 批量翻译
 * 
 * 基于 i18n-actions/ai-i18n 和 ShermanTsang/i18n-translator 设计
 */

class ChineseTranslationInterceptor {
  constructor(options = {}) {
    // 输入验证
    if (options && typeof options !== 'object') {
      throw new Error('Options must be an object');
    }

    // 限制文本长度防止DoS
    const maxTextLength = options.maxTextLength || 50000;
    const maxCacheSize = Math.min(options.cacheSize || 1000, 10000);
    const maxRetries = Math.min(options.maxRetries || 3, 5);

    this.options = {
      // 翻译引擎: 'openai' | 'deepl' | 'google' | 'local'
      engine: this.validateEngine(options.engine),
      // API配置
      apiKey: options.apiKey || process.env.TRANSLATION_API_KEY,
      // 目标语言
      targetLang: this.validateLanguage(options.targetLang, 'zh-CN'),
      // 源语言
      sourceLang: this.validateLanguage(options.sourceLang, 'auto'),
      // 保留术语不翻译
      preserveTerms: this.validateArray(options.preserveTerms),
      // 术语表 {英文: 中文}
      terminology: this.validateObject(options.terminology, {}),
      // 保留代码块
      preserveCode: options.preserveCode !== false,
      // 保留Markdown格式
      preserveMarkdown: options.preserveMarkdown !== false,
      // 批量翻译延迟(ms)
      batchDelay: Math.min(options.batchDelay || 100, 5000),
      // 最大重试次数
      maxRetries: maxRetries,
      // 缓存翻译结果
      enableCache: options.enableCache !== false,
      // 缓存大小
      cacheSize: maxCacheSize,
      // 最大文本长度
      maxTextLength: maxTextLength,
      // 流式翻译
      streaming: options.streaming || false,
      // 回调
      onTranslation: typeof options.onTranslation === 'function' ? options.onTranslation : null,
      onError: typeof options.onError === 'function' ? options.onError : null
    };

    // 翻译缓存
    this.cache = new Map();
    
    // 批量翻译队列
    this.batchQueue = [];
    this.batchTimer = null;
    
    // 翻译统计
    this.stats = {
      totalTranslations: 0,
      cacheHits: 0,
      errors: 0,
      avgLatency: 0
    };

    // 默认术语表
    this.defaultTerminology = {
      // 技术术语
      'API': 'API',
      'WebSocket': 'WebSocket',
      'RESTful': 'RESTful',
      'CRUD': 'CRUD',
      'JSON': 'JSON',
      'HTML': 'HTML',
      'CSS': 'CSS',
      'JavaScript': 'JavaScript',
      'TypeScript': 'TypeScript',
      'Node.js': 'Node.js',
      'React': 'React',
      'Vue': 'Vue',
      'VRM': 'VRM',
      'Three.js': 'Three.js',
      'WebRTC': 'WebRTC',
      'TensorFlow': 'TensorFlow',
      'MediaPipe': 'MediaPipe',
      'TTS': 'TTS',
      'STT': 'STT',
      'LLM': 'LLM',
      'RAG': 'RAG',
      'JWT': 'JWT',
      'OAuth': 'OAuth',
      'CORS': 'CORS',
      'CDN': 'CDN',
      'SQL': 'SQL',
      'NoSQL': 'NoSQL',
      'Redis': 'Redis',
      'MongoDB': 'MongoDB',
      
      // 常用术语
      'GitHub': 'GitHub',
      'npm': 'npm',
      'Docker': 'Docker',
      'Kubernetes': 'Kubernetes',
      'CI/CD': 'CI/CD',
      'AI': 'AI',
      'ML': '机器学习',
      'GPU': 'GPU',
      'CPU': 'CPU',
      'RAM': '内存',
      
      // 项目特定术语
      'TradingAgents': 'TradingAgents',
      'UltraWork': 'UltraWork',
      'InkOS': 'InkOS',
      'VRMA': 'VRMA',
      'BVH': 'BVH',
      'BlendShape': 'BlendShape',
      'ChromaDB': 'ChromaDB',
      'ElevenLabs': 'ElevenLabs'
    };

    // 合并自定义术语
    this.terminology = { ...this.defaultTerminology, ...this.options.terminology };
    
    // 代码块正则
    this.codeBlockRegex = /```[\s\S]*?```|`[^`\n]+`/g;
    
    // Markdown格式正则
    this.markdownRegex = /(\*\*|__|[*_]|~~|#{1,6}\s|>\s|\[.*?\]\(.*?\)|!\[.*?\]\(.*?\)|-{3,}|\|.*\||- \[.*?\])/g;
  }

  /**
   * 验证翻译引擎
   */
  validateEngine(engine) {
    const validEngines = ['openai', 'deepl', 'google', 'local'];
    if (!engine || !validEngines.includes(engine)) {
      return 'openai';
    }
    return engine;
  }

  /**
   * 验证语言代码
   */
  validateLanguage(lang, fallback) {
    const validLangs = ['zh-CN', 'zh-TW', 'auto', 'en', 'ja', 'ko'];
    if (!lang || !validLangs.includes(lang)) {
      return fallback;
    }
    return lang;
  }

  /**
   * 验证数组输入
   */
  validateArray(arr) {
    if (!Array.isArray(arr)) return [];
    // 限制数组长度
    return arr.slice(0, 100).filter(item => typeof item === 'string');
  }

  /**
   * 验证对象输入(防止原型链污染)
   */
  validateObject(obj, fallback = {}) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return fallback;
    }
    const validated = {};
    for (const [key, value] of Object.entries(obj)) {
      // 跳过原型属性
      if (!Object.prototype.hasOwnProperty.call(Object.prototype, key)) {
        validated[key] = value;
      }
    }
    return validated;
  }

  /**
   * 翻译文本
   */
  async translate(text, context = {}) {
    if (!text || typeof text !== 'string') return text;
    
    // 输入长度验证
    if (text.length > this.options.maxTextLength) {
      throw new Error('Text exceeds maximum length');
    }
    
    // 防止空文本攻击
    if (!text.trim()) return text;
    
    const startTime = Date.now();
    
    try {
      // 检查缓存
      const cacheKey = this.getCacheKey(text);
      if (this.options.enableCache && this.cache.has(cacheKey)) {
        this.stats.cacheHits++;
        return this.cache.get(cacheKey);
      }

      // 提取需要保留的内容
      const preserved = this.extractPreservedContent(text);
      
      // 应用术语表替换
      let processed = this.applyTerminology(preserved.placeholderText);
      
      // 翻译
      let translated;
      switch (this.options.engine) {
        case 'openai':
          translated = await this.translateWithOpenAI(processed, context);
          break;
        case 'deepl':
          translated = await this.translateWithDeepL(processed, context);
          break;
        case 'google':
          translated = await this.translateWithGoogle(processed, context);
          break;
        case 'local':
          translated = this.translateLocal(processed);
          break;
        default:
          translated = await this.translateWithOpenAI(processed, context);
      }
      
      // 恢复保留的内容
      const result = this.restorePreservedContent(translated, preserved.placeholders);
      
      // 更新缓存
      if (this.options.enableCache) {
        this.cache.set(cacheKey, result);
        if (this.cache.size > this.options.cacheSize) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }
      }
      
      // 更新统计
      this.stats.totalTranslations++;
      this.stats.avgLatency = (this.stats.avgLatency * (this.stats.totalTranslations - 1) + (Date.now() - startTime)) / this.stats.totalTranslations;
      
      // 触发回调
      if (this.options.onTranslation) {
        this.options.onTranslation({ original: text, translated: result, latency: Date.now() - startTime });
      }
      
      return result;
      
    } catch (error) {
      this.stats.errors++;
      if (this.options.onError) {
        this.options.onError(error);
      }
      console.error('[ChineseTranslationInterceptor] Translation error:', error);
      return text; // 返回原文
    }
  }

  /**
   * 流式翻译
   */
  async *translateStream(textStream, context = {}) {
    let buffer = '';
    
    for await (const chunk of textStream) {
      buffer += chunk;
      
      // 检查是否到达断句点
      const sentences = this.splitSentences(buffer);
      if (sentences.length > 1) {
        for (let i = 0; i < sentences.length - 1; i++) {
          const translated = await this.translate(sentences[i], context);
          yield translated;
        }
        buffer = sentences[sentences.length - 1];
      }
    }
    
    // 处理剩余内容
    if (buffer.trim()) {
      const translated = await this.translate(buffer, context);
      yield translated;
    }
  }

  /**
   * 批量翻译
   */
  async translateBatch(texts, context = {}) {
    const results = await Promise.all(
      texts.map(text => this.translate(text, context))
    );
    return results;
  }

  /**
   * 提取需要保留的内容(代码块、专业术语等)
   */
  extractPreservedContent(text) {
    const placeholders = {};
    let counter = 0;
    let placeholderText = text;

    // 提取代码块
    if (this.options.preserveCode) {
      placeholderText = placeholderText.replace(this.codeBlockRegex, (match) => {
        const placeholder = `__PRESERVED_${counter++}__`;
        placeholders[placeholder] = match;
        return placeholder;
      });
    }

    // 提取保留术语
    for (const term of this.options.preserveTerms) {
      const regex = new RegExp(`\\b${this.escapeRegex(term)}\\b`, 'gi');
      placeholderText = placeholderText.replace(regex, (match) => {
        const placeholder = `__PRESERVED_${counter++}__`;
        placeholders[placeholder] = match;
        return placeholder;
      });
    }

    // 提取URL
    const urlRegex = /https?:\/\/[^\s)]+/g;
    placeholderText = placeholderText.replace(urlRegex, (match) => {
      const placeholder = `__PRESERVED_${counter++}__`;
      placeholders[placeholder] = match;
      return placeholder;
    });

    // 提取邮箱
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    placeholderText = placeholderText.replace(emailRegex, (match) => {
      const placeholder = `__PRESERVED_${counter++}__`;
      placeholders[placeholder] = match;
      return placeholder;
    });

    return { placeholderText, placeholders };
  }

  /**
   * 恢复保留的内容
   */
  restorePreservedContent(text, placeholders) {
    let result = text;
    for (const [placeholder, original] of Object.entries(placeholders)) {
      result = result.replace(placeholder, original);
    }
    return result;
  }

  /**
   * 应用术语表
   */
  applyTerminology(text) {
    let result = text;
    for (const [term, translation] of Object.entries(this.terminology)) {
      if (term !== translation) {
        const regex = new RegExp(`\\b${this.escapeRegex(term)}\\b`, 'g');
        result = result.replace(regex, translation);
      }
    }
    return result;
  }

  /**
   * 使用OpenAI翻译
   */
  async translateWithOpenAI(text, context = {}) {
    const apiKey = this.options.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const systemPrompt = `你是一个专业的中英翻译专家。将以下内容翻译成${this.options.targetLang === 'zh-CN' ? '简体中文' : '中文'}。
要求:
1. 保持原文的格式和结构
2. 技术术语保持英文或使用行业标准译法
3. 代码块和Markdown格式保持不变
4. 翻译自然流畅，符合中文表达习惯
5. 保留所有专业术语（如API、WebSocket等）的英文形式

${context.domain ? `领域背景: ${context.domain}` : ''}
${context.style ? `翻译风格: ${context.style}` : ''}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.3,
        max_tokens: 4096
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  /**
   * 使用DeepL翻译
   */
  async translateWithDeepL(text, context = {}) {
    const apiKey = this.options.apiKey || process.env.DEEPL_API_KEY;
    if (!apiKey) {
      throw new Error('DeepL API key not configured');
    }

    const params = new URLSearchParams({
      auth_key: apiKey,
      text: text,
      target_lang: 'ZH',
      source_lang: this.options.sourceLang === 'auto' ? 'EN' : this.options.sourceLang.toUpperCase()
    });

    const response = await fetch('https://api.deepl.com/v2/translate', {
      method: 'POST',
      body: params
    });

    if (!response.ok) {
      throw new Error(`DeepL API error: ${response.status}`);
    }

    const data = await response.json();
    return data.translations[0].text;
  }

  /**
   * 使用Google翻译
   */
  async translateWithGoogle(text, context = {}) {
    // Google Translate API (需要API key)或使用免费接口
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${this.options.sourceLang === 'auto' ? 'en' : this.options.sourceLang}&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google Translate error: ${response.status}`);
    }

    const data = await response.json();
    return data[0].map(item => item[0]).join('');
  }

  /**
   * 本地翻译(简单词典映射)
   */
  translateLocal(text) {
    // 简单的本地翻译实现，适用于已知模式
    const patterns = [
      { en: /hello|hi|hey/gi, zh: '你好' },
      { en: /thank you|thanks/gi, zh: '谢谢' },
      { en: /please/gi, zh: '请' },
      { en: /sorry|apologize/gi, zh: '抱歉' },
      { en: /yes|ok|okay/gi, zh: '好的' },
      { en: /no/gi, zh: '不' },
      { en: /error/gi, zh: '错误' },
      { en: /success/gi, zh: '成功' },
      { en: /failed/gi, zh: '失败' },
      { en: /loading/gi, zh: '加载中' },
      { en: /completed/gi, zh: '已完成' },
      { en: /processing/gi, zh: '处理中' }
    ];

    let result = text;
    for (const pattern of patterns) {
      result = result.replace(pattern.en, pattern.zh);
    }
    return result;
  }

  /**
   * 分割句子
   */
  splitSentences(text) {
    const sentences = [];
    let current = '';
    const sentenceEnders = /[.!?。！？]\s*/g;
    let match;
    
    while ((match = sentenceEnders.exec(text)) !== null) {
      current += text.slice(current.length, match.index + match[0].length);
      sentences.push(current);
      current = '';
    }
    
    if (current || text.slice(sentences.join('').length)) {
      sentences.push(text.slice(sentences.join('').length));
    }
    
    return sentences.filter(s => s.trim());
  }

  /**
   * 转义正则表达式
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 生成缓存键
   */
  getCacheKey(text) {
    return text.slice(0, 100) + '_' + this.options.targetLang;
  }

  /**
   * 添加术语
   */
  addTerminology(term, translation) {
    this.terminology[term] = translation;
  }

  /**
   * 批量添加术语
   */
  addTerminologies(terms) {
    Object.assign(this.terminology, terms);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * 创建Express中间件
   */
  createExpressMiddleware() {
    return async (req, res, next) => {
      // 检查是否需要翻译
      const acceptLang = req.headers['accept-language'] || '';
      const needsTranslation = acceptLang.includes('zh');
      
      if (!needsTranslation) {
        return next();
      }

      // 保存原始的json方法
      const originalJson = res.json.bind(res);
      
      // 重写json方法以拦截响应
      res.json = async (body) => {
        if (body && typeof body === 'object') {
          if (body.message && typeof body.message === 'string') {
            body.message = await this.translate(body.message, { endpoint: req.path });
          }
          if (body.data && typeof body.data === 'object') {
            body.data = await this.translateObject(body.data, { endpoint: req.path });
          }
        }
        return originalJson(body);
      };
      
      next();
    };
  }

  /**
   * 递归翻译对象(防止原型链污染)
   */
  async translateObject(obj, context = {}) {
    // 防止原型链污染
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    
    // 限制嵌套深度
    const maxDepth = 10;
    if (context.depth && context.depth > maxDepth) {
      return obj;
    }
    const newContext = { ...context, depth: (context.depth || 0) + 1 };
    
    if (Array.isArray(obj)) {
      // 限制数组长度
      if (obj.length > 1000) {
        obj = obj.slice(0, 1000);
      }
      return Promise.all(obj.map(item => this.translateObject(item, newContext)));
    }
    
    const translated = {};
    let keyCount = 0;
    
    for (const [key, value] of Object.entries(obj)) {
      // 跳过原型属性
      if (!Object.prototype.hasOwnProperty.call(obj, key)) {
        continue;
      }
      
      // 限制键数量
      if (++keyCount > 500) {
        break;
      }
      
      // 键名安全验证(只允许字母数字下划线)
      if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
        continue;
      }
      
      translated[key] = await this.translateObject(value, newContext);
    }
    
    return translated;
  }
}

module.exports = ChineseTranslationInterceptor;
