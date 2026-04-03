/**
 * 拾号-影视 核心逻辑
 */

const App = {
  // API代理基础路径
  PROXY_BASE: '/proxy',
  DETAIL_PROXY: '/detail',
  TEST_SOURCE: '/test-source',

  // 当前状态
  currentCategory: null,
  currentPage: 1,
  totalPages: 1,
  isLoading: false,
  
  // 性能优化：缓存系统
  cache: {
    data: new Map(),
    maxSize: 100,
    ttl: 5 * 60 * 1000, // 5分钟缓存
    
    set(key, value) {
      if (this.data.size >= this.maxSize) {
        // 删除最旧的缓存
        const firstKey = this.data.keys().next().value;
        this.data.delete(firstKey);
      }
      
      this.data.set(key, {
        value,
        timestamp: Date.now()
      });
    },
    
    get(key) {
      const item = this.data.get(key);
      if (!item) return null;
      
      if (Date.now() - item.timestamp > this.ttl) {
        this.data.delete(key);
        return null;
      }
      
      return item.value;
    },
    
    clear() {
      this.data.clear();
    }
  },
  
  // 性能监控
  performance: {
    metrics: {},
    
    start(name) {
      this.metrics[name] = performance.now();
    },
    
    end(name) {
      if (this.metrics[name]) {
        const duration = performance.now() - this.metrics[name];
        console.log(`[性能] ${name}: ${duration.toFixed(2)}ms`);
        delete this.metrics[name];
        return duration;
      }
      return 0;
    }
  },

  /**
   * 获取代理URL
   */
  getProxyUrl(targetUrl) {
    return `${this.PROXY_BASE}?url=${encodeURIComponent(targetUrl)}`;
  },

  /**
   * 获取详情代理URL
   */
  getDetailProxyUrl(targetUrl) {
    return `${this.DETAIL_PROXY}?url=${encodeURIComponent(targetUrl)}`;
  },

  /**
   * 获取数据源列表（带缓存）
   */
  async fetchList(categoryId = null, page = 1) {
    this.performance.start('fetchList');
    
    const source = Storage.getCurrentSource();
    if (!source) {
      throw new Error('未配置数据源，请先前往设置页面添加');
    }

    // 生成缓存键
    const cacheKey = `list_${source.id}_${categoryId}_${page}`;
    const cachedData = this.cache.get(cacheKey);
    
    if (cachedData) {
      console.log('使用缓存数据:', cacheKey);
      this.performance.end('fetchList');
      return cachedData;
    }

    let url = `${source.apiUrl}?ac=list&pg=${page}`;
    if (categoryId) {
      url += `&t=${categoryId}`;
    }

    const proxyUrl = this.getProxyUrl(url);
    
    try {
      const response = await fetch(proxyUrl, {
        signal: AbortSignal.timeout(10000) // 10秒超时
      });
      
      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }
      
      const data = await response.json();

      if (data.code !== 1) {
        throw new Error('获取列表失败');
      }

      const result = {
        list: data.list || [],
        page: data.page || 1,
        pageCount: data.pagecount || 1,
        total: data.total || 0,
        categories: data.class || []
      };
      
      // 缓存结果
      this.cache.set(cacheKey, result);
      
      this.performance.end('fetchList');
      return result;
    } catch (error) {
      this.performance.end('fetchList');
      console.error('获取列表失败:', error);
      
      if (error.name === 'AbortError') {
        throw new Error('请求超时，请检查网络连接');
      }
      
      throw error;
    }
  },

  /**
   * 搜索视频
   */
  async search(keyword, page = 1) {
    const source = Storage.getCurrentSource();
    if (!source) {
      throw new Error('未配置数据源');
    }

    const url = `${source.apiUrl}?ac=list&wd=${encodeURIComponent(keyword)}&pg=${page}`;
    const proxyUrl = this.getProxyUrl(url);
    const response = await fetch(proxyUrl);
    const data = await response.json();

    if (data.code !== 1) {
      throw new Error('搜索失败');
    }

    return {
      list: data.list || [],
      page: data.page || 1,
      pageCount: data.pagecount || 1,
      total: data.total || 0
    };
  },

  /**
   * 获取视频详情（带缓存和重试）
   */
    async getDetail(videoId, retryCount = 0) {
    this.performance.start('getDetail');
    
    const source = Storage.getCurrentSource();
    if (!source) {
      throw new Error('未配置数据源，请先在设置页面添加数据源');
    }

    // 生成缓存键
    const cacheKey = `detail_${source.id}_${videoId}`;
    const cachedData = this.cache.get(cacheKey);
    
    if (cachedData) {
      console.log('使用缓存详情:', cacheKey);
      this.performance.end('getDetail');
      return cachedData;
    }

    const url = `${source.apiUrl}?ac=detail&ids=${videoId}`;
    console.log('获取详情:', url);
    
    const proxyUrl = this.getDetailProxyUrl(url);
    
    try {
      const response = await fetch(proxyUrl, {
        signal: AbortSignal.timeout(15000) // 15秒超时
      });
      
      if (!response.ok) {
        throw new Error(`网络错误: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('详情响应:', data);

      if (data.code !== 1) {
        throw new Error(`接口返回异常: ${data.msg || '未知错误'}`);
      }
      
      if (!data.list || data.list.length === 0) {
        // 后端未返回有效数据，使用前端模拟数据作为兜底，确保前端仍可工作
        console.warn('未找到该视频信息，使用前端Mock数据兜底');
        return this.getMockDetail(videoId);
      }

      const result = data.list[0];
      
      // 缓存结果
      this.cache.set(cacheKey, result);
      
      this.performance.end('getDetail');
      return result;
    } catch (err) {
      this.performance.end('getDetail');
      console.error('获取详情错误:', err);

      // 自动重试逻辑
      if (retryCount < 2 && !err.message.includes('未找到')) {
        console.log(`重试获取详情 (${retryCount + 1}/2)...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return this.getDetail(videoId, retryCount + 1);
      }
      
      if (err.name === 'AbortError') {
        throw new Error('请求超时，请稍后重试');
      }
      
      if (err.message.includes('Failed to fetch')) {
        throw new Error('网络连接失败，请检查网络');
      }
      
      throw err;
    }
  },

  // 前端兜底：无后端时的演示详情数据
  getMockDetail(videoId) {
    // 简单的演示数据结构，字段名尽量与后端返回字段对齐
    const mock = {
      vod_id: videoId,
      vod_name: '示例视频 (无后端数据)',
      vod_pic: '',
      vod_year: '',
      vod_area: '',
      vod_lang: '',
      type_name: '电影',
      vod_actor: '演员A, 演员B',
      vod_director: '导演X',
      vod_content: '演示数据：当前为前端兜底测试使用。',
      vod_play_from: '源1',
      vod_play_url: '集1$https://example.com/demo.m3u8',
    };
    // 直接返回对象，loadDetail 会把它渲染到界面
    return mock;
  },

  /**
   * 解析播放地址
   */
  parsePlayUrls(playFrom, playUrl) {
    const sources = [];
    const fromNames = playFrom.split('$$$');
    const urlParts = playUrl.split('$$$');

    for (let i = 0; i < urlParts.length; i++) {
      const name = fromNames[i] || `源${i + 1}`;
      const episodes = this.parseEpisodes(urlParts[i]);
      
      // 检查是否为m3u8源
      const hasM3u8 = episodes.some(ep => ep.url.includes('.m3u8'));
      
      sources.push({
        name,
        episodes,
        isM3u8: hasM3u8 || name.toLowerCase().includes('m3u8')
      });
    }

    // 优先返回m3u8源
    const m3u8Sources = sources.filter(s => s.isM3u8);
    const otherSources = sources.filter(s => !s.isM3u8);

    return [...m3u8Sources, ...otherSources];
  },

  /**
   * 解析剧集列表
   */
  parseEpisodes(urlString) {
    const episodes = [];
    const parts = urlString.split('#');

    for (const part of parts) {
      if (!part.trim()) continue;
      
      const dollarIndex = part.indexOf('$');
      if (dollarIndex === -1) continue;

      const name = part.substring(0, dollarIndex).trim();
      const url = part.substring(dollarIndex + 1).trim();

      if (name && url) {
        episodes.push({ name, url });
      }
    }

    return episodes;
  },

  // 海报图片缓存
  posterCache: {},

  /**
   * 渲染视频卡片（支持懒加载海报和骨架屏）- XSS安全版
   */
  renderVideoCard(video, onclick) {
    const source = Storage.getCurrentSource();
    const sourceId = source ? source.id : null;
    const isFav = Storage.isFavorite(video.id, sourceId);
    
    // 生成唯一标识
    const uid = `${sourceId}_${video.vod_id}`;
    
    // 检查是否有缓存的海报
    const cacheKey = `poster_${video.vod_id}`;
    const cachedPic = localStorage.getItem(cacheKey);
    const hasCachedPoster = !!cachedPic;

    // 转义用户数据，防止XSS
    const safeVodName = this.escapeHtml(video.vod_name);
    const safeTypeName = video.type_name ? this.escapeHtml(video.type_name) : '';
    const safeRemarks = video.vod_remarks ? this.escapeHtml(video.vod_remarks) : '';
    const safeEncodedPic = cachedPic ? encodeURIComponent(cachedPic) : '';

    return `
      <div class="video-card hover-lift card-shine fade-in" data-id="${video.id}" data-uid="${uid}" ${onclick ? `onclick="${onclick}(${video.id})"` : ''} aria-label="视频：${safeVodName}">
        <div class="video-poster skeleton-poster" data-video-id="${video.vod_id}">
          ${hasCachedPoster ? 
            `<img src="/image?url=${safeEncodedPic}" alt="${safeVodName}" class="poster-img" onerror="this.parentElement.innerHTML='<div class=\\'placeholder poster-placeholder\\'>🎬</div>'">` :
            `<div class="placeholder poster-placeholder skeleton">🎬</div>`
          }
          <div class="video-overlay">
            <div class="play-btn">▶</div>
          </div>
        </div>
        <div class="video-info">
          <div class="video-title" title="${safeVodName}">${safeVodName}</div>
          <div class="video-meta">
            ${safeTypeName ? `<span>${safeTypeName}</span>` : ''}
            ${safeRemarks ? `<span class="video-tag">${safeRemarks}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 异步加载海报图片
   */
  async loadPosters(videoIds) {
    const source = Storage.getCurrentSource();
    if (!source || !videoIds.length) return;
    
    const needLoad = videoIds.filter(id => !this.posterCache[`${source.id}_${id}`]);
    if (needLoad.length === 0) return;
    
    try {
      // 分批请求详情，每次最多5个
      const batchSize = 5;
      for (let i = 0; i < needLoad.length; i += batchSize) {
        const batch = needLoad.slice(i, i + batchSize);
        const url = `${source.apiUrl}?ac=detail&ids=${batch.join(',')}`;
        const proxyUrl = this.getDetailProxyUrl(url);
        
        fetch(proxyUrl)
          .then(r => r.json())
          .then(data => {
            if (data.code === 1 && data.list) {
              data.list.forEach(item => {
                const uid = `${source.id}_${item.vod_id}`;
                this.posterCache[uid] = item.vod_pic || '';
                this.updatePosterInDOM(uid, item.vod_pic);
              });
            }
          })
          .catch(err => console.log('海报加载失败:', err));
      }
    } catch (error) {
      console.log('海报批量加载失败:', error);
    }
  },

  /**
   * 更新DOM中的海报图片（通过代理加载）
   */
  updatePosterInDOM(uid, picUrl) {
    if (!picUrl) return;
    
    const card = document.querySelector(`[data-uid="${uid}"]`);
    if (!card) return;
    
    const img = card.querySelector('.poster-img');
    const placeholder = card.querySelector('.poster-placeholder');
    
    if (img) {
      // 通过代理加载图片
      const proxyImageUrl = `/image?url=${encodeURIComponent(picUrl)}`;
      img.src = proxyImageUrl;
      img.style.display = 'block';
      img.onerror = function() {
        this.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
      };
      if (placeholder) placeholder.style.display = 'none';
    }
  },

  /**
   * HTML转义函数 - 防止XSS攻击
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * 安全的HTML模板字面量转义
   */
  safeHtml(strings, ...values) {
    let result = strings[0];
    for (let i = 0; i < values.length; i++) {
      result += this.escapeHtml(values[i]) + strings[i + 1];
    }
    return result;
  },

  /**
   * 显示Toast通知（优化版）
   */
  showToast(message, type = 'info', duration = 2500) {
    // 移除现有的toast
    const existingToast = document.querySelector('.toast, .notification');
    if (existingToast) {
      existingToast.remove();
    }

    // 创建新的通知
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span>${this.getNotificationIcon(type)}</span>
        <span>${message}</span>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // 显示动画
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    // 自动隐藏
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, duration);
  },
  
  getNotificationIcon(type) {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type] || icons.info;
  },

  /**
   * 显示加载状态
   */
  showLoading(container) {
    container.innerHTML = `
      <div class="loading">
        <div class="loading-spinner"></div>
        <div class="loading-text">加载中...</div>
      </div>
    `;
  },

  /**
   * 显示空状态
   */
  showEmpty(container, message = '暂无数据') {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-title">${message}</div>
      </div>
    `;
  },

  /**
   * 显示错误状态
   */
  showError(container, message, retryCallback) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">❌</div>
        <div class="empty-title">加载失败</div>
        <div class="empty-desc">${message}</div>
        ${retryCallback ? `<button class="btn btn-primary" onclick="${retryCallback}()">重试</button>` : ''}
      </div>
    `;
  },

  /**
   * 渲染分页
   */
  renderPagination(currentPage, totalPages, onPageChange) {
    if (totalPages <= 1) return '';

    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }

    if (start > 1) {
      pages.push(`<button class="page-btn" onclick="${onPageChange}(1)">1</button>`);
      if (start > 2) pages.push(`<span class="page-info">...</span>`);
    }

    for (let i = start; i <= end; i++) {
      pages.push(`<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="${onPageChange}(${i})" ${i === currentPage ? 'style="background:var(--accent-color)"' : ''}>${i}</button>`);
    }

    if (end < totalPages) {
      if (end < totalPages - 1) pages.push(`<span class="page-info">...</span>`);
      pages.push(`<button class="page-btn" onclick="${onPageChange}(${totalPages})">${totalPages}</button>`);
    }

    return `
      <div class="pagination">
        <button class="page-btn" onclick="${onPageChange}(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>
        ${pages.join('')}
        <button class="page-btn" onclick="${onPageChange}(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>下一页</button>
      </div>
    `;
  },

  /**
   * 更新数据源选择器
   */
  updateSourceSelector() {
    const selector = document.getElementById('sourceSelector');
    if (!selector) return;

    const sources = Storage.getSources();
    const currentSource = Storage.getCurrentSource();

    selector.innerHTML = sources.map(s => 
      `<option value="${s.id}" ${currentSource && s.id === currentSource.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
    ).join('');

    selector.onchange = (e) => {
      Storage.setCurrentSource(parseInt(e.target.value));
      window.location.reload();
    };
  },

  /**
   * 格式化播放时间
   */
  formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  },
  
  /**
   * 性能监控报告
   */
  getPerformanceReport() {
    const report = {
      cache: {
        size: this.cache.data.size,
        maxSize: this.cache.maxSize,
        hitRate: 0
      },
      memory: {
        used: 0,
        total: 0
      }
    };
    
    // 检查内存使用情况
    if (performance.memory) {
      report.memory.used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
      report.memory.total = Math.round(performance.memory.totalJSHeapSize / 1024 / 1024);
    }
    
    return report;
  },
  
  /**
   * 清理缓存
   */
  clearCache() {
    this.cache.clear();
    this.showToast('缓存已清理', 'success');
  },
  
  /**
   * 预加载关键资源
   */
  preloadResources() {
    // 预加载关键CSS和JS
    const resources = [
      '/css/style.css',
      '/js/storage.js'
    ];
    
    resources.forEach(resource => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = resource.endsWith('.css') ? 'style' : 'script';
      link.href = resource;
      document.head.appendChild(link);
    });
  }
};

// 导出
window.App = App;
