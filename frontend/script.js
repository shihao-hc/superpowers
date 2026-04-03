(function(){
  const chat = document.getElementById('chat');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const voiceBtn = document.getElementById('voice-btn');
  const ttsToggle = document.getElementById('tts-toggle');
  const moodEmoji = document.getElementById('mood-emoji');
  const moodText = document.getElementById('mood-text');
  const personalityCards = document.getElementById('personality-cards');
  const currentPersonalityEl = document.getElementById('current-personality');
  const memoryListEl = document.getElementById('memory-list');
  const memorySearchEl = document.getElementById('memory-search');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const modelSelect = document.getElementById('model-select');
  const reconnectOverlay = document.getElementById('reconnect-overlay');

  let currentPersonality = 'AI';
  let currentMood = 'neutral';
  let currentTTSConfig = { lang: 'zh-CN', rate: 1.0, pitch: 1.0 };
  let currentAvatarConfig = null;
  let ttsEnabled = false;
  let allMemory = {};
  let memoryPage = 1;
  let memoryTotalPages = 1;
  let memoryQuery = '';
  let conversationHistory = [];
  let maxHistoryLength = 10;
  let isTyping = false;
  let isListening = false;
  let recognition = null;
  let socket = null;
  let reconnectAttempts = 0;
  let maxReconnectAttempts = 5;
  let live2dComponent = null;
  let vrmComponent = null;
  let virtualCharacter = null;
  let activeComponent = null;
  let live2dHidden = false;
  let voiceAvatar = null;
  let ttsSystem = null;
  let lipSyncAnimator = null;
  let visionSystem = null;
  let performanceOptimizer = null;

  const MOOD_EMOJIS = {
    happy: { emoji: '😊', text: '开心', class: 'mood-happy' },
    excited: { emoji: '🤩', text: '兴奋', class: 'mood-excited' },
    playful: { emoji: '😏', text: '调皮', class: 'mood-playful' },
    curious: { emoji: '🤔', text: '好奇', class: 'mood-curious' },
    shy: { emoji: '😳', text: '害羞', class: 'mood-shy' },
    calm: { emoji: '😌', text: '平静', class: 'mood-neutral' },
    neutral: { emoji: '😐', text: '平静', class: 'mood-neutral' }
  };

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function sanitizeTTSConfig(config) {
    if (!config || typeof config !== 'object') {
      return { lang: 'zh-CN', rate: 1.0, pitch: 1.0, rateVariants: {}, pitchVariants: {} };
    }

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

    const sanitizeVariants = (obj, min, max) => {
      if (typeof obj !== 'object' || Array.isArray(obj)) return {};
      const result = {};
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'number') {
          result[key] = clamp(obj[key], min, max);
        }
      }
      return result;
    };

    return {
      lang: typeof config.lang === 'string' && /^[\w-]+$/.test(config.lang) ? config.lang : 'zh-CN',
      rate: typeof config.rate === 'number' ? clamp(config.rate, 0.1, 2) : 1.0,
      pitch: typeof config.pitch === 'number' ? clamp(config.pitch, 0, 2) : 1.0,
      rateVariants: sanitizeVariants(config.rateVariants, 0.1, 2),
      pitchVariants: sanitizeVariants(config.pitchVariants, 0, 2)
    };
  }

  function sanitizeAvatarConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return null;
    }
    const safeTypes = ['svg', 'live2d', 'vrm'];
    const safeConfig = {
      type: safeTypes.includes(config.type) ? config.type : 'svg',
      fallback: typeof config.fallback === 'string' ? config.fallback : null
    };
    
    const isModelUrl = typeof config.model === 'string' && config.model.startsWith('https://');
    const isLocalModel = typeof config.model === 'string'
      && config.model.startsWith('/models/')
      && !config.model.includes('..');
    
    if (safeConfig.type === 'live2d' && (isModelUrl || isLocalModel)) {
      safeConfig.model = config.model;
    }
    if (safeConfig.type === 'vrm' && (isModelUrl || isLocalModel)) {
      safeConfig.model = config.model;
    }
    if (['live2d', 'vrm'].includes(safeConfig.type) && !safeConfig.model) {
      safeConfig.type = 'svg';
      safeConfig.default = safeConfig.fallback;
    }
    return safeConfig;
  }

  function getTime() {
    return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  function showTypingIndicator() {
    const div = document.createElement('div');
    div.id = 'typing-indicator';
    div.className = 'typing-indicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    isTyping = true;
  }

  function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
    isTyping = false;
  }

  function append(text, className, showTime = true, sender = null) {
    const div = document.createElement('div');
    div.className = 'msg ' + (className || '');
    
    if (sender) {
      const senderDiv = document.createElement('div');
      senderDiv.className = 'sender';
      senderDiv.textContent = sender;
      div.appendChild(senderDiv);
    }
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    contentDiv.textContent = text;
    div.appendChild(contentDiv);
    
    if (showTime) {
      const timeDiv = document.createElement('span');
      timeDiv.className = 'time';
      timeDiv.textContent = getTime();
      div.appendChild(timeDiv);
    }
    
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function speak(text, moodVal) {
    if (!ttsEnabled) return;
    
    if (voiceAvatar) {
      voiceAvatar.speak(text, {
        mood: moodVal,
        rateVariants: currentTTSConfig.rateVariants,
        pitchVariants: currentTTSConfig.pitchVariants
      });
      return;
    }
    
    if (ttsSystem) {
      ttsSystem.setMoodRatePitch(moodVal, currentTTSConfig.rateVariants, currentTTSConfig.pitchVariants);
      ttsSystem.speak(text);
      return;
    }
    
    if (!('speechSynthesis' in window)) return;
    triggerLive2DSpeaking();
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = currentTTSConfig.lang || 'zh-CN';
    const rate = currentTTSConfig.rateVariants?.[moodVal] || currentTTSConfig.rate || 1.0;
    const pitch = currentTTSConfig.pitchVariants?.[moodVal] || currentTTSConfig.pitch || 1.0;
    utter.rate = rate;
    utter.pitch = pitch;
    utter.onend = () => stopLive2DSpeaking();
    utter.onerror = () => stopLive2DSpeaking();
    window.speechSynthesis.speak(utter);
  }

  function detectMood(text) {
    const patterns = [
      { mood: 'playful', words: ['哈哈', '有意思', '好玩', '嘿嘿嘿', '嘿嘿'] },
      { mood: 'excited', words: ['哇', '太', '厉害', '哇塞', '太棒', '哇哦', 'amazing'] },
      { mood: 'happy', words: ['好', '开心', '棒', '喜欢', '太好了', '嘻嘻', '开心~', 'happy'] },
      { mood: 'shy', words: ['嗯', '那个', '其实', '有点'] },
      { mood: 'curious', words: ['为什么', '怎么', '什么', '?', '？', '吗', '呢'] }
    ];
    for (const p of patterns) {
      if (p.words.some(w => text.includes(w))) return p.mood;
    }
    return currentMood || 'neutral';
  }

  function updateMoodDisplay(m) {
    currentMood = m || 'neutral';
    const moodInfo = MOOD_EMOJIS[currentMood] || MOOD_EMOJIS.neutral;
    moodEmoji.textContent = moodInfo.emoji;
    moodText.textContent = moodInfo.text;
    moodText.className = 'mood-text ' + moodInfo.class;
    updateAvatarMood(currentMood);
  }

  function updateAvatarMood(mood) {
    if (live2dComponent) {
      live2dComponent.setMood(mood);
    }
    if (vrmComponent) {
      vrmComponent.setMood(mood);
    }
    if (virtualCharacter) {
      virtualCharacter.setMood(mood);
    }
  }

  function updateConnectionStatus(connected) {
    if (connected) {
      statusDot.classList.remove('offline');
      statusText.textContent = '在线';
      reconnectAttempts = 0;
      reconnectOverlay.classList.remove('show');
    } else {
      statusDot.classList.add('offline');
      statusText.textContent = '离线';
    }
  }

  function renderPersonalityCards(personalities, activeName) {
    personalityCards.innerHTML = '';
    const avatars = { '狐九': '🦊', '艾利': '🦁', '默认': '🤖' };
    
    personalities.forEach(p => {
      const card = document.createElement('div');
      card.className = 'personality-card' + (p.name === activeName ? ' active' : '');
      card.dataset.name = escapeHtml(p.name);
      
      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.textContent = avatars[p.name] || avatars['默认'];
      
      const nameDiv = document.createElement('div');
      nameDiv.className = 'name';
      nameDiv.textContent = p.name;
      
      const descDiv = document.createElement('div');
      descDiv.className = 'desc';
      descDiv.textContent = p.description || '';
      
      card.appendChild(avatar);
      card.appendChild(nameDiv);
      card.appendChild(descDiv);
      
      if (p.name === activeName) {
        const activeTag = document.createElement('div');
        activeTag.className = 'active-tag';
        activeTag.textContent = '✓ 当前';
        card.appendChild(activeTag);
      }
      
      card.onclick = () => switchPersonality(p.name);
      personalityCards.appendChild(card);
    });
  }

  function loadPersonality() {
    Promise.all([
      fetch('/api/personality').then(r => r.json()),
      fetch('/health').then(r => r.json()).catch(() => ({}))
    ])
    .then(([data, health]) => {
      currentPersonality = data.name || 'AI';
      currentMood = data.mood || 'neutral';
      currentTTSConfig = sanitizeTTSConfig(data.tts);
      
      let personalityConfig = null;
      if (data.personalities) {
        const activePersonality = data.personalities.find(p => p.name === currentPersonality);
        if (activePersonality && activePersonality.avatar) {
          currentAvatarConfig = sanitizeAvatarConfig(activePersonality.avatar);
          personalityConfig = {
            modelParams: activePersonality.modelParams,
            idleAnimation: activePersonality.idleAnimation
          };
        }
      }
      
      updateMoodDisplay(currentMood);
      initAvatar(currentAvatarConfig, personalityConfig);
      currentPersonalityEl.textContent = currentPersonality;
      
      if (data.personalities) {
        renderPersonalityCards(data.personalities, currentPersonality);
      }
      
      if (health.models && health.models.length > 0) {
        modelSelect.innerHTML = '';
        health.models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = String(m);
          opt.textContent = String(m);
          modelSelect.appendChild(opt);
        });
        if (health.model) {
          modelSelect.value = String(health.model);
        }
      }
      
      updateConnectionStatus(true);
      append('[系统] 启动完成 | 人格: ' + currentPersonality + ' | 心情: ' + currentMood, 'system-msg');
      loadMemory();
    })
    .catch(() => {
      updateConnectionStatus(false);
      append('[系统] 连接失败，请刷新页面', 'error-msg');
    });
  }

  let _avatarInitLock = false;
  
  async function initAvatar(avatarConfig, personalityConfig) {
    while (_avatarInitLock) {
      await new Promise(r => setTimeout(r, 50));
    }
    _avatarInitLock = true;
    
    try {
      const container = document.getElementById('live2d-container');
      const moodIndicator = document.getElementById('live2d-mood-text');
      
      if (!container) return;

      if (live2dComponent) {
        try { live2dComponent.destroy(); } catch (e) {}
        live2dComponent = null;
      }
      if (vrmComponent) {
        try { vrmComponent.destroy(); } catch (e) {}
        vrmComponent = null;
      }
      if (virtualCharacter) {
        try { virtualCharacter.destroy(); } catch (e) {}
        virtualCharacter = null;
      }

      if (avatarConfig?.type === 'live2d' && avatarConfig.model) {
        try {
          await initLive2DModel(avatarConfig.model, personalityConfig, moodIndicator);
          return;
        } catch (e) {
          console.warn('Live2D failed, fallback to VirtualCharacter');
        }
      }

      if (avatarConfig?.type === 'vrm' && avatarConfig.model) {
        try {
          await initVRMModel(avatarConfig.model, personalityConfig, moodIndicator);
          return;
        } catch (e) {
          console.warn('VRM failed, fallback to VirtualCharacter');
        }
      }

      initVirtualCharacter(moodIndicator);
      initVoiceAvatar();

    } catch (error) {
      console.warn('Avatar init failed:', error);
      const moodIndicator = document.getElementById('live2d-mood-text');
      if (moodIndicator) moodIndicator.textContent = '使用2D形象';
      initVirtualCharacter(moodIndicator);
    } finally {
      _avatarInitLock = false;
    }
  }

  function initVirtualCharacter(moodIndicator) {
    if (typeof VirtualCharacter === 'undefined') {
      if (moodIndicator) moodIndicator.textContent = '形象组件未加载';
      return;
    }

    virtualCharacter = new VirtualCharacter('live2d-container');
    virtualCharacter.init();
    virtualCharacter.setPersonality(currentPersonality);
    virtualCharacter.setMood(currentMood);

    if (moodIndicator) moodIndicator.textContent = '2D形象已加载';
    append('[系统] 2D虚拟形象已加载', 'system-msg');
  }

  function updateVirtualCharacterMood(mood) {
    if (virtualCharacter) {
      virtualCharacter.setMood(mood);
    }
  }

  function triggerVirtualCharacterSpeaking() {
    if (virtualCharacter) {
      virtualCharacter.speak();
    }
  }

  function stopVirtualCharacterSpeaking() {
    if (virtualCharacter) {
      virtualCharacter.stopSpeaking();
    }
  }

  async function initLive2DModel(modelPath, personalityConfig, moodIndicator) {
    if (typeof Live2DComponent === 'undefined' && typeof OML2D === 'undefined') {
      moodIndicator.textContent = 'Live2D 未加载';
      initBasicTTS();
      return;
    }

    if (typeof Live2DComponent !== 'undefined') {
      live2dComponent = new Live2DComponent('live2d-container', {
        enableLipSync: true,
        enableMouseTracking: true,
        enableTapInteraction: true,
        defaultScale: 0.1,
        defaultPosition: [0, 0],
        enableIdleAnimation: true,
        mobileFallback: true
      });
      
      live2dComponent.onTap = ({ x, y }) => {
        append(`[交互] 点击了虚拟形象 (${x.toFixed(0)}, ${y.toFixed(0)})`, 'system-msg');
      };
      
      await live2dComponent.init(modelPath, personalityConfig);
      live2dComponent.setMood(currentMood);
      moodIndicator.textContent = 'Live2D 已加载';
      initVoiceAvatar();
    } else if (typeof OML2D !== 'undefined') {
      OML2D.loadOml2d({
        models: [{
          path: modelPath,
          position: [0, 0],
          scale: 0.1
        }],
        mobileScale: 0.8
      });
      moodIndicator.textContent = 'Live2D 已加载';
      initVoiceAvatar();
    }
  }

  async function initVRMModel(modelPath, personalityConfig, moodIndicator) {
    if (typeof VRMComponent === 'undefined') {
      moodIndicator.textContent = 'VRM 未加载';
      initBasicTTS();
      return;
    }

    if (!VRMComponent.isSupported()) {
      moodIndicator.textContent = 'WebGL 不支持';
      initBasicTTS();
      return;
    }

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

    const vrmConfig = personalityConfig?.vrmConfig || {};
    const idleConfig = vrmConfig.idleConfig || personalityConfig?.idleAnimation || {};

    vrmComponent = new VRMComponent('live2d-container', {
      enableLipSync: true,
      enableIdleAnimation: true,
      mobileFallback: true,
      blinkInterval: clamp(idleConfig.blinkInterval || 3000, 500, 10000),
      blinkDuration: clamp(idleConfig.blinkDuration || 150, 50, 500),
      breathAmplitude: clamp(idleConfig.breathAmplitude || 0.02, 0, 0.1),
      breathSpeed: clamp(idleConfig.breathSpeed || 0.001, 0, 0.01),
      microMovementEnabled: idleConfig.microMovementEnabled !== false
    });

    const config = {
      modelParams: vrmConfig.vrmBlendShapeMap,
      idleAnimation: idleConfig
    };

    await vrmComponent.init(modelPath, config);

    if (vrmConfig.vrmBlendShapeMap) {
      vrmComponent.setCustomBlendMap(vrmConfig.vrmBlendShapeMap);
    }

    vrmComponent.setMood(currentMood);
    moodIndicator.textContent = 'VRM 已加载';
    initVoiceAvatar();
  }

  function initVoiceAvatar() {
    if (typeof VoiceAvatar !== 'undefined') {
      voiceAvatar = new VoiceAvatar(live2dComponent, {
        moodLipSync: true
      });
      append('[系统] 语音唇形同步已启用', 'system-msg');
    } else if (typeof TTSSystem !== 'undefined') {
      ttsSystem = new TTSSystem({
        onStart: () => {
          triggerLive2DSpeaking();
        },
        onEnd: () => {
          stopLive2DSpeaking();
        }
      });
    }
  }

  function initBasicTTS() {
    if (typeof TTSSystem !== 'undefined') {
      ttsSystem = new TTSSystem({
        onStart: () => {},
        onEnd: () => {}
      });
    }
  }

  function updateLive2DMood(mood) {
    if (live2dComponent) {
      live2dComponent.setMood(mood);
    }
  }

  function triggerLive2DSpeaking() {
    if (live2dComponent) {
      live2dComponent.speak();
    }
    if (vrmComponent) {
      vrmComponent.speak();
    }
    if (virtualCharacter) {
      virtualCharacter.speak();
    }
  }

  function stopLive2DSpeaking() {
    if (live2dComponent) {
      live2dComponent.stopSpeaking();
    }
    if (vrmComponent) {
      vrmComponent.stopSpeaking();
    }
    if (virtualCharacter) {
      virtualCharacter.stopSpeaking();
    }
  }

  function initLive2DControls() {
    const soundBtn = document.getElementById('live2d-toggle-sound');
    const randomBtn = document.getElementById('live2d-random-motion');
    const hideBtn = document.getElementById('live2d-hide');
    const section = document.getElementById('live2d-section');
    
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        ttsEnabled = !ttsEnabled;
        soundBtn.style.opacity = ttsEnabled ? 1 : 0.5;
        append('[系统] ' + (ttsEnabled ? '🔊' : '🔇') + ' 虚拟形象声音 ' + (ttsEnabled ? '开启' : '关闭'), 'system-msg');
      });
    }
    
    if (randomBtn) {
      randomBtn.addEventListener('click', () => {
        if (live2dComponent && live2dComponent.oml2d) {
          const moods = ['happy', 'sad', 'excited', 'curious', 'calm'];
          const randomMood = moods[Math.floor(Math.random() * moods.length)];
          live2dComponent.setMood(randomMood);
          updateMoodDisplay(randomMood);
          append(`[系统] 随机动作: ${randomMood}`, 'system-msg');
        }
      });
    }
    
    if (hideBtn && section) {
      hideBtn.addEventListener('click', () => {
        live2dHidden = !live2dHidden;
        section.style.display = live2dHidden ? 'none' : 'block';
        hideBtn.textContent = live2dHidden ? '👁' : '🙈';
      });
    }
  }

  function switchPersonality(name) {
    if (name === currentPersonality) return;
    append('[系统] 正在切换到 ' + escapeHtml(name) + '...', 'system-msg');
    fetch('/api/personality/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        currentPersonality = typeof data.active === 'string' ? data.active : currentPersonality;
        currentMood = typeof data.mood === 'string' ? data.mood : 'neutral';
        currentTTSConfig = sanitizeTTSConfig(data.tts);
        
        if (data.avatar) {
          currentAvatarConfig = sanitizeAvatarConfig(data.avatar);
        }

        if (virtualCharacter) {
          virtualCharacter.setPersonality(currentPersonality);
        }
        
        updateMoodDisplay(currentMood);
        currentPersonalityEl.textContent = currentPersonality;
        conversationHistory = [];
        loadPersonality();
        append('[系统] ✓ 已切换到 ' + escapeHtml(currentPersonality), 'system-msg');
      } else {
        append('[系统] ✗ 切换失败: ' + escapeHtml(data.error || '未知错误'), 'error-msg');
      }
    })
    .catch(err => append('[系统] ✗ ' + escapeHtml(err.message), 'error-msg'));
  }

  function getMemoryType(key) {
    if (key.includes('switch')) return { type: 'switch', label: '切换', color: '#9C27B0' };
    if (key.includes('user')) return { type: 'user', label: '用户', color: '#2196F3' };
    if (key.includes('game')) return { type: 'game', label: '游戏', color: '#4CAF50' };
    return { type: 'interaction', label: '交互', color: '#FF9800' };
  }

  function renderMemoryList(data) {
    if (data.items) {
      const { items, pagination } = data;
      memoryPage = pagination.page;
      memoryTotalPages = pagination.totalPages;
      
      memoryListEl.innerHTML = '';
      
      if (items.length === 0) {
        memoryListEl.innerHTML = '<div style="padding:40px;text-align:center;color:#999;grid-column:1/-1;">暂无记忆</div>';
        updatePaginationUI(pagination);
        return;
      }
      
      items.forEach(({ key, value, timestamp }) => {
        const typeInfo = getMemoryType(key);
        const card = document.createElement('div');
        card.className = 'memory-card type-' + typeInfo.type;
        
        const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
        const displayVal = val.length > 60 ? val.substring(0, 60) + '...' : val;
        
        card.innerHTML = `
          <div class="memory-key">${escapeHtml(key)}</div>
          <div class="memory-value">${escapeHtml(displayVal)}</div>
          <div class="memory-meta">
            <span class="memory-type" style="background:${typeInfo.color}20;color:${typeInfo.color}">${typeInfo.label}</span>
            <span class="memory-time">${timestamp ? new Date(timestamp).toLocaleString() : ''}</span>
            <button class="delete-btn" data-key="${escapeHtml(key)}">×</button>
          </div>
        `;
        
        card.querySelector('.delete-btn').addEventListener('click', function() {
          const keyToDelete = this.dataset.key;
          deleteMemory(keyToDelete);
        });
        
        memoryListEl.appendChild(card);
      });
      
      updatePaginationUI(pagination);
    } else {
      allMemory = data || {};
      const search = memorySearchEl?.value?.toLowerCase() || '';
      const entries = Object.entries(data || {}).filter(([k]) => 
        !k.startsWith('__') && (search === '' || k.toLowerCase().includes(search))
      );
      
      memoryListEl.innerHTML = '';
      
      if (entries.length === 0) {
        memoryListEl.innerHTML = '<div style="padding:40px;text-align:center;color:#999;grid-column:1/-1;">暂无记忆</div>';
        return;
      }
      
      entries.forEach(([key, value]) => {
        const typeInfo = getMemoryType(key);
        const card = document.createElement('div');
        card.className = 'memory-card type-' + typeInfo.type;
        
        const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
        const displayVal = val.length > 60 ? val.substring(0, 60) + '...' : val;
        
        card.innerHTML = `
          <div class="memory-key">${escapeHtml(key)}</div>
          <div class="memory-value">${escapeHtml(displayVal)}</div>
          <div class="memory-meta">
            <span class="memory-type" style="background:${typeInfo.color}20;color:${typeInfo.color}">${typeInfo.label}</span>
            <button class="delete-btn" data-key="${escapeHtml(key)}">×</button>
          </div>
        `;
        
        card.querySelector('.delete-btn').addEventListener('click', function() {
          const keyToDelete = this.dataset.key;
          deleteMemory(keyToDelete);
        });
        
        memoryListEl.appendChild(card);
      });
    }
  }

  function updatePaginationUI(pagination) {
    const paginationEl = document.getElementById('memory-pagination');
    if (!paginationEl) return;
    
    const page = Number.isInteger(pagination.page) ? pagination.page : 1;
    const totalPages = Number.isInteger(pagination.totalPages) ? pagination.totalPages : 1;
    const total = Number.isInteger(pagination.total) ? pagination.total : 0;
    const hasPrev = page > 1;
    const hasNext = page < totalPages;

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '上一页';
    prevBtn.disabled = !hasPrev;
    prevBtn.addEventListener('click', () => loadMemoryPage(page - 1));

    const nextBtn = document.createElement('button');
    nextBtn.textContent = '下一页';
    nextBtn.disabled = !hasNext;
    nextBtn.addEventListener('click', () => loadMemoryPage(page + 1));

    const info = document.createElement('span');
    info.textContent = `第 ${page}/${totalPages} 页 (共 ${total} 条)`;

    paginationEl.innerHTML = '';
    paginationEl.appendChild(prevBtn);
    paginationEl.appendChild(info);
    paginationEl.appendChild(nextBtn);
  }

  function loadMemory(page = 1, query = '') {
    memoryQuery = query || memoryQuery;
    const params = new URLSearchParams({ page, query: memoryQuery });
    fetch('/api/memory?' + params)
      .then(r => r.json())
      .then(data => renderMemoryList(data))
      .catch(() => renderMemoryList({}));
  }

  window.filterMemory = function() {
    memoryQuery = memorySearchEl?.value || '';
    loadMemory(1, memoryQuery);
  };

  window.loadMemoryPage = function(page) {
    loadMemory(page, memoryQuery);
  };

  window.deleteMemory = function(key) {
    if (!confirm('确定要删除这条记忆吗？')) return;
    fetch('/api/memory/' + encodeURIComponent(key), { method: 'DELETE' })
      .then(r => r.json())
      .then(() => {
        loadMemory(memoryPage, memoryQuery);
        append('[记忆] 已删除', 'system-msg');
      })
      .catch(() => append('[记忆] 删除失败', 'error-msg'));
  };

  window.exportMemory = function() {
    fetch('/api/memory?export=true&format=json')
      .then(r => r.json())
      .then(data => {
        const blob = new Blob([data.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'memory-' + new Date().toISOString().slice(0,10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        append('[记忆] ✓ 已导出 JSON', 'system-msg');
      })
      .catch(() => append('[记忆] 导出失败', 'error-msg'));
  };

  window.clearMemory = function() {
    if (!confirm('确定要清空所有记忆吗？')) return;
    fetch('/api/memory', { method: 'DELETE' })
      .then(r => r.json())
      .then(() => {
        allMemory = {};
        renderMemoryList({});
        append('[记忆] ✓ 已清空', 'system-msg');
      })
      .catch(() => append('[记忆] 清空失败', 'error-msg'));
  };

  window.openCreateModal = function() {
    document.getElementById('create-modal').classList.add('show');
  };

  window.closeCreateModal = function() {
    document.getElementById('create-modal').classList.remove('show');
  };

  window.createPersonality = function() {
    const name = document.getElementById('new-personality-name').value.trim();
    const desc = document.getElementById('new-personality-desc').value.trim();
    const style = document.getElementById('new-personality-style').value;
    
    if (!name) {
      alert('请输入人格名称');
      return;
    }
    
    fetch('/api/personality/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc, style })
    })
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        append('[系统] ✓ 人格 "' + name + '" 创建成功', 'system-msg');
        closeCreateModal();
        loadPersonality();
        document.getElementById('new-personality-name').value = '';
        document.getElementById('new-personality-desc').value = '';
      } else {
        append('[系统] ✗ 创建失败: ' + (data.error || '未知错误'), 'error-msg');
      }
    })
    .catch(err => append('[系统] ✗ ' + err.message, 'error-msg'));
  };

  function initVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      voiceBtn.style.display = 'none';
      return;
    }
    
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';
    
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      input.value = result[0].transcript;
      if (result.isFinal) {
        stopListening();
        sendMessage(input.value);
      }
    };
    
    recognition.onerror = () => stopListening();
    recognition.onend = () => stopListening();
  }

  function startListening() {
    if (!recognition || isListening) return;
    isListening = true;
    voiceBtn.classList.add('listening');
    voiceBtn.textContent = '🔴';
    recognition.start();
  }

  function stopListening() {
    if (!recognition || !isListening) return;
    isListening = false;
    voiceBtn.classList.remove('listening');
    voiceBtn.textContent = '🎤';
    recognition.stop();
  }

  voiceBtn.addEventListener('click', () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  });

  function connectSocket() {
    if (typeof io === 'undefined') return;
    
    socket = io();
    
    socket.on('connect', () => {
      updateConnectionStatus(true);
    });
    
    socket.on('disconnect', () => {
      updateConnectionStatus(false);
      attemptReconnect();
    });
    
    socket.on('mood', (data) => {
      updateMoodDisplay(data.mood);
    });
    
    socket.on('connect_error', () => {
      updateConnectionStatus(false);
    });
  }

  function attemptReconnect() {
    if (reconnectAttempts >= maxReconnectAttempts) {
      append('[系统] 连接失败，请刷新页面', 'error-msg');
      return;
    }
    
    reconnectOverlay.classList.add('show');
    reconnectAttempts++;
    
    setTimeout(() => {
      if (socket) socket.connect();
      loadPersonality();
    }, 2000 * reconnectAttempts);
  }

  function sendMessage(text) {
    if (!text.trim()) return;
    
    append(text, 'user-msg');
    conversationHistory.push({ role: 'user', content: text });
    if (conversationHistory.length > maxHistoryLength) {
      conversationHistory.shift();
    }
    
    showTypingIndicator();
    
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, history: conversationHistory })
    })
    .then(r => r.json())
    .then(data => {
      hideTypingIndicator();
      
      const reply = data.reply || '无回复';
      const detectedMood = detectMood(reply);
      updateMoodDisplay(detectedMood);
      append(reply, 'ai-msg', true, currentPersonality);
      speak(reply, detectedMood);
      
      conversationHistory.push({ role: 'assistant', content: reply });
      if (conversationHistory.length > maxHistoryLength) {
        conversationHistory.shift();
      }
    })
    .catch(err => {
      hideTypingIndicator();
      append('[错误] ' + err.message, 'error-msg');
      updateConnectionStatus(false);
    });
  }

  sendBtn.addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendMessage(text);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      sendMessage(text);
    }
  });

  ttsToggle.addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    ttsToggle.classList.toggle('active', ttsEnabled);
    ttsToggle.querySelector('.icon').textContent = ttsEnabled ? '🔊' : '🔇';
    
    if (voiceAvatar) {
      if (ttsEnabled) {
        voiceAvatar.enable();
      } else {
        voiceAvatar.disable();
      }
    }
    
    append('[系统] ' + (ttsEnabled ? '🔊' : '🔇') + ' 语音' + (ttsEnabled ? '已开启' : '已关闭'), 'system-msg');
  });

  modelSelect.addEventListener('change', () => {
    const model = modelSelect.value;
    fetch('/api/ollama/model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    })
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        append('[系统] 已切换到模型: ' + model, 'system-msg');
      }
    })
    .catch(() => {});
  });

  memorySearchEl?.addEventListener('input', () => {
    if (!memoryQuery) loadMemory(1, memorySearchEl.value);
  });

  memorySearchEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') filterMemory();
  });

  document.getElementById('create-modal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      closeCreateModal();
    }
  });

  function initVisionSystem() {
    if (typeof MultiModalVision === 'undefined') return;

    visionSystem = new MultiModalVision({
      apiEndpoint: '/api/vision',
      ollamaEndpoint: 'http://localhost:11434',
      defaultModel: 'llava',
      maxImageSize: 1024,
      imageQuality: 0.8,
      onError: (error) => {
        append('[视觉] 错误: ' + error.message, 'error-msg');
      }
    });

    const cameraBtn = document.getElementById('vision-camera');
    const screenBtn = document.getElementById('vision-screen');
    const uploadBtn = document.getElementById('vision-upload');
    const fileInput = document.getElementById('vision-file-input');
    const preview = document.getElementById('vision-preview');
    const imageEl = document.getElementById('vision-image');
    const resultDiv = document.getElementById('vision-result');
    const resultText = document.getElementById('vision-result-text');

    if (cameraBtn) {
      cameraBtn.addEventListener('click', async () => {
        const support = visionSystem.isSupported();
        if (!support.camera) {
          append('[视觉] 摄像头不支持', 'error-msg');
          return;
        }

        const result = await visionSystem.captureFromCamera();
        if (result.success) {
          const frame = visionSystem.captureFrame();
          if (frame.success) {
            await analyzeVisionImage(frame.imageData);
          }
          visionSystem.stopCamera();
        }
      });
    }

    if (screenBtn) {
      screenBtn.addEventListener('click', async () => {
        const support = visionSystem.isSupported();
        if (!support.screen) {
          append('[视觉] 屏幕截图不支持', 'error-msg');
          return;
        }

        const result = await visionSystem.captureScreen();
        if (result.success) {
          await analyzeVisionImage(result.imageData);
        }
      });
    }

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
          await analyzeVisionImage(event.target.result);
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
      });
    }

    async function analyzeVisionImage(imageData) {
      if (!preview || !imageEl || !resultDiv || !resultText) return;

      imageEl.src = imageData;
      preview.style.display = 'block';
      resultDiv.style.display = 'block';
      resultText.textContent = '正在分析...';
      append('[视觉] 正在分析图片...', 'system-msg');

      try {
        const prompt = `你是${currentPersonality}，请用你的风格描述这张图片`;
        const result = await visionSystem.analyzeWithOllama(imageData, prompt);

        if (result.success) {
          resultText.textContent = result.description;
          append(`[视觉] ${currentPersonality}: ${result.description}`, 'ai-msg', true, currentPersonality);
        } else {
          resultText.textContent = '分析失败: ' + result.error;
          append('[视觉] 分析失败: ' + result.error, 'error-msg');
        }
      } catch (error) {
        resultText.textContent = '错误: ' + error.message;
        append('[视觉] 错误: ' + error.message, 'error-msg');
      }
    }
  }

  function initPerformanceOptimizer() {
    if (typeof PerformanceOptimizer === 'undefined') return;

    performanceOptimizer = new PerformanceOptimizer({
      cacheMaxSize: 500,
      cacheTTL: 300000,
      maxConcurrent: 3
    });
  }

  initVoiceInput();
  initLive2DControls();
  initVisionSystem();
  initPerformanceOptimizer();
  connectSocket();
  loadPersonality();

  document.getElementById('btn-create-memory')?.addEventListener('click', openCreateModal);
  document.getElementById('btn-filter-memory')?.addEventListener('click', filterMemory);
  document.getElementById('btn-export-memory')?.addEventListener('click', exportMemory);
  document.getElementById('btn-clear-memory')?.addEventListener('click', clearMemory);
  document.getElementById('btn-modal-cancel')?.addEventListener('click', closeCreateModal);
  document.getElementById('btn-modal-submit')?.addEventListener('click', createPersonality);

  initTaskManagement();

  setTimeout(() => {
    reconnectOverlay.classList.remove('show');
  }, 5000);
})();

