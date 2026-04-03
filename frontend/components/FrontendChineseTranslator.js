/**
 * 前端中文翻译拦截器 - Frontend Chinese Translation Interceptor
 * 
 * 功能特性:
 * - 浏览器端实时翻译
 * - DOM内容翻译(XSS防护)
 * - WebSocket消息翻译
 * - 本地缓存
 * - 流式翻译支持
 * 
 * 安全特性:
 * - DOM XSS防护
 * - 输入长度限制
 * - WebSocket安全劫持
 * - CSRF保护
 */

class FrontendChineseTranslator {
  constructor(options = {}) {
    // 输入验证
    if (options && typeof options !== 'object') {
      console.warn('[FrontendChineseTranslator] Invalid options, using defaults');
      options = {};
    }

    this.options = {
      // 翻译API地址(只允许相对路径或同源)
      apiEndpoint: this.validateEndpoint(options.apiEndpoint) || '/api/translate',
      // 启用自动翻译DOM
      autoTranslate: options.autoTranslate !== false,
      // 翻译属性
      translateAttributes: this.validateArray(options.translateAttributes, ['placeholder', 'title', 'alt', 'aria-label']),
      // 排除的类名
      excludeClasses: this.validateArray(options.excludeClasses, ['no-translate', 'code', 'formula']),
      // 排除的标签
      excludeTags: this.validateArray(options.excludeTags, ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'KBD', 'SAMP', 'VAR']),
      // 观察器配置
      observeChanges: options.observeChanges !== false,
      // 最大文本长度
      maxTextLength: Math.min(options.maxTextLength || 10000, 50000),
      // CSRF Token
      csrfToken: options.csrfToken || this.getCSRFToken(),
      // 回调
      onReady: typeof options.onReady === 'function' ? options.onReady : null,
      onTranslation: typeof options.onTranslation === 'function' ? options.onTranslation : null,
      onError: typeof options.onError === 'function' ? options.onError : null
    };

    // 翻译缓存
    this.cache = new Map();
    
    // MutationObserver
    this.observer = null;
    
    // 翻译队列
    this.queue = [];
    this.processing = false;

