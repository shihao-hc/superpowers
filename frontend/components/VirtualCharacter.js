class VirtualCharacter {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.width = 400;
    this.height = 500;
    this.currentMood = 'neutral';
    this.currentPersonality = 'AI';
    this.isSpeaking = false;
    this.animationId = null;
    this.mouthOpen = 0;
    this.eyeOpenL = 1;
    this.eyeOpenR = 1;
    this.breathPhase = 0;
    this.blinkTimer = null;
    this.speakTimer = null;
    this.time = 0;

    this.mouseX = 0;
    this.mouseY = 0;
    this.headRotX = 0;
    this.headRotY = 0;
    this.targetRotX = 0;
    this.targetRotY = 0;

    this.particles = [];
    this.speechBubble = null;

    this.colors = {
      skin: '#FFE4C4', hair: '#8B4513', eyes: '#4169E1',
      mouth: '#FF6B6B', blush: '#FFB6C1', outfit: '#4A90D9'
    };

    this.personalityStyles = {
      '狐九': { skin: '#FFE4C4', hair: '#FF6B00', eyes: '#FF8C00', blush: '#FFB6C1', outfit: '#FF8C00', hairStyle: 'fluffy', accessories: ['fox_ears'] },
      '艾利': { skin: '#F5DEB3', hair: '#2F4F4F', eyes: '#4682B4', blush: '#DDA0DD', outfit: '#2F4F4F', hairStyle: 'neat', accessories: ['glasses'] },
      '博士': { skin: '#FAEBD7', hair: '#696969', eyes: '#2E8B57', blush: '#F0E68C', outfit: '#FFFFFF', hairStyle: 'short', accessories: ['lab_coat'] },
      '小埋': { skin: '#FFE4E1', hair: '#FFD700', eyes: '#FF69B4', blush: '#FFB6C1', outfit: '#FF69B4', hairStyle: 'twin_tails', accessories: ['hoodie'] },
      '零': { skin: '#E6E6FA', hair: '#4B0082', eyes: '#9400D3', blush: '#DDA0DD', outfit: '#1A1A2E', hairStyle: 'long', accessories: ['headphones'] },
      '小暖': { skin: '#FFF0F5', hair: '#DEB887', eyes: '#32CD32', blush: '#FFB6C1', outfit: '#98D8C8', hairStyle: 'bob', accessories: ['apron'] },
      '段子手': { skin: '#FFEFD5', hair: '#FF4500', eyes: '#FFD700', blush: '#FFA07A', outfit: '#FFD700', hairStyle: 'spiky', accessories: ['cap'] },
      '墨兰': { skin: '#FAF0E6', hair: '#000000', eyes: '#8B0000', blush: '#FFB6C1', outfit: '#8B0000', hairStyle: 'classical', accessories: ['hanfu'] },
      '钢铁星': { skin: '#D3D3D3', hair: '#C0C0C0', eyes: '#00CED1', blush: '#B0C4DE', outfit: '#2C3E50', hairStyle: 'short', accessories: ['mech_parts'] },
      '甜甜': { skin: '#FFF5EE', hair: '#FF69B4', eyes: '#FF1493', blush: '#FFB6C1', outfit: '#FFB6C1', hairStyle: 'curly', accessories: ['ribbon'] }
    };

    this.currentStyle = this.personalityStyles['狐九'];

    this.moodModifiers = {
      happy: { eyeScale: 1.15, mouthCurve: 0.4, blush: 0.4, eyebrow: -0.1 },
      sad: { eyeScale: 0.75, mouthCurve: -0.3, blush: 0, eyebrow: 0.2 },
      excited: { eyeScale: 1.25, mouthCurve: 0.6, blush: 0.6, eyebrow: -0.2 },
      curious: { eyeScale: 1.05, mouthCurve: 0.1, blush: 0.15, eyebrow: 0.15 },
      calm: { eyeScale: 0.85, mouthCurve: 0.05, blush: 0, eyebrow: 0 },
      shy: { eyeScale: 0.65, mouthCurve: 0.1, blush: 0.7, eyebrow: 0.1 },
      proud: { eyeScale: 0.95, mouthCurve: 0.25, blush: 0.25, eyebrow: -0.15 },
      neutral: { eyeScale: 1.0, mouthCurve: 0, blush: 0, eyebrow: 0 },
      love: { eyeScale: 0.9, mouthCurve: 0.3, blush: 0.5, eyebrow: -0.05 },
      angry: { eyeScale: 1.1, mouthCurve: -0.2, blush: 0, eyebrow: 0.3 },
      surprised: { eyeScale: 1.3, mouthCurve: 0, blush: 0.2, eyebrow: -0.3 }
    };

    this.phonemeShapes = {
      'a': { mouthW: 1.0, mouthH: 1.0, tongue: 0.3 },
      'i': { mouthW: 0.4, mouthH: 0.6, tongue: 0 },
      'u': { mouthW: 0.3, mouthH: 0.8, tongue: 0.2 },
      'e': { mouthW: 0.7, mouthH: 0.5, tongue: 0 },
      'o': { mouthW: 0.5, mouthH: 0.9, tongue: 0.4 },
      'm': { mouthW: 0.8, mouthH: 0.1, tongue: 0 },
      'n': { mouthW: 0.6, mouthH: 0.2, tongue: 0.5 }
    };
  }

  init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) return;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.borderRadius = '16px';
    this.canvas.style.maxWidth = '100%';
    this.ctx = this.canvas.getContext('2d');

    this.container.innerHTML = '';
    this.container.appendChild(this.canvas);

    this._setupMouseTracking();
    this._startAnimation();
    this._startBlink();
    this._initParticles();
  }

  _setupMouseTracking() {
    this._mouseMoveHandler = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - rect.left) / rect.width * 2 - 1;
      this.mouseY = (e.clientY - rect.top) / rect.height * 2 - 1;
    };

    this._mouseLeaveHandler = () => {
      this.mouseX = 0;
      this.mouseY = 0;
    };

    this.canvas.addEventListener('mousemove', this._mouseMoveHandler);
    this.canvas.addEventListener('mouseleave', this._mouseLeaveHandler);
  }

  _initParticles() {
    for (let i = 0; i < 15; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: Math.random() * 3 + 1,
        speed: Math.random() * 0.5 + 0.2,
        opacity: Math.random() * 0.5 + 0.2
      });
    }
  }

  setPersonality(name) {
    this.currentPersonality = name;
    if (this.personalityStyles[name]) {
      this.currentStyle = this.personalityStyles[name];
      this.colors = { ...this.personalityStyles[name] };
    }
    this._addParticleBurst();
  }

  setMood(mood) {
    this.currentMood = mood;
  }

  speak(text) {
    this.isSpeaking = true;
    this.speechBubble = { text: text || '', opacity: 1 };
    this._animateMouthWithText(text);
  }

  stopSpeaking() {
    this.isSpeaking = false;
    this.mouthOpen = 0;
    if (this.speakTimer) {
      clearInterval(this.speakTimer);
      this.speakTimer = null;
    }
    if (this.speechBubble) {
      this.speechBubble.opacity = 0;
    }
  }

  _animateMouthWithText(text) {
    if (this.speakTimer) clearInterval(this.speakTimer);

    let charIndex = 0;
    const chars = (text || '').split('');

    this.speakTimer = setInterval(() => {
      if (!this.isSpeaking || charIndex >= chars.length) {
        this.mouthOpen = Math.max(0, this.mouthOpen - 0.1);
        if (this.mouthOpen <= 0) {
          this.mouthOpen = 0;
          clearInterval(this.speakTimer);
        }
        return;
      }

      const char = chars[charIndex];
      if (/[aeiouAEIOU]/.test(char)) {
        this.mouthOpen = 0.6 + Math.random() * 0.4;
      } else if (/[bpmf]/.test(char.toLowerCase())) {
        this.mouthOpen = 0.1;
      } else {
        this.mouthOpen = 0.3 + Math.random() * 0.3;
      }
      charIndex++;
    }, 60);
  }

  _addParticleBurst() {
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x: this.width / 2 + (Math.random() - 0.5) * 100,
        y: this.height / 2,
        size: Math.random() * 4 + 2,
        speed: Math.random() * 2 + 1,
        opacity: 1,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 3 - 1,
        life: 60
      });
    }
  }

  _startBlink() {
    const blink = () => {
      this.eyeOpenL = 0;
      this.eyeOpenR = 0;
      setTimeout(() => {
        this.eyeOpenL = 1;
        this.eyeOpenR = 1;
      }, 120);
      this.blinkTimer = setTimeout(blink, 2500 + Math.random() * 3000);
    };
    this.blinkTimer = setTimeout(blink, 1500);
  }

  _startAnimation() {
    const animate = () => {
      this.time += 0.016;
      this.breathPhase = Math.sin(this.time * 1.5) * 4;

      this.headRotX += (this.targetRotX - this.headRotX) * 0.08;
      this.headRotY += (this.targetRotY - this.headRotY) * 0.08;
      this.targetRotX = this.mouseY * 0.15;
      this.targetRotY = this.mouseX * 0.2;

      this._updateParticles();
      this._draw();
      this.animationId = requestAnimationFrame(animate);
    };
    animate();
  }

  _updateParticles() {
    this.particles = this.particles.filter(p => {
      if (p.life !== undefined) {
        p.life--;
        p.x += p.vx || 0;
        p.y += p.vy || 0;
        p.opacity = Math.max(0, p.life / 60);
        return p.life > 0;
      }
      p.y -= p.speed;
      if (p.y < -10) {
        p.y = this.height + 10;
        p.x = Math.random() * this.width;
      }
      return true;
    });
  }

  _draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const cx = w / 2;
    const cy = h / 2 - 20;
    const mood = this.moodModifiers[this.currentMood] || this.moodModifiers.neutral;

    ctx.clearRect(0, 0, w, h);

    this._drawBackground(ctx, w, h);
    this._drawParticles(ctx);

    ctx.save();
    ctx.translate(0, this.breathPhase);

    this._drawBody(ctx, cx, cy + 100);
    this._drawNeck(ctx, cx, cy + 30);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.headRotY * 0.1);
    ctx.translate(-cx, -cy);

    this._drawEars(ctx, cx, cy - 90);
    this._drawHairBack(ctx, cx, cy - 60);
    this._drawHead(ctx, cx, cy - 30);
    this._drawEyes(ctx, cx - 30, cy - 45, 'left', mood);
    this._drawEyes(ctx, cx + 30, cy - 45, 'right', mood);
    this._drawEyebrows(ctx, cx, cy - 65, mood);
    this._drawNose(ctx, cx, cy - 25);
    this._drawMouth(ctx, cx, cy - 10, mood);
    this._drawBlush(ctx, cx, cy - 30, mood);
    this._drawHairFront(ctx, cx, cy - 80);
    this._drawAccessories(ctx, cx, cy);

    ctx.restore();
    ctx.restore();

    this._drawSpeechBubble(ctx, w - 20, 40);
    this._drawMoodIndicator(ctx, 30, 30);
    this._drawNameTag(ctx, cx, h - 20);
  }

  _drawBackground(ctx, w, h) {
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(0.5, '#764ba2');
    gradient.addColorStop(1, '#6B73FF');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 20; i++) {
      const x = (Math.sin(this.time * 0.5 + i) * 0.5 + 0.5) * w;
      const y = (i / 20) * h;
      ctx.beginPath();
      ctx.arc(x, y, 100, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawParticles(ctx) {
    this.particles.forEach(p => {
      ctx.fillStyle = `rgba(255,255,255,${p.opacity})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  _drawHead(ctx, cx, cy) {
    ctx.fillStyle = this.colors.skin;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 55, 65, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.ellipse(cx - 20, cy - 25, 25, 35, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawNeck(ctx, cx, cy) {
    ctx.fillStyle = this.colors.skin;
    ctx.beginPath();
    ctx.moveTo(cx - 15, cy);
    ctx.lineTo(cx - 18, cy + 30);
    ctx.lineTo(cx + 18, cy + 30);
    ctx.lineTo(cx + 15, cy);
    ctx.closePath();
    ctx.fill();
  }

  _drawBody(ctx, cx, cy) {
    ctx.fillStyle = this.colors.outfit;
    ctx.beginPath();
    ctx.moveTo(cx - 50, cy - 30);
    ctx.quadraticCurveTo(cx - 70, cy + 20, cx - 55, cy + 100);
    ctx.lineTo(cx + 55, cy + 100);
    ctx.quadraticCurveTo(cx + 70, cy + 20, cx + 50, cy - 30);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 30);
    ctx.lineTo(cx, cy + 20);
    ctx.lineTo(cx + 10, cy - 30);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 50, cy - 30);
    ctx.quadraticCurveTo(cx - 30, cy, cx - 25, cy + 100);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 50, cy - 30);
    ctx.quadraticCurveTo(cx + 30, cy, cx + 25, cy + 100);
    ctx.stroke();
  }

  _drawEars(ctx, cx, cy) {
    if (this.currentStyle.accessories?.includes('fox_ears')) {
      ctx.fillStyle = this.colors.hair;
      [-1, 1].forEach(side => {
        ctx.beginPath();
        ctx.moveTo(cx + side * 45, cy + 20);
        ctx.lineTo(cx + side * 55, cy - 30);
        ctx.lineTo(cx + side * 35, cy + 10);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = this.colors.blush;
        ctx.beginPath();
        ctx.moveTo(cx + side * 45, cy + 15);
        ctx.lineTo(cx + side * 52, cy - 15);
        ctx.lineTo(cx + side * 38, cy + 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = this.colors.hair;
      });
    }
  }

  _drawHairBack(ctx, cx, cy) {
    ctx.fillStyle = this.colors.hair;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 30, 65, 80, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.currentStyle.hairStyle === 'long' || this.currentStyle.hairStyle === 'twin_tails') {
      [-1, 1].forEach(side => {
        ctx.beginPath();
        ctx.moveTo(cx + side * 50, cy);
        ctx.quadraticCurveTo(cx + side * 65, cy + 60, cx + side * 45, cy + 120);
        ctx.quadraticCurveTo(cx + side * 35, cy + 60, cx + side * 40, cy);
        ctx.fill();
      });
    }
  }

  _drawHairFront(ctx, cx, cy) {
    ctx.fillStyle = this.colors.hair;

    ctx.beginPath();
    ctx.moveTo(cx - 55, cy + 30);
    ctx.quadraticCurveTo(cx - 60, cy - 10, cx - 40, cy - 20);
    ctx.quadraticCurveTo(cx, cy - 35, cx + 40, cy - 20);
    ctx.quadraticCurveTo(cx + 60, cy - 10, cx + 55, cy + 30);
    ctx.quadraticCurveTo(cx + 40, cy + 20, cx, cy + 25);
    ctx.quadraticCurveTo(cx - 40, cy + 20, cx - 55, cy + 30);
    ctx.fill();

    const bangs = 7;
    for (let i = 0; i < bangs; i++) {
      const x = cx - 35 + (i * 70 / (bangs - 1));
      const angle = (i / (bangs - 1) - 0.5) * 0.5;
      ctx.beginPath();
      ctx.moveTo(x - 8, cy + 5);
      ctx.quadraticCurveTo(x + angle * 30, cy + 25, x + 5, cy + 35 + Math.sin(this.time * 2 + i) * 3);
      ctx.quadraticCurveTo(x - 5, cy + 20, x - 8, cy + 5);
      ctx.fill();
    }
  }

  _drawEyes(ctx, cx, cy, side, mood) {
    const eyeOpen = side === 'left' ? this.eyeOpenL : this.eyeOpenR;
    const eyeSize = 11 * mood.eyeScale;
    const squint = 1 - eyeOpen * 0.8;

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(cx, cy, eyeSize + 3, (eyeSize + 2) * squint, 0, 0, Math.PI * 2);
    ctx.fill();

    if (eyeOpen > 0.1) {
      ctx.fillStyle = this.colors.eyes;
      ctx.beginPath();
      ctx.ellipse(cx, cy, eyeSize * 0.75, eyeSize * 0.75 * eyeOpen, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(cx, cy, eyeSize * 0.45, eyeSize * 0.45 * eyeOpen, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(cx + 3, cy - 3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - 2, cy + 2, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, eyeSize + 3, (eyeSize + 2) * squint, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawEyebrows(ctx, cx, cy, mood) {
    ctx.strokeStyle = this.colors.hair;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    [-1, 1].forEach(side => {
      ctx.beginPath();
      ctx.moveTo(cx + side * 15, cy + mood.eyebrow * 8);
      ctx.quadraticCurveTo(cx + side * 28, cy - 3 + mood.eyebrow * 12, cx + side * 40, cy + mood.eyebrow * 5);
      ctx.stroke();
    });
  }

  _drawNose(ctx, cx, cy) {
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawMouth(ctx, cx, cy, mood) {
    const mw = 15 + this.mouthOpen * 10;
    const mh = 3 + this.mouthOpen * 18;

    ctx.fillStyle = this.colors.mouth;
    ctx.beginPath();

    if (this.mouthOpen > 0.15) {
      ctx.ellipse(cx, cy, mw, mh, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FF9999';
      ctx.beginPath();
      ctx.ellipse(cx, cy - mh * 0.3, mw * 0.6, mh * 0.25, 0, 0, Math.PI);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.rect(cx - mw * 0.7, cy - 2, mw * 1.4, mh * 0.3);
      ctx.fill();
    } else {
      const curve = mood.mouthCurve;
      ctx.moveTo(cx - mw, cy);
      ctx.quadraticCurveTo(cx, cy + curve * 15, cx + mw, cy);
      ctx.strokeStyle = this.colors.mouth;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  _drawBlush(ctx, cx, cy, mood) {
    if (mood.blush > 0) {
      ctx.fillStyle = `rgba(255,182,193,${mood.blush})`;
      [-1, 1].forEach(side => {
        ctx.beginPath();
        ctx.ellipse(cx + side * 42, cy, 14, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  _drawAccessories(ctx, cx, cy) {
    const style = this.currentStyle;

    if (style.accessories?.includes('glasses')) {
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      [-1, 1].forEach(side => {
        ctx.beginPath();
        ctx.arc(cx + side * 30, cy - 45, 16, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.moveTo(cx - 14, cy - 45);
      ctx.lineTo(cx + 14, cy - 45);
      ctx.stroke();
    }

    if (style.accessories?.includes('headphones')) {
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy - 75, 60, Math.PI * 0.8, Math.PI * 0.2, true);
      ctx.stroke();

      [-1, 1].forEach(side => {
        ctx.fillStyle = '#555';
        this._roundRect(ctx, cx + side * 55 - 10, cy - 40, 20, 30, 5);
        ctx.fill();
      });
    }

    if (style.accessories?.includes('ribbon')) {
      ctx.fillStyle = '#FF69B4';
      [-1, 1].forEach(side => {
        ctx.beginPath();
        ctx.moveTo(cx + side * 50, cy - 60);
        ctx.lineTo(cx + side * 65, cy - 75);
        ctx.lineTo(cx + side * 55, cy - 60);
        ctx.lineTo(cx + side * 65, cy - 45);
        ctx.closePath();
        ctx.fill();
      });
    }
  }

  _drawSpeechBubble(ctx, x, y) {
    if (!this.speechBubble || this.speechBubble.opacity <= 0) return;

    ctx.globalAlpha = this.speechBubble.opacity;

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    this._roundRect(ctx, x - 180, y - 15, 170, 40, 10);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#333';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = this.speechBubble.text.length > 20
      ? this.speechBubble.text.substring(0, 20) + '...'
      : this.speechBubble.text;
    ctx.fillText(text, x - 95, y + 5);

    ctx.globalAlpha = 1;
  }

  _drawMoodIndicator(ctx, x, y) {
    const moodEmojis = {
      happy: '😊', sad: '😢', excited: '🤩', curious: '🤔',
      calm: '😌', shy: '😳', proud: '😤', neutral: '😐',
      love: '😍', angry: '😠', surprised: '😮'
    };

    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(moodEmojis[this.currentMood] || '😐', x, y);
  }

  _drawNameTag(ctx, cx, cy) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this._roundRect(ctx, cx - 60, cy - 14, 120, 28, 14);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`✿ ${this.currentPersonality}`, cx, cy);
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  destroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.blinkTimer) clearTimeout(this.blinkTimer);
    if (this.speakTimer) clearInterval(this.speakTimer);

    if (this.canvas) {
      if (this._mouseMoveHandler) {
        this.canvas.removeEventListener('mousemove', this._mouseMoveHandler);
      }
      if (this._mouseLeaveHandler) {
        this.canvas.removeEventListener('mouseleave', this._mouseLeaveHandler);
      }
    }

    this.canvas = null;
    this.ctx = null;
    this.container = null;
  }
}

if (typeof window !== 'undefined') {
  window.VirtualCharacter = VirtualCharacter;
}
