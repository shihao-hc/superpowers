/**
 * NeuroFrontend - 神经前端控制面板
 * 
 * 功能:
 * - 干净美观的UI
 * - 实时状态显示
 * - 聊天界面
 * - 语音控制
 * - 参数调节
 * - 系统监控
 */

class NeuroFrontend {
  constructor(options = {}) {
    this.options = {
      containerId: options.containerId || 'neuro-frontend',
      theme: options.theme || 'dark',
      avatar: options.avatar || null,
      ...options
    };

    // UI元素
    this.elements = {};
    
    // 状态
    this.state = {
      isConnected: false,
      isListening: false,
      isSpeaking: false,
      mood: 'neutral',
      personality: 'playful'
    };

    // 消息历史
    this.messages = [];
    
    // 初始化
    this._init();
  }

  /**
   * 初始化UI
   */
  _init() {
    this._createContainer();
    this._createStyles();
  }

  /**
   * 创建容器
   */
  _createContainer() {
    const container = document.getElementById(this.options.containerId);
    if (!container) {
      console.error('[NeuroFrontend] Container not found:', this.options.containerId);
      return;
    }

    this.container = container;
    container.innerHTML = this._getHTML();
    
    // 缓存元素引用
    this.elements = {
      chatMessages: container.querySelector('#chat-messages'),
      chatInput: container.querySelector('#chat-input'),
      sendBtn: container.querySelector('#send-btn'),
      micBtn: container.querySelector('#mic-btn'),
      moodSelector: container.querySelector('#mood-selector'),
      personalitySelector: container.querySelector('#personality-selector'),
      statusIndicator: container.querySelector('#status-indicator'),
      statsPanel: container.querySelector('#stats-panel'),
      settingsPanel: container.querySelector('#settings-panel'),
      avatarPreview: container.querySelector('#avatar-preview')
    };

    // 绑定事件
    this._bindEvents();
  }

