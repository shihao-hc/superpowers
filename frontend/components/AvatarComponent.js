class AvatarComponent {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.currentMood = 'neutral';
    this.currentPersonality = null;
    this.isSpeaking = false;
    this.avatarConfig = null;
    this.speakAnimation = null;
    
    this.options = {
      size: options.size || 120,
      moodAnimationDuration: options.moodAnimationDuration || 300,
      speakAnimationDuration: options.speakAnimationDuration || 300,
      enableGlow: options.enableGlow !== false,
      enableStatusDot: options.enableStatusDot !== false,
      ...options
    };
    
    this.init();
  }

  init() {
    if (!this.container) {
      console.warn('[Avatar] Container not found');
      return;
    }

    this.container.innerHTML = '';
    this.container.className = 'avatar-container';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'avatar-wrapper';
    wrapper.style.width = `${this.options.size}px`;
    wrapper.style.height = `${this.options.size}px`;
    
    const img = document.createElement('img');
    img.className = 'avatar-image';
    img.alt = 'Avatar';
    img.style.width = '100%';
    img.style.height = '100%';
    
    if (this.options.enableGlow) {
      const glow = document.createElement('div');
      glow.className = 'avatar-glow';
      wrapper.appendChild(glow);
    }
    
    wrapper.appendChild(img);
    
    if (this.options.enableStatusDot) {
      const status = document.createElement('div');
      status.className = 'avatar-status';
      status.innerHTML = '🟢';
      status.id = this.container.id + '-status';
      wrapper.appendChild(status);
    }
    
    this.container.appendChild(wrapper);
    
    this.avatarImg = img;
    this.avatarWrapper = wrapper;
    this.statusDot = document.getElementById(this.container.id + '-status');
    
    this.applyDefaultStyle();
  }

  setPersonality(personality) {
    this.currentPersonality = personality;
    
    if (personality.avatar) {
      this.avatarConfig = personality.avatar;
      const avatarUrl = personality.avatar.default || this.getDefaultAvatar();
      this.setAvatar(avatarUrl);
    } else {
      this.setAvatar(this.getDefaultAvatar());
    }
  }

  setAvatar(url) {
    if (this.avatarImg) {
      this.avatarImg.src = url;
      this.avatarImg.onerror = () => {
        this.avatarImg.src = this.getDefaultAvatar();
      };
    }
  }

  setMood(mood) {
    if (this.currentMood === mood) return;
    
    const prevMood = this.currentMood;
    this.currentMood = mood;
    
    this.avatarWrapper.classList.remove(`mood-${prevMood}`);
    this.avatarWrapper.classList.add(`mood-${mood}`);
    
    if (this.avatarConfig?.moods?.[mood]) {
      this.setAvatar(this.avatarConfig.moods[mood]);
    }
    
    this.triggerMoodAnimation(mood);
  }

  triggerMoodAnimation(mood) {
    const animations = {
      happy: () => this.bounceAnimation(),
      excited: () => this.shakeAnimation(),
      sad: () => this.slowDownAnimation(),
      curious: () => this.tiltAnimation(),
      shy: () => this.blushAnimation(),
      proud: () => this.glowAnimation()
    };

    if (animations[mood]) {
      animations[mood]();
    }
  }

  bounceAnimation() {
    this.avatarImg.style.animation = 'bounce-happy 0.5s ease';
    setTimeout(() => {
      this.avatarImg.style.animation = '';
    }, 500);
  }

  shakeAnimation() {
    this.avatarWrapper.classList.add('mood-excited');
    setTimeout(() => {
      this.avatarWrapper.classList.remove('mood-excited');
    }, 1500);
  }

  slowDownAnimation() {
    this.avatarImg.style.filter = 'saturate(0.7) brightness(0.9)';
    this.avatarImg.style.transform = 'rotate(-5deg)';
  }

  tiltAnimation() {
    this.avatarImg.style.animation = 'tilt-curious 1s ease infinite';
    setTimeout(() => {
      this.avatarImg.style.animation = '';
    }, 3000);
  }

  blushAnimation() {
    this.avatarImg.style.filter = 'brightness(1.05)';
    this.avatarImg.style.transform = 'scale(0.95)';
  }

  glowAnimation() {
    this.avatarImg.style.transform = 'scale(1.05)';
    this.avatarImg.style.filter = 'brightness(1.1) drop-shadow(0 0 10px rgba(255, 215, 0, 0.5))';
  }

  speak() {
    if (this.isSpeaking) return;
    
    this.isSpeaking = true;
    this.avatarWrapper.classList.add('speaking');
    
    if (this.statusDot) {
      this.statusDot.classList.add('speaking');
      this.statusDot.textContent = '🔵';
    }
    
    this.avatarImg.style.animation = 'pulse-speak 0.3s ease infinite';
    
    clearTimeout(this.speakAnimation);
    this.speakAnimation = setTimeout(() => {
      this.stopSpeaking();
    }, 3000);
  }

  stopSpeaking() {
    this.isSpeaking = false;
    this.avatarWrapper.classList.remove('speaking');
    
    if (this.statusDot) {
      this.statusDot.classList.remove('speaking');
      this.statusDot.textContent = '🟢';
    }
    
    this.avatarImg.style.animation = '';
  }

  setOnline(online = true) {
    if (this.statusDot) {
      this.statusDot.classList.toggle('offline', !online);
      this.statusDot.textContent = online ? '🟢' : '🔴';
    }
  }

  getDefaultAvatar() {
    const defaultAvatars = [
      '/frontend/avatars/fox-nine.svg',
      '/frontend/avatars/kawaii.svg',
      '/frontend/avatars/elie.svg'
    ];
    return defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)];
  }

  applyDefaultStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .avatar-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }
      
      .avatar-wrapper {
        position: relative;
        border-radius: 50%;
        overflow: visible;
      }
      
      .avatar-image {
        border-radius: 50%;
        transition: transform 0.3s ease, filter 0.3s ease;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }
      
      .avatar-glow {
        position: absolute;
        top: -10px;
        left: -10px;
        right: -10px;
        bottom: -10px;
        border-radius: 50%;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s ease;
        z-index: -1;
      }
      
      .mood-happy .avatar-glow { 
        background: radial-gradient(circle, rgba(255,215,0,0.3) 0%, transparent 70%); 
        opacity: 1; 
      }
      .mood-excited .avatar-glow { 
        background: radial-gradient(circle, rgba(255,107,107,0.3) 0%, transparent 70%); 
        opacity: 1; 
      }
      .mood-sad .avatar-glow { 
        background: radial-gradient(circle, rgba(135,206,235,0.3) 0%, transparent 70%); 
        opacity: 1; 
      }
      .mood-curious .avatar-glow { 
        background: radial-gradient(circle, rgba(100,149,237,0.3) 0%, transparent 70%); 
        opacity: 1; 
      }
      .mood-proud .avatar-glow { 
        background: radial-gradient(circle, rgba(255,215,0,0.4) 0%, transparent 70%); 
        opacity: 1; 
      }
      
      .avatar-status {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #4CAF50;
        border: 2px solid #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        transition: all 0.3s ease;
      }
      
      .avatar-status.offline {
        background: #f44336;
      }
      
      .avatar-status.speaking {
        background: #2196F3;
        animation: pulse-status 0.5s ease infinite;
      }
      
      @keyframes bounce-happy {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
      
      @keyframes tilt-curious {
        0%, 100% { transform: rotate(-3deg); }
        50% { transform: rotate(3deg); }
      }
      
      @keyframes pulse-speak {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.03); }
      }
      
      @keyframes pulse-status {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.2); }
      }
    `;
    
    if (!document.getElementById('avatar-component-styles')) {
      style.id = 'avatar-component-styles';
      document.head.appendChild(style);
    }
  }

  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
    }
    clearTimeout(this.speakAnimation);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AvatarComponent };
}
