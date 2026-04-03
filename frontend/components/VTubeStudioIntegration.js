/**
 * VTubeStudioIntegration - VTube Studio插件集成
 * 
 * 功能:
 * - VTube Studio API连接
 * - 模型/道具控制
 * - 参数动画
 * - 表情触发
 * - 眼动/嘴型同步
 */

class VTubeStudioIntegration {
  constructor(options = {}) {
    this.options = {
      // VTube Studio地址
      endpoint: options.endpoint || 'http://localhost:21412',
      // 认证令牌
      authToken: options.authToken || null,
      // 自动重连
      autoReconnect: options.autoReconnect !== false,
      // 重连间隔(ms)
      reconnectInterval: options.reconnectInterval || 5000,
      // 回调
      onConnect: options.onConnect || null,
      onDisconnect: options.onDisconnect || null,
      onModelChanged: options.onModelChanged || null,
      onError: options.onError || null,
      ...options
    };

    // 状态
    this.isConnected = false;
    this.currentModel = null;
    this.parameters = new Map();
    
    // WebSocket
    this.ws = null;
    this.reconnectTimer = null;

    // 缓存
    this.modelCache = new Map();
    this.paramCache = new Map();
  }

  /**
   * 连接到VTube Studio
   */
  async connect() {
    try {
      // 首先尝试HTTP认证
      if (!this.options.authToken) {
        await this._authenticate();
      }

      // 建立WebSocket连接
      await this._connectWebSocket();
      
      // 获取当前模型信息
      await this._getModelInfo();
      
      this.isConnected = true;
      if (this.options.onConnect) this.options.onConnect();
      
    } catch (error) {
      console.error('[VTubeStudio] Connect error:', error);
      if (this.options.onError) this.options.onError(error);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    if (this.options.onDisconnect) this.options.onDisconnect();
  }

  /**
   * 认证
   */
  async _authenticate() {
    const response = await this._apiRequest('POST', '/api/v1/authenticate/request_token', {
      pluginName: 'NeuroAvatar',
      pluginDeveloper: 'AI Avatar System'
    });

    if (response && response.authenticationToken) {
      this.options.authToken = response.authenticationToken;
    }
  }

  /**
   * WebSocket连接
   */
  _connectWebSocket() {
    return new Promise((resolve, reject) => {
      const wsUrl = this.options.endpoint.replace('http', 'ws') + '/api/v1/events';
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('[VTubeStudio] WebSocket connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        this._handleEvent(JSON.parse(event.data));
      };

      this.ws.onerror = (error) => {
        console.error('[VTubeStudio] WebSocket error:', error);
        if (this.options.onError) this.options.onError(error);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        if (this.options.onDisconnect) this.options.onDisconnect();
        
        // 自动重连
        if (this.options.autoReconnect) {
          this.reconnectTimer = setTimeout(() => {
            console.log('[VTubeStudio] Attempting reconnect...');
            this.connect();
          }, this.options.reconnectInterval);
        }
      };

      // 发送认证
      if (this.options.authToken) {
        setTimeout(() => {
          this.ws.send(JSON.stringify({
            apiName: 'VTubeStudioAPISetup',
            requestID: this._generateRequestId(),
            messageType: 'AuthenticationRequest',
            authenticationToken: this.options.authToken
          }));
        }, 500);
      }
    });
  }

  /**
   * API请求
   async _apiRequest(method, endpoint, body = null) {
    const url = `${this.options.endpoint}${endpoint}`;
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`VTube Studio API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 处理WebSocket事件
   */
  _handleEvent(event) {
    switch (event.messageType) {
      case 'ModelLoaded':
        this.currentModel = event.data;
        if (this.options.onModelChanged) {
          this.options.onModelChanged(event.data);
        }
        break;
        
      case 'AnimationFrame':
        // 实时参数更新
        if (event.data && event.data.parameters) {
          for (const param of event.data.parameters) {
            this.parameters.set(param.name, param.value);
          }
        }
        break;
        
      case 'HotkeyTriggered':
        console.log('[VTubeStudio] Hotkey triggered:', event.data);
        break;
    }
  }

  /**
   * 获取模型信息
   */
  async _getModelInfo() {
    const response = await this._apiRequest('GET', '/api/v1/models');
    if (response && response.models) {
      this.currentModel = response.models.find(m => m.loaded) || response.models[0];
      this.models = response.models;
    }
    return this.currentModel;
  }

  /**
   * 加载模型
   */
  async loadModel(modelId) {
    const response = await this._apiRequest('POST', '/api/v1/models/load', {
      modelId
    });
    
    if (response && response.modelLoaded) {
      this.currentModel = response;
      if (this.options.onModelChanged) {
        this.options.onModelChanged(response);
      }
    }
    
    return response;
  }

  /**
   * 获取所有模型
   */
  async getModels() {
    if (this.modelCache.size > 0) {
      return Array.from(this.modelCache.values());
    }
    
    const response = await this._apiRequest('GET', '/api/v1/models');
    if (response && response.models) {
      for (const model of response.models) {
        this.modelCache.set(model.modelId, model);
      }
    }
    return response?.models || [];
  }

  /**
   * 设置参数值
   */
  async setParameter(name, value, duration = 0) {
    const request = {
      name,
      value: Math.max(0, Math.min(1, value))
    };

    if (duration > 0) {
      request.duration = duration;
    }

    const response = await this._apiRequest('POST', '/api/v1/parameters', request);
    this.parameters.set(name, value);
    return response;
  }

  /**
   * 获取参数值
   */
  async getParameter(name) {
    const response = await this._apiRequest('GET', `/api/v1/parameters/${name}`);
    return response?.value || 0;
  }

  /**
   * 获取所有参数
   */
  async getParameters() {
    const response = await this._apiRequest('GET', '/api/v1/parameters');
    if (response && response.parameters) {
      for (const param of response.parameters) {
        this.parameters.set(param.name, param.value);
      }
    }
    return response?.parameters || [];
  }

  /**
   * 触发表情
   */
  async triggerExpression(expressionId, duration = 1000) {
    const response = await this._apiRequest('POST', '/api/v1/expressions/trigger', {
      expressionId,
      duration
    });
    return response;
  }

  /**
   * 触发热键
   */
  async triggerHotkey(hotkeyId) {
    const response = await this._apiRequest('POST', '/api/v1/hotkeys/trigger', {
      hotkeyId
    });
    return response;
  }

  /**
   * 添加道具
   */
  async addItem(itemId, position = { x: 0, y: 0 }) {
    const response = await this._apiRequest('POST', '/api/v1/items/load', {
      itemId,
      positionX: position.x,
      positionY: position.y
    });
    return response;
  }

  /**
   * 移除道具
   */
  async removeItem(instanceId) {
    const response = await this._apiRequest('POST', '/api/v1/items/unload', {
      instanceId
    });
    return response;
  }

  /**
   * 移动道具
   */
  async moveItem(instanceId, position, duration = 0) {
    const response = await this._apiRequest('POST', '/api/v1/items/move', {
      instanceId,
      positionX: position.x,
      positionY: position.y,
      duration
    });
    return response;
  }

  /**
   * 获取道具列表
   */
  async getItems() {
    const response = await this._apiRequest('GET', '/api/v1/items');
    return response?.items || [];
  }

  /**
   * 同步嘴型
   */
  syncLipSync(volume) {
    if (!this.isConnected) return;
    
    // VTube Studio的嘴型参数
    this.setParameter('MouthOpen', volume, 50);
  }

  /**
   * 同步眨眼
   */
  syncBlink(force = false) {
    if (!this.isConnected) return;
    
    // 随机眨眼
    if (force || Math.random() < 0.01) {
      this.setParameter('EyeOpenLeft', 0, 100);
      this.setParameter('EyeOpenRight', 0, 100);
      
      setTimeout(() => {
        this.setParameter('EyeOpenLeft', 1, 100);
        this.setParameter('EyeOpenRight', 1, 100);
      }, 150);
    }
  }

  /**
   * 同步眼球追踪
   */
  syncEyeTracking(x, y) {
    if (!this.isConnected) return;
    
    // 映射到VTube Studio参数
    this.setParameter('EyeLeftX', 0.5 + x * 0.5);
    this.setParameter('EyeLeftY', 0.5 + y * 0.5);
    this.setParameter('EyeRightX', 0.5 + x * 0.5);
    this.setParameter('EyeRightY', 0.5 + y * 0.5);
  }

  /**
   * 根据情绪设置表情
   */
  async setEmotion(emotion) {
    if (!this.isConnected) return;

    const emotionMap = {
      happy: { MouthForm: 1, BrowInnerUp: 0.8 },
      sad: { MouthForm: -1, BrowInnerUp: 1 },
      angry: { MouthForm: -0.5, EyeOpenRight: 0.7 },
      surprised: { MouthOpen: 1, BrowInnerUp: 1 },
      neutral: { MouthForm: 0, BrowInnerUp: 0 }
    };

    const params = emotionMap[emotion] || emotionMap.neutral;
    
    for (const [name, value] of Object.entries(params)) {
      await this.setParameter(name, value, 500);
    }
  }

  /**
   * 播放动画
   */
  async playAnimation(animationId) {
    const response = await this._apiRequest('POST', '/api/v1/animations/play', {
      animationId
    });
    return response;
  }

  /**
   * 生成请求ID
   */
  _generateRequestId() {
    return `na_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 截图
   */
  async takeScreenshot() {
    const response = await this._apiRequest('POST', '/api/v1/screenshot');
    return response;
  }

  /**
   * 获取状态
   */
  async getStatus() {
    const response = await this._apiRequest('GET', '/api/v1/status');
    return response;
  }

  /**
   * 销毁
   */
  destroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.disconnect();
    this.parameters.clear();
    this.modelCache.clear();
  }
}

if (typeof window !== 'undefined') {
  window.VTubeStudioIntegration = VTubeStudioIntegration;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = VTubeStudioIntegration;
}