  /**
   * 获取HTML结构
   */
  _getHTML() {
    return `
      <div class="neuro-frontend ${this.options.theme}">
        <!-- 顶部状态栏 -->
        <header class="neuro-header">
          <div class="header-left">
            <h1 class="logo">🧠 Neuro Avatar</h1>
            <div id="status-indicator" class="status offline">
              <span class="dot"></span>
              <span class="text">离线</span>
            </div>
          </div>
          <div class="header-right">
            <div class="stats-mini">
              <span class="stat">延迟: <b id="latency-value">0ms</b></span>
              <span class="stat">消息: <b id="msg-count">0</b></span>
            </div>
            <button id="settings-btn" class="icon-btn">⚙️</button>
          </div>
        </header>

        <!-- 主内容区 -->
        <main class="neuro-main">
          <!-- 左侧: 虚拟人物预览 -->
          <section class="avatar-section">
            <div id="avatar-preview" class="avatar-container">
              <div class="avatar-placeholder">🤖</div>
            </div>
            
            <!-- 情感控制 -->
            <div class="mood-controls">
              <h3>情绪</h3>
              <div id="mood-selector" class="mood-grid">
                <button class="mood-btn" data-mood="happy" title="开心">😊</button>
                <button class="mood-btn" data-mood="sad" title="难过">😢</button>
                <button class="mood-btn" data-mood="excited" title="兴奋">🤩</button>
                <button class="mood-btn" data-mood="calm" title="平静">😌</button>
                <button class="mood-btn" data-mood="curious" title="好奇">🤔</button>
                <button class="mood-btn active" data-mood="neutral" title="中性">😐</button>
              </div>
            </div>

            <!-- 人格选择 -->
            <div class="personality-controls">
              <h3>人格</h3>
              <div id="personality-selector" class="personality-buttons">
                <button class="personality-btn" data-personality="cheerful">☀️ 活泼</button>
                <button class="personality-btn active" data-personality="playful">🎮 调皮</button>
                <button class="personality-btn" data-personality="calm">🌙 冷静</button>
                <button class="personality-btn" data-personality="wise">📚 智慧</button>
              </div>
            </div>
          </section>

          <!-- 右侧: 聊天区 -->
          <section class="chat-section">
            <div id="chat-messages" class="chat-messages">
              <div class="message system">
                <span class="avatar">🤖</span>
                <span class="content">你好！我是你的AI虚拟人物助手。试着和我聊天吧！</span>
              </div>
            </div>
            
            <!-- 输入区 -->
            <div class="chat-input-area">
              <button id="mic-btn" class="mic-btn" title="语音输入">🎤</button>
              <input type="text" id="chat-input" placeholder="输入消息..." autocomplete="off">
              <button id="send-btn" class="send-btn">发送</button>
            </div>

            <!-- 快捷回复 -->
            <div class="quick-replies">
              <button class="quick-btn">你好！</button>
              <button class="quick-btn">你叫什么名字？</button>
              <button class="quick-btn">今天心情如何？</button>
              <button class="quick-btn">给我讲个笑话</button>
            </div>
          </section>
        </main>

        <!-- 底部控制栏 -->
        <footer class="neuro-footer">
          <div class="controls">
            <button id="voice-toggle" class="control-btn">
              <span class="icon">🔊</span>
              <span class="label">语音</span>
            </button>
            <button id="inference-toggle" class="control-btn">
              <span class="icon">🧠</span>
              <span class="label">推理</span>
            </button>
            <button id="memory-btn" class="control-btn">
              <span class="icon">💾</span>
              <span class="label">记忆</span>
            </button>
          </div>
          
          <div class="slider-controls">
            <div class="slider-group">
              <label>语速</label>
              <input type="range" id="rate-slider" min="0.5" max="2" step="0.1" value="1">
              <span id="rate-value">1.0</span>
            </div>
            <div class="slider-group">
              <label>音调</label>
              <input type="range" id="pitch-slider" min="0.5" max="2" step="0.1" value="1">
              <span id="pitch-value">1.0</span>
            </div>
          </div>
        </footer>

        <!-- 设置面板 (默认隐藏) -->
        <div id="settings-panel" class="settings-panel hidden">
          <div class="settings-content">
            <h2>⚙️ 设置</h2>
            <div class="setting-group">
              <label>LLM 端点</label>
              <input type="text" id="llm-endpoint" placeholder="http://localhost:5000/api/v1/chat">
            </div>
            <div class="setting-group">
              <label>STT 引擎</label>
              <select id="stt-engine">
                <option value="webspeech">Web Speech API</option>
                <option value="whisper">Whisper API</option>
              </select>
            </div>
            <div class="setting-group">
              <label>TTS 引擎</label>
              <select id="tts-engine">
                <option value="browser">浏览器TTS</option>
                <option value="edge">Edge TTS (免费)</option>
                <option value="elevenlabs">ElevenLabs</option>
              </select>
            </div>
            <div class="setting-group">
              <label>VTube Studio</label>
              <input type="text" id="vtube-endpoint" placeholder="http://localhost:21412">
            </div>
            <button id="save-settings" class="save-btn">保存设置</button>
            <button id="close-settings" class="close-btn">关闭</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 创建样式
   */
  _createStyles() {
    if (document.getElementById('neuro-styles')) return;

    const style = document.createElement('style');
    style.id = 'neuro-styles';
    style.textContent = `
      .neuro-frontend {
        --primary: #667eea;
        --secondary: #764ba2;
        --success: #38ef7d;
        --danger: #eb3349;
        --warning: #ffc107;
        --bg-dark: #1a1a2e;
        --bg-card: rgba(255,255,255,0.08);
        --text: #ffffff;
        --text-muted: rgba(255,255,255,0.6);
        
        font-family: 'Segoe UI', sans-serif;
        background: linear-gradient(135deg, #1a1a2e, #16213e);
        color: var(--text);
        border-radius: 16px;
        overflow: hidden;
        height: 100%;
        display: flex;
        flex-direction: column;
      }

      .neuro-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px 20px;
        background: rgba(0,0,0,0.3);
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }

      .header-left { display: flex; align-items: center; gap: 15px; }
      .header-right { display: flex; align-items: center; gap: 15px; }
      
      .logo { font-size: 1.2rem; margin: 0; }
      
      .status {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 0.85rem;
      }
      .status.offline { background: rgba(235,51,73,0.2); }
      .status.online { background: rgba(56,239,125,0.2); }
      .status .dot { width: 8px; height: 8px; border-radius: 50%; }
      .status.offline .dot { background: var(--danger); }
      .status.online .dot { background: var(--success); animation: pulse 1s infinite; }

      .stats-mini { display: flex; gap: 15px; font-size: 0.85rem; }
      .stat b { color: var(--success); }

      .icon-btn {
        background: transparent;
        border: none;
        font-size: 1.2rem;
        cursor: pointer;
        padding: 8px;
        border-radius: 8px;
        transition: background 0.2s;
      }
      .icon-btn:hover { background: rgba(255,255,255,0.1); }

      .neuro-main {
        flex: 1;
        display: flex;
        overflow: hidden;
      }

      .avatar-section {
        width: 300px;
        padding: 20px;
        background: rgba(0,0,0,0.2);
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .avatar-container {
        flex: 1;
        background: var(--bg-card);
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 200px;
      }

      .avatar-placeholder { font-size: 80px; }

      .mood-controls, .personality-controls {
        background: var(--bg-card);
        border-radius: 12px;
        padding: 15px;
      }

      .mood-controls h3, .personality-controls h3 {
        margin: 0 0 10px 0;
        font-size: 0.9rem;
        color: var(--text-muted);
      }

      .mood-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }

      .mood-btn {
        background: transparent;
        border: 2px solid transparent;
        font-size: 1.5rem;
        padding: 8px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .mood-btn:hover { background: rgba(255,255,255,0.1); }
      .mood-btn.active { border-color: var(--primary); background: rgba(102,126,234,0.2); }

      .personality-buttons { display: flex; flex-direction: column; gap: 8px; }
      .personality-btn {
        background: var(--bg-card);
        border: 2px solid transparent;
        color: var(--text);
        padding: 10px 15px;
        border-radius: 8px;
        cursor: pointer;
        text-align: left;
        transition: all 0.2s;
      }
      .personality-btn:hover { background: rgba(255,255,255,0.1); }
      .personality-btn.active { border-color: var(--primary); }

      .chat-section {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 20px;
      }

      .chat-messages {
        flex: 1;
        overflow-y: auto;
        padding-right: 10px;
      }

      .message {
        display: flex;
        gap: 12px;
        margin-bottom: 15px;
        animation: fadeIn 0.3s ease;
      }

      .message.user { flex-direction: row-reverse; }
      
      .message .avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--bg-card);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        flex-shrink: 0;
      }