function initTaskManagement() {
  if (typeof TaskResultViewer !== 'undefined') {
    const viewer = new TaskResultViewer('task-list', {
      refreshInterval: 5000,
      onTaskSelect: (task) => {
        append(`[任务详情] ${task.config?.goal || task.config?.template}`, 'system-msg');
        if (task.screenshots?.length > 0) {
          append('[截图] 任务执行过程中有截图记录', 'system-msg');
        }
      }
    });

    viewer.onTemplateSelect = function(template) {
      const modal = document.getElementById('task-modal');
      const commandInput = document.getElementById('task-command');

      if (commandInput) {
        const paramStr = template.params.map(p => `[${p}]`).join(' ');
        commandInput.value = `${template.name}: ${paramStr}`;
        commandInput.placeholder = template.description;
      }

      if (modal) modal.classList.add('show');
    };

    viewer.init();
    window.taskViewer = viewer;
  }

  const btnNewTask = document.getElementById('btn-new-task');
  const btnIdentity = document.getElementById('btn-task-identity');
  const btnBrowser = document.getElementById('btn-task-browser');
  const taskModal = document.getElementById('task-modal');
  const identityModal = document.getElementById('identity-modal');
  const browserModal = document.getElementById('browser-modal');

  let currentIdentity = null;
  let taskList = [];

  if (btnNewTask) {
    btnNewTask.addEventListener('click', () => {
      taskModal?.classList.add('show');
    });
  }

  if (btnIdentity) {
    btnIdentity.addEventListener('click', () => {
      identityModal?.classList.add('show');
    });
  }

  if (btnBrowser) {
    btnBrowser.addEventListener('click', () => {
      browserModal?.classList.add('show');
    });
  }

  document.getElementById('btn-task-cancel')?.addEventListener('click', () => {
    taskModal?.classList.remove('show');
  });

  document.getElementById('btn-task-submit')?.addEventListener('click', async () => {
    const command = document.getElementById('task-command')?.value;
    const mode = document.getElementById('task-mode')?.value;

    if (!command) {
      append('[任务] 请输入任务描述', 'error-msg');
      return;
    }

    const task = {
      id: `task_${Date.now()}`,
      command,
      mode,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    taskList.push(task);
    renderTaskList(taskList);
    taskModal?.classList.remove('show');

    append(`[任务] 已创建: ${command}`, 'system-msg');

    try {
      const response = await fetch('/api/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      });

      const result = await response.json();
      task.status = result.success ? 'completed' : 'failed';
      task.result = result;
      renderTaskList(taskList);

      append(`[任务] ${task.status === 'completed' ? '✅' : '❌'} ${command}`, 'system-msg');
    } catch (error) {
      task.status = 'error';
      task.error = error.message;
      renderTaskList(taskList);
      append(`[任务] 错误: ${error.message}`, 'error-msg');
    }
  });

  document.getElementById('btn-identity-cancel')?.addEventListener('click', () => {
    identityModal?.classList.remove('show');
  });

  document.getElementById('btn-identity-create')?.addEventListener('click', async () => {
    const name = document.getElementById('identity-name-input')?.value;
    const capabilities = document.getElementById('identity-capabilities')?.value;

    if (!name) {
      append('[身份] 请输入Agent名称', 'error-msg');
      return;
    }

    try {
      const response = await fetch('/api/agent/identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, capabilities: capabilities?.split(',') || [] })
      });

      const result = await response.json();
      currentIdentity = result;

      document.getElementById('identity-name').textContent = result.name;
      document.getElementById('identity-did').textContent = result.did || '-';
      document.getElementById('identity-reputation').textContent = result.reputation?.score || 0;

      identityModal?.classList.remove('show');
      append(`[身份] 已创建: ${name}`, 'system-msg');
    } catch (error) {
      append(`[身份] 错误: ${error.message}`, 'error-msg');
    }
  });

  document.getElementById('btn-browser-cancel')?.addEventListener('click', () => {
    browserModal?.classList.remove('show');
  });

  document.getElementById('btn-browser-open')?.addEventListener('click', async () => {
    const url = document.getElementById('browser-url-input')?.value;

    if (!url) {
      append('[浏览器] 请输入URL', 'error-msg');
      return;
    }

    try {
      const response = await fetch('/api/agent/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'goto', url })
      });

      const result = await response.json();
      document.getElementById('browser-connected').textContent = '已连接';
      document.getElementById('browser-url').textContent = url;

      browserModal?.classList.remove('show');
      append(`[浏览器] 已打开: ${url}`, 'system-msg');
    } catch (error) {
      append(`[浏览器] 错误: ${error.message}`, 'error-msg');
    }
  });

  function renderTaskList(tasks) {
    const container = document.getElementById('task-list');
    if (!container) return;

    container.innerHTML = '';

    if (tasks.length === 0) {
      container.innerHTML = '<p style="color:#999; text-align:center; padding:20px;">暂无任务，点击 "+新任务" 创建</p>';
      return;
    }

    tasks.forEach(task => {
      const statusColors = {
        pending: '#FFC107',
        running: '#2196F3',
        completed: '#4CAF50',
        failed: '#f44336',
        error: '#9C27B0'
      };

      const statusText = {
        pending: '等待中',
        running: '执行中',
        completed: '已完成',
        failed: '失败',
        error: '错误'
      };

      const card = document.createElement('div');
      card.className = 'memory-card';
      card.style.borderLeftColor = statusColors[task.status] || '#999';
      card.innerHTML = `
        <div class="memory-key">${escapeHtml(task.command.substring(0, 50))}</div>
        <div class="memory-meta">
          <span class="memory-type" style="background:${statusColors[task.status]}20;color:${statusColors[task.status]}">${statusText[task.status]}</span>
          <span class="memory-time">${new Date(task.createdAt).toLocaleTimeString()}</span>
        </div>
      `;
      container.appendChild(card);
    });
  }

  renderTaskList(taskList);
}
