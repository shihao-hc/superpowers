class Live2DDriver {
  constructor(options = {}) {
    this.canvas = null;
    this.context = null;
    this.model = null;
    this.currentExpression = 'neutral';
    this.currentMotion = 'idle';
    this.mood = 'neutral';
    this.autoBlink = true;
    this.blinkInterval = null;
    this.animations = new Map();
    
    this.expressions = {
      neutral: { eyeOpen: 1.0, mouthOpen: 0, eyebrowAngle: 0, color: '#fff' },
      happy: { eyeOpen: 0.8, mouthOpen: 0.3, eyebrowAngle: -5, color: '#ffeb3b' },
      excited: { eyeOpen: 1.2, mouthOpen: 0.5, eyebrowAngle: -10, color: '#ff9800' },
      playful: { eyeOpen: 0.9, mouthOpen: 0.2, eyebrowAngle: 5, color: '#e91e63' },
      curious: { eyeOpen: 1.1, mouthOpen: 0.1, eyebrowAngle: 10, color: '#2196f3' },
      shy: { eyeOpen: 0.6, mouthOpen: 0.05, eyebrowAngle: 15, color: '#f48fb1' },
      sad: { eyeOpen: 0.7, mouthOpen: 0, eyebrowAngle: 20, color: '#90a4ae' },
      angry: { eyeOpen: 0.8, mouthOpen: 0, eyebrowAngle: -20, color: '#f44336' }
    };
  }

  init(canvasId, modelUrl = null) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error('[Live2D] Canvas not found:', canvasId);
      return false;
    }

    this.context = this.canvas.getContext('2d');
    this.canvas.width = this.canvas.width || 300;
    this.canvas.height = this.canvas.height || 300;

    this._setupAutoBlink();
    this._loadAnimations();
    
    console.log('[Live2D] Initialized');
    return true;
  }

  _setupAutoBlink() {
    if (this.blinkInterval) clearInterval(this.blinkInterval);
    
    this.blinkInterval = setInterval(() => {
      if (this.autoBlink && this.currentExpression !== 'shy') {
        this._blink();
      }
    }, 3000 + Math.random() * 2000);
  }

  _blink() {
    const original = this.expressions[this.currentExpression]?.eyeOpen || 1;
    this.expressions[this.currentExpression].eyeOpen = 0.1;
    this.render();
    
    setTimeout(() => {
      this.expressions[this.currentExpression].eyeOpen = original;
      this.render();
    }, 150);
  }

  _loadAnimations() {
    this.animations.set('idle', {
      type: 'breathe',
      amplitude: 2,
      speed: 0.02
    });
    
    this.animations.set('happy', {
      type: 'bounce',
      amplitude: 5,
      speed: 0.05
    });
    
    this.animations.set('thinking', {
      type: 'sway',
      amplitude: 3,
      speed: 0.01
    });
  }

  setMood(mood) {
    const validMoods = Object.keys(this.expressions);
    if (!validMoods.includes(mood)) {
      console.warn('[Live2D] Unknown mood:', mood);
      mood = 'neutral';
    }
    
    this.mood = mood;
    this.currentExpression = mood;
    this._updateMotion();
    this.render();
    
    console.log('[Live2D] Mood set to:', mood);
  }

  _updateMotion() {
    if (this.mood === 'happy' || this.mood === 'excited') {
      this.currentMotion = 'happy';
    } else if (this.mood === 'curious') {
      this.currentMotion = 'thinking';
    } else {
      this.currentMotion = 'idle';
    }
  }

  playExpression(expression, duration = 2000) {
    if (this.expressions[expression]) {
      this.currentExpression = expression;
      this.render();
      
      setTimeout(() => {
        this.setMood(this.mood);
      }, duration);
    }
  }

  render() {
    if (!this.context) return;
    
    const ctx = this.context;
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    
    const expr = this.expressions[this.currentExpression] || this.expressions.neutral;
    const anim = this.animations.get(this.currentMotion) || this.animations.get('idle');
    
    let offsetY = 0;
    if (anim.type === 'breathe') {
      offsetY = Math.sin(Date.now() * anim.speed) * anim.amplitude;
    } else if (anim.type === 'bounce') {
      offsetY = Math.abs(Math.sin(Date.now() * anim.speed)) * -anim.amplitude;
    } else if (anim.type === 'sway') {
      offsetX = Math.sin(Date.now() * anim.speed) * anim.amplitude;
    }
    
    const centerX = w / 2;
    const centerY = h / 2 + offsetY;
    const faceRadius = Math.min(w, h) * 0.35;
    
    ctx.save();
    ctx.translate(centerX, centerY);
    
    ctx.beginPath();
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, faceRadius);
    gradient.addColorStop(0, '#ffe0b2');
    gradient.addColorStop(0.7, '#ffcc80');
    gradient.addColorStop(1, '#ffb74d');
    ctx.fillStyle = gradient;
    ctx.arc(0, 0, faceRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#5d4037';
    ctx.beginPath();
    ctx.ellipse(0, faceRadius * 0.85, faceRadius * 0.5, faceRadius * 0.15, 0, 0, Math.PI);
    ctx.fill();
    
    const eyeY = -faceRadius * 0.15;
    const eyeSpacing = faceRadius * 0.35;
    const eyeHeight = faceRadius * 0.15 * expr.eyeOpen;
    
    ctx.fillStyle = '#3e2723';
    ctx.beginPath();
    ctx.ellipse(-eyeSpacing, eyeY, faceRadius * 0.08, eyeHeight, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(eyeSpacing, eyeY, faceRadius * 0.08, eyeHeight, 0, 0, Math.PI * 2);
    ctx.fill();
    
    const highlightY = eyeY - eyeHeight * 0.3;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-eyeSpacing + 2, highlightY, faceRadius * 0.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeSpacing + 2, highlightY, faceRadius * 0.03, 0, Math.PI * 2);
    ctx.fill();
    
    const eyebrowY = -faceRadius * 0.4;
    const eyebrowWidth = faceRadius * 0.15;
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    
    ctx.save();
    ctx.translate(-eyeSpacing, eyebrowY);
    ctx.rotate(expr.eyebrowAngle * Math.PI / 180);
    ctx.beginPath();
    ctx.moveTo(-eyebrowWidth, 0);
    ctx.lineTo(eyebrowWidth, 0);
    ctx.stroke();
    ctx.restore();
    
    ctx.save();
    ctx.translate(eyeSpacing, eyebrowY);
    ctx.rotate(-expr.eyebrowAngle * Math.PI / 180);
    ctx.beginPath();
    ctx.moveTo(-eyebrowWidth, 0);
    ctx.lineTo(eyebrowWidth, 0);
    ctx.stroke();
    ctx.restore();
    
    const mouthY = faceRadius * 0.35;
    const mouthWidth = faceRadius * 0.3;
    const mouthOpen = expr.mouthOpen * faceRadius * 0.15;
    
    if (mouthOpen > 1) {
      ctx.fillStyle = '#c62828';
      ctx.beginPath();
      ctx.ellipse(0, mouthY, mouthWidth, mouthOpen, 0, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#7b1fa2';
      ctx.beginPath();
      ctx.ellipse(0, mouthY + mouthOpen * 0.5, mouthWidth * 0.7, mouthOpen * 0.3, 0, 0, Math.PI);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#5d4037';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, mouthY, mouthWidth, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    
    ctx.fillStyle = 'rgba(255, 182, 193, 0.3)';
    ctx.beginPath();
    ctx.ellipse(-faceRadius * 0.5, 0, faceRadius * 0.15, faceRadius * 0.1, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(faceRadius * 0.5, 0, faceRadius * 0.15, faceRadius * 0.1, 0.3, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
    
    requestAnimationFrame(() => this.render());
  }

  setAutoBlink(enabled) {
    this.autoBlink = enabled;
    if (!enabled && this.blinkInterval) {
      clearInterval(this.blinkInterval);
      this.blinkInterval = null;
    } else if (enabled) {
      this._setupAutoBlink();
    }
  }

  destroy() {
    if (this.blinkInterval) {
      clearInterval(this.blinkInterval);
    }
    this.canvas = null;
    this.context = null;
  }

  getStatus() {
    return {
      initialized: !!this.canvas,
      mood: this.mood,
      expression: this.currentExpression,
      motion: this.currentMotion,
      autoBlink: this.autoBlink
    };
  }
}

window.Live2DDriver = Live2DDriver;
