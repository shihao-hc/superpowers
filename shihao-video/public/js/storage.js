/**
 * 本地存储管理
 * 管理数据源配置、收藏、历史记录
 */

const Storage = {
  KEYS: {
    SOURCES: 'shihao_sources',
    CURRENT_SOURCE: 'shihao_current_source',
    FAVORITES: 'shihao_favorites',
    HISTORY: 'shihao_history'
  },

  // 数据源管理
  getSources() {
    const data = localStorage.getItem(this.KEYS.SOURCES);
    if (data) {
      return JSON.parse(data);
    }
    // 默认数据源
    const defaultSources = [
      {
        id: 1,
        name: '百度云资源',
        apiUrl: 'https://api.apibdzy.com/api.php/provide/vod/',
        isActive: true,
        total: 46042
      },
      {
        id: 2,
        name: '闪电资源',
        apiUrl: 'http://sdzyapi.com/api.php/provide/vod/',
        isActive: false,
        total: 115136
      },
      {
        id: 3,
        name: '量子资源',
        apiUrl: 'https://cj.lziapi.com/api.php/provide/vod/',
        isActive: false,
        total: 129854
      },
      {
        id: 4,
        name: '卧龙影视资源',
        apiUrl: 'http://wolongzyw.com/api.php/provide/vod/',
        isActive: false,
        total: 85185
      },
      {
        id: 5,
        name: '新浪资源采集网',
        apiUrl: 'https://api.xinlangapi.com/xinlangapi.php/provide/vod/',
        isActive: false,
        total: 99499
      },
      {
        id: 6,
        name: '金鹰资源站',
        apiUrl: 'http://jinyingzy.com/api.php/provide/vod/',
        isActive: false,
        total: 99367
      }
    ];
    this.saveSources(defaultSources);
    return defaultSources;
  },

  saveSources(sources) {
    localStorage.setItem(this.KEYS.SOURCES, JSON.stringify(sources));
  },

  addSource(source) {
    const sources = this.getSources();
    source.id = Date.now();
    sources.push(source);
    this.saveSources(sources);
    return source;
  },

  updateSource(id, updates) {
    const sources = this.getSources();
    const index = sources.findIndex(s => s.id === id);
    if (index !== -1) {
      sources[index] = { ...sources[index], ...updates };
      this.saveSources(sources);
      return sources[index];
    }
    return null;
  },

  deleteSource(id) {
    const sources = this.getSources();
    const filtered = sources.filter(s => s.id !== id);
    this.saveSources(filtered);
    return filtered;
  },

  getCurrentSource() {
    const currentId = localStorage.getItem(this.KEYS.CURRENT_SOURCE);
    const sources = this.getSources();
    
    if (currentId) {
      const source = sources.find(s => s.id === parseInt(currentId));
      if (source) return source;
    }
    
    // 返回第一个活跃的数据源
    const active = sources.find(s => s.isActive) || sources[0];
    if (active) {
      this.setCurrentSource(active.id);
    }
    return active || null;
  },

  setCurrentSource(id) {
    localStorage.setItem(this.KEYS.CURRENT_SOURCE, id.toString());
    // 更新活跃状态
    const sources = this.getSources();
    sources.forEach(s => {
      s.isActive = s.id === id;
    });
    this.saveSources(sources);
  },

  // 收藏管理
  getFavorites() {
    const data = localStorage.getItem(this.KEYS.FAVORITES);
    return data ? JSON.parse(data) : [];
  },

  addFavorite(video) {
    const favorites = this.getFavorites();
    if (!favorites.find(f => f.id === video.id && f.sourceId === video.sourceId)) {
      video.addedAt = new Date().toISOString();
      favorites.unshift(video);
      // 限制最多100条
      if (favorites.length > 100) favorites.pop();
      localStorage.setItem(this.KEYS.FAVORITES, JSON.stringify(favorites));
    }
  },

  removeFavorite(id, sourceId) {
    const favorites = this.getFavorites();
    const filtered = favorites.filter(f => !(f.id === id && f.sourceId === sourceId));
    localStorage.setItem(this.KEYS.FAVORITES, JSON.stringify(filtered));
    return filtered;
  },

  isFavorite(id, sourceId) {
    const favorites = this.getFavorites();
    return favorites.some(f => f.id === id && f.sourceId === sourceId);
  },

  // 历史记录管理
  getHistory() {
    const data = localStorage.getItem(this.KEYS.HISTORY);
    return data ? JSON.parse(data) : [];
  },

  addHistory(video, episode) {
    const history = this.getHistory();
    const key = `${video.id}_${video.sourceId}`;
    
    // 移除相同记录
    const filtered = history.filter(h => !(h.id === video.id && h.sourceId === video.sourceId));
    
    video.watchedAt = new Date().toISOString();
    video.lastEpisode = episode;
    filtered.unshift(video);
    
    // 限制最多200条
    if (filtered.length > 200) filtered.pop();
    localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(filtered));
  },

  clearHistory() {
    localStorage.setItem(this.KEYS.HISTORY, '[]');
  },

  // 工具方法
  formatTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
    
    return date.toLocaleDateString('zh-CN');
  }
};

// 导出
window.Storage = Storage;