      .message .content {
        max-width: 70%;
        padding: 12px 16px;
        border-radius: 16px;
        background: var(--bg-card);
        line-height: 1.5;
      }

      .message.user .content {
        background: linear-gradient(135deg, var(--primary), var(--secondary));
      }

      .message.system .content {
        background: rgba(56,239,125,0.15);
      }

      .chat-input-area {
        display: flex;
        gap: 10px;
        margin-top: 15px;
      }

      .mic-btn {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--bg-card);
        border: none;
        font-size: 1.3rem;
        cursor: pointer;
        transition: all 0.2s;
      }
      .mic-btn:hover { background: rgba(255,255,255,0.15); }
      .mic-btn.active { background: var(--danger); animation: pulse 1s infinite; }

      #chat-input {
        flex: 1;
        padding: 12px 20px;
        border-radius: 25px;
        border: none;
        background: var(--bg-card);
        color: var(--text);
        font-size: 14px;
      }
      #chat-input::placeholder { color: var(--text-muted); }

      .send-btn {
        padding: 12px 24px;
        border-radius: 25px;
        background: linear-gradient(135deg, var(--primary), var(--secondary));
        border: none;
        color: white;
        font-weight: bold;
        cursor: pointer;
        transition: transform 0.2s;
      }
      .send-btn:hover { transform: scale(1.05); }

      .quick-replies {
        display: flex;
        gap: 8px;
        margin-top: 10px;
        flex-wrap: wrap;
      }

      .quick-btn {
        background: var(--bg-card);
        border: 1px solid rgba(255,255,255,0.1);
        color: var(--text);
        padding: 6px 12px;
        border-radius: 15px;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s;
      }
      .quick-btn:hover { background: rgba(255,255,255,0.15); }

      .neuro-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px 20px;
        background: rgba(0,0,0,0.3);
        border-top: 1px solid rgba(255,255,255,0.1);
      }

      .controls { display: flex; gap: 10px; }

      .control-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        background: var(--bg-card);
        border: none;
        color: var(--text);
        padding: 8px 16px;
        border-radius: 20px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .control-btn:hover { background: rgba(255,255,255,0.15); }
      .control-btn.active { background: var(--primary); }

      .slider-controls { display: flex; gap: 20px; }
      .slider-group {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.85rem;
      }
      .slider-group input[type="range"] {
        width: 80px;
        accent-color: var(--primary);
      }

      .settings-panel {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
      }
      .settings-panel.hidden { display: none; }

      .settings-content {
        background: var(--bg-dark);
        padding: 30px;
        border-radius: 16px;
        width: 400px;
      }

      .setting-group {
        margin-bottom: 20px;
      }
      .setting-group label {
        display: block;
        margin-bottom: 8px;
        color: var(--text-muted);
      }
      .setting-group input, .setting-group select {
        width: 100%;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.2);
        background: var(--bg-card);
        color: var(--text);
      }

      .save-btn, .close-btn {
        padding: 10px 20px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        margin-right: 10px;
      }
      .save-btn { background: var(--primary); color: white; }
      .close-btn { background: var(--bg-card); color: var(--text); }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      /* 滚动条样式 */
      .chat-messages::-webkit-scrollbar { width: 6px; }
      .chat-messages::-webkit-scrollbar-track { background: transparent; }
      .chat-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
    `;
    
    document.head.appendChild(style);
  }

  /**
   * 绑定事件
   */
  _bindEvents() {
    // 发送消息
    this.elements.sendBtn?.addEventListener('click', () => this._sendMessage());
    this.elements.chatInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this._sendMessage();
    });

    // 语音按钮
    this.elements.micBtn?.addEventListener('click', () => this.toggleVoice());

    // 情绪选择
    this.elements.moodSelector?.addEventListener('click', (e) => {
      const btn = e.target.closest('.mood-btn');
      if (btn) {
        this.elements.moodSelector.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.setMood(btn.dataset.mood);
      }
    });

    // 人格选择
    this.elements.personalitySelector?.addEventListener('click', (e) => {
      const btn = e.target.closest('.personality-btn');
      if (btn) {
        this.elements.personalitySelector.querySelectorAll('.personality-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.setPersonality(btn.dataset.personality);
      }
    });

    // 快捷回复
    document.querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.elements.chatInput.value = btn.textContent;
        this._sendMessage();
      });
    });

    // 滑块控制
    document.getElementById('rate-slider')?.addEventListener('input', (e) => {
      document.getElementById('rate-value').textContent = e.target.value;
      if (this.options.onRateChange) this.options.onRateChange(parseFloat(e.target.value));
    });

    document.getElementById('pitch-slider')?.addEventListener('input', (e) => {
      document.getElementById('pitch-value').textContent = e.target.value;
      if (this.options.onPitchChange) this.options.onPitchChange(parseFloat(e.target.value));
    });

    // 设置面板
    document.getElementById('settings-btn')?.addEventListener('click', () => {
      document.getElementById('settings-panel').classList.remove('hidden');
    });
    
    document.getElementById('close-settings')?.addEventListener('click', () => {
      document.getElementById('settings-panel').classList.add('hidden');
    });

    document.getElementById('save-settings')?.addEventListener('click', () => {
      this._saveSettings();
      document.getElementById('settings-panel').classList.add('hidden');
    });

    // 底部控制按钮
    document.getElementById('voice-toggle')?.addEventListener('click', (e) => {
      e.currentTarget.classList.toggle('active');
      if (this.options.onVoiceToggle) this.options.onVoiceToggle(e.currentTarget.classList.contains('active'));
    });

    document.getElementById('inference-toggle')?.addEventListener('click', (e) => {
      e.currentTarget.classList.toggle('active');
      if (this.options.onInferenceToggle) this.options.onInferenceToggle(e.currentTarget.classList.contains('active'));
    });
  }

  /**
   * 发送消息
   */
  _sendMessage() {
    const text = this.elements.chatInput?.value?.trim();
    if (!text) return;

    this.addMessage('user', text);
    this.elements.chatInput.value = '';
    
    if (this.options.onMessage) {
      this.options.onMessage(text);
    }
  }

  /**
   * 添加消息
   */
  addMessage(role, content, options = {}) {
    const avatars = { user: '👤', assistant: '🤖', system: '🔔' };
    const message = {
      role,
      content,
      timestamp: Date.now(),
      ...options
    };

    this.messages.push(message);

    if (this.elements.chatMessages) {
      const msgEl = document.createElement('div');
      msgEl.className = `message ${role}`;
      msgEl.innerHTML = `
        <span class="avatar">${avatars[role] || '💬'}</span>
        <span class="content">${this._escapeHTML(content)}</span>
      `;
      this.elements.chatMessages.appendChild(msgEl);
      this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    // 更新消息计数
    const msgCountEl = document.getElementById('msg-count');
    if (msgCountEl) {
      msgCountEl.textContent = this.messages.filter(m => m.role === 'user').length;
    }
  }

  /**
   * HTML转义
   */
  _escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * 设置情绪
   */
  setMood(mood) {
    this.state.mood = mood;
    if (this.options.onMoodChange) {
      this.options.onMoodChange(mood);
    }
  }

  /**
   * 设置人格
   */
  setPersonality(personality) {
    this.state.personality = personality;
    if (this.options.onPersonalityChange) {
      this.options.onPersonalityChange(personality);
    }
  }

  /**
   * 切换语音
   */
  toggleVoice() {
    this.elements.micBtn?.classList.toggle('active');
    this.state.isListening = !this.state.isListening;
    
    if (this.options.onVoiceToggle) {
      this.options.onVoiceToggle(this.state.isListening);
    }
  }

  /**
   * 设置连接状态
   */
  setConnected(connected) {
    this.state.isConnected = connected;
    const indicator = this.elements.statusIndicator;
    if (indicator) {
      indicator.className = `status ${connected ? 'online' : 'offline'}`;
      indicator.querySelector('.text').textContent = connected ? '在线' : '离线';
    }
  }

  /**
   * 更新延迟显示
   */
  updateLatency(ms) {
    const el = document.getElementById('latency-value');
    if (el) {
      el.textContent = `${Math.round(ms)}ms`;
      el.style.color = ms < 100 ? '#38ef7d' : ms < 300 ? '#ffc107' : '#eb3349';
    }
  }

  /**
   * 保存设置
   */
  _saveSettings() {
    const settings = {
      llmEndpoint: document.getElementById('llm-endpoint')?.value,
      sttEngine: document.getElementById('stt-engine')?.value,
      ttsEngine: document.getElementById('tts-engine')?.value,
      vtubeEndpoint: document.getElementById('vtube-endpoint')?.value
    };
    
    localStorage.setItem('neuro-settings', JSON.stringify(settings));
    
    if (this.options.onSettingsSave) {
      this.options.onSettingsSave(settings);
    }
  }

  /**
   * 加载设置
   */
  loadSettings() {
    const saved = localStorage.getItem('neuro-settings');
    if (saved) {
      const settings = JSON.parse(saved);
      if (document.getElementById('llm-endpoint')) {
        document.getElementById('llm-endpoint').value = settings.llmEndpoint || '';
      }
      if (document.getElementById('stt-engine')) {
        document.getElementById('stt-engine').value = settings.sttEngine || 'webspeech';
      }
      if (document.getElementById('tts-engine')) {
        document.getElementById('tts-engine').value = settings.ttsEngine || 'browser';
      }
      if (document.getElementById('vtube-endpoint')) {
        document.getElementById('vtube-endpoint').value = settings.vtubeEndpoint || '';
      }
      return settings;
    }
    return null;
  }

  /**
   * 显示提示
   */
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 25px;
      border-radius: 10px;
      background: ${type === 'error' ? '#eb3349' : type === 'success' ? '#38ef7d' : '#667eea'};
      color: white;
      font-weight: bold;
      animation: fadeIn 0.3s ease;
      z-index: 1000;
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  }
}

if (typeof window !== 'undefined') {
  window.NeuroFrontend = NeuroFrontend;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NeuroFrontend;
}