    // 初始化
    this.init();
  }

  /**
   * 验证API端点(防止SSRF)
   */
  validateEndpoint(endpoint) {
    if (!endpoint || typeof endpoint !== 'string') {
      return null;
    }
    // 只允许相对路径或同源
    if (endpoint.startsWith('//') || endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      const url = new URL(endpoint, window.location.origin);
      if (url.origin !== window.location.origin) {
        console.warn('[FrontendChineseTranslator] Cross-origin endpoint not allowed');
        return null;
      }
    }
    return endpoint;
  }

  /**
   * 验证数组输入
   */
  validateArray(arr, fallback) {
    if (!Array.isArray(arr)) return fallback;
    return arr.filter(item => typeof item === 'string').slice(0, 50);
  }

  /**
   * 获取CSRF Token
   */
  getCSRFToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
  }

  /**
   * XSS防护转义
   */
  escapeHTML(str) {
    if (typeof str !== 'string') return str;
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * 安全设置文本内容(XSS防护)
   */
  safeSetTextContent(node, text) {
    // 验证文本不包含危险内容
    const sanitized = this.sanitizeText(text);
    node.textContent = sanitized;
  }

  /**
   * 文本净化
   */
  sanitizeText(text) {
    if (typeof text !== 'string') return '';
    // 移除script标签和事件处理器
    return text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '');
  }

  /**
   * 初始化翻译器
   */
  init() {
    if (this.options.autoTranslate) {
      // 翻译现有内容
      this.translatePage();
      
      // 监听DOM变化
      if (this.options.observeChanges) {
        this.observeDOM();
      }
      
      // 监听WebSocket消息
      this.interceptWebSocket();
    }
    
    if (this.options.onReady) {
      this.options.onReady(this);
    }
  }

  /**
   * 翻译整个页面
   */
  async translatePage() {
    const elements = document.querySelectorAll('body *');
    for (const element of elements) {
      await this.translateElement(element);
    }
  }

  /**
   * 翻译单个元素
   */
  async translateElement(element) {
    if (!element || !element.tagName) return;
    
    // 检查是否排除
    if (this.shouldExclude(element)) return;
    
    // 翻译文本节点
    await this.translateTextNodes(element);
    
    // 翻译属性
    await this.translateAttributes(element);
  }

  /**
   * 翻译文本节点
   */
  async translateTextNodes(element) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (this.shouldExclude(node.parentElement)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent.trim()) {
        textNodes.push(node);
      }
    }

    for (const node of textNodes) {
      const original = node.textContent;
      const translated = await this.translate(original);
      if (translated && translated !== original) {
        // XSS防护: 使用安全方法设置文本
        this.safeSetTextContent(node, translated);
        if (this.options.onTranslation) {
          this.options.onTranslation({
            original,
            translated,
            element
          });
        }
      }
    }
  }

  /**
   * 翻译属性
   */
  async translateAttributes(element) {
    for (const attr of this.options.translateAttributes) {
      const value = element.getAttribute(attr);
      if (value && value.trim()) {
        const translated = await this.translate(value);
        if (translated && translated !== value) {
          element.setAttribute(attr, translated);
        }
      }
    }
  }

  /**
   * 翻译文本
   */
  async translate(text) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return text;
    }

    // 输入长度验证
    if (text.length > this.options.maxTextLength) {
      console.warn('[FrontendChineseTranslator] Text exceeds max length');
      return text;
    }

    // 检查缓存
    const cacheKey = text.trim();
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      
      // 添加CSRF Token
      if (this.options.csrfToken) {
        headers['X-CSRF-Token'] = this.options.csrfToken;
      }

      const response = await fetch(this.options.apiEndpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          text: text,
          targetLang: 'zh-CN'
        }),
        credentials: 'same-origin'
      });

      if (!response.ok) {
        throw new Error(`Translation failed: ${response.status}`);
      }

      const data = await response.json();
      // XSS防护: 确保翻译结果是安全的
      let translated = data.translated || data.text || text;
      if (typeof translated === 'string') {
        translated = this.escapeHTML(translated);
      }
      
      // 更新缓存
      this.cache.set(cacheKey, translated);
      if (this.cache.size > 1000) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }

      return translated;
    } catch (error) {
      console.warn('[FrontendChineseTranslator] Translation error:', error);
      if (this.options.onError) {
        this.options.onError(error);
      }
      return text;
    }
  }

  /**
   * 检查是否应该排除
   */
  shouldExclude(element) {
    if (!element || !element.tagName) return false;
    
    // 检查标签
    if (this.options.excludeTags.includes(element.tagName)) {
      return true;
    }
    
    // 检查类名
    for (const className of this.options.excludeClasses) {
      if (element.classList && element.classList.contains(className)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 观察DOM变化
   */
  observeDOM() {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.translateElement(node);
            } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
              this.queue.push(node);
            }
          }
        } else if (mutation.type === 'characterData') {
          if (mutation.target.textContent.trim()) {
            this.queue.push(mutation.target);
          }
        }
      }
      this.processQueue();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  /**
   * 处理翻译队列
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    // 限制队列大小
    const maxQueueSize = 100;
    while (this.queue.length > 0 && this.queue.length > this.queue.length - maxQueueSize) {
      this.queue.shift();
    }
    
    while (this.queue.length > 0) {
      const node = this.queue.shift();
      if (node && node.textContent) {
        const translated = await this.translate(node.textContent);
        if (translated && translated !== node.textContent) {
          // XSS防护
          this.safeSetTextContent(node, translated);
        }
      }
    }
    
    this.processing = false;
  }

  /**
   * 拦截WebSocket消息(安全版本)
   */
  interceptWebSocket() {
    if (this._wsIntercepted) return;
    
    const OriginalWebSocket = window.WebSocket;
    const self = this;
    
    // 检查是否已拦截
    if (OriginalWebSocket._intercepted) return;
    
    window.WebSocket = function(url, protocols) {
      // URL验证
      try {
        const parsedUrl = new URL(url);
        // 只允许同源WebSocket
        if (parsedUrl.origin !== window.location.origin && parsedUrl.protocol !== 'ws:' && parsedUrl.protocol !== 'wss:') {
          console.warn('[FrontendChineseTranslator] Cross-origin WebSocket not allowed');
          throw new Error('Cross-origin WebSocket not allowed');
        }
      } catch (e) {
        // 相对路径允许
      }
      
      const ws = protocols ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);
      
      // 保存原始方法引用
      const originalHandleMessage = ws.handleMessage;
      
      // 拦截消息
      ws.addEventListener('message', async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.message && typeof data.message === 'string') {
            const translated = await self.translate(data.message);
            data.message = translated;
            data._translated = true;
            
            // 创建新的事件
            const newEvent = new MessageEvent('message', {
              data: JSON.stringify(data),
              origin: event.origin,
              lastEventId: event.lastEventId,
              source: event.source,
              bubbles: event.bubbles,
              cancelable: event.cancelable,
              composed: event.composed
            });
            
            // 分发新事件
            ws.dispatchEvent(newEvent);
            return;
          }
        } catch (e) {
          // 如果解析失败，保持原样
        }
        
        // 如果不是翻译消息，原始分发
        if (originalHandleMessage) {
          originalHandleMessage.call(ws, event);
        }
      });
      
      return ws;
    };

    // 完整复制原型
    window.WebSocket.prototype = OriginalWebSocket.prototype;
    window.WebSocket.prototype.constructor = window.WebSocket;
    
    // 复制静态属性
    window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    window.WebSocket.OPEN = OriginalWebSocket.OPEN;
    window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
    window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
    
    // 标记已拦截
    window.WebSocket._intercepted = true;
    this._wsIntercepted = true;
  }

  /**
   * 停止翻译
   */
  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * 手动添加翻译
   */
  addTranslation(original, translated) {
    this.cache.set(original.trim(), translated);
  }
}

// 自动初始化
if (typeof window !== 'undefined') {
  window.FrontendChineseTranslator = FrontendChineseTranslator;
  
  // 如果有data-chinese-translate属性，自动初始化
  document.addEventListener('DOMContentLoaded', () => {
    const configElement = document.querySelector('[data-chinese-translate]');
    if (configElement) {
      try {
        const config = JSON.parse(configElement.dataset.chineseTranslate || '{}');
        window.translator = new FrontendChineseTranslator(config);
      } catch (e) {
        window.translator = new FrontendChineseTranslator();
      }
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FrontendChineseTranslator;
}
