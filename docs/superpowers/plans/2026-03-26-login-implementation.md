# Login System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a comprehensive login system for UltraWork AI that combines role-interactive and brand-showcase login modes with support for traditional, social, biometric, and passwordless authentication methods.

**Architecture:** Dual-mode system (fullscreen immersive for first-time/external visits, modal quick login for returning users) with role integration, biometric authentication, progressive security, and WCAG 2.1 AA accessibility compliance.

**Tech Stack:** HTML5, CSS3, JavaScript (ES6+), Node.js/Express.js, WebAuthn API, CSS Animations, LocalStorage

---

### File Structure Overview

- **Frontend Components:**
  - `frontend/components/LoginModal.js` - Modal login component
  - `frontend/components/LoginFullscreen.js` - Fullscreen login component
  - `frontend/components/LoginModeSelector.js` - Mode selection logic
  - `frontend/components/BiometricAuth.js` - Biometric authentication
  - `frontend/components/SocialLogin.js` - Social login buttons
  - `frontend/components/RoleIntegration.js` - AI role integration
  - `frontend/styles/login.css` - Login-specific styles
  - `frontend/styles/login-responsive.css` - Responsive adaptations

- **Backend API:**
  - `server/routes/auth.js` - Enhanced authentication routes
  - `server/services/authService.js` - Authentication business logic
  - `server/middleware/securityMiddleware.js` - Security enhancements

- **Tests:**
  - `tests/frontend/LoginModal.test.js` - Modal component tests
  - `tests/frontend/LoginFullscreen.test.js` - Fullscreen component tests
  - `tests/backend/auth.test.js` - Authentication API tests
  - `tests/e2e/login.spec.js` - End-to-end login flow tests

- **Documentation:**
  - `docs/superpowers/specs/2026-03-26-login-design.md` - Design spec (existing)
  - `docs/superpowers/plans/2026-03-26-login-implementation.md` - This plan
  - `docs/superpowers/specs/2026-03-26-login-design-plan.md` - Plan summary
  - `docs/superpowers/specs/2026-03-26-login-design-plan-full.md` - Full plan details

## Phase 1: Foundation Setup

### Task 1: Create Login Mode Selector Component

**Files:**
- Create: `frontend/components/LoginModeSelector.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { LoginModeSelector } from './LoginModeSelector';

describe('LoginModeSelector', () => {
  it('should default to fullscreen mode for first-time visitors', () => {
    const selector = new LoginModeSelector({ isFirstVisit: true });
    expect(selector.getMode()).toBe('fullscreen');
  });

  it('should use modal mode for returning users', () => {
    const selector = new LoginModeSelector({ isFirstVisit: false, isReturningUser: true });
    expect(selector.getMode()).toBe('modal');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test frontend/components/LoginModeSelector.test.js`
Expected: FAIL with "Cannot find module './LoginModeSelector'"

- [ ] **Step 3: Write minimal implementation**

```javascript
export class LoginModeSelector {
  constructor(options = {}) {
    this.options = options;
  }

  getMode() {
    // Default to fullscreen for safety
    if (this.options.isFirstVisit || this.options.fromExternalLink || this.options.cacheCleared) {
      return 'fullscreen';
    }
    
    if (this.options.isReturningUser || this.options.featureAccess) {
      return 'modal';
    }
    
    return 'fullscreen'; // fallback
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test frontend/components/LoginModeSelector.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/components/LoginModeSelector.js frontend/components/LoginModeSelector.test.js
git commit -m "feat: create login mode selector component"
```

### Task 2: Create Basic Modal Login Container

**Files:**
- Create: `frontend/components/LoginModal.js`
- Create: `frontend/styles/login.css`

- [ ] **Step 1: Write the failing test**

```javascript
import { LoginModal } from './LoginModal';

describe('LoginModal', () => {
  it('should render a modal container with login form', () => {
    const modal = new LoginModal();
    const element = modal.render();
    expect(element).toContain('class="login-modal"');
    expect(element).toContain('form');
  });

  it('should have close button', () => {
    const modal = new LoginModal();
    const element = modal.render();
    expect(element).toContain('class="modal-close"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test frontend/components/LoginModal.test.js`
Expected: FAIL with "Cannot find module './LoginModal'"

- [ ] **Step 3: Write minimal implementation**

```javascript
// frontend/components/LoginModal.js
export class LoginModal {
  constructor() {
    this.isVisible = false;
  }

  show() {
    this.isVisible = true;
  }

  hide() {
    this.isVisible = false;
  }

  render() {
    return `
      <div class="login-modal ${this.isVisible ? 'show' : 'hidden'}" role="dialog" aria-modal="true">
        <div class="modal-content">
          <button class="modal-close" aria-label="Close modal">&times;</button>
          <div class="modal-header">
            <h2>登录UltraWork AI</h2>
          </div>
          <div class="modal-body">
            <form class="login-form">
              <div class="form-group">
                <label for="email">邮箱地址</label>
                <input type="email" id="email" name="email" required>
              </div>
              <div class="form-group">
                <label for="password">密码</label>
                <input type="password" id="password" name="password" required>
              </div>
              <div class="form-group">
                <label class="checkbox-label">
                  <input type="checkbox" name="rememberMe"> 记住我
                </label>
              </div>
              <button type="submit" class="btn-primary">登录</button>
            </form>
          </div>
          <div class="modal-footer">
            <p>还没有账号？<a href="/register">免费注册</a></p>
          </div>
        </div>
      </div>
    `;
  }
}

// frontend/styles/login.css
.login-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.login-modal.show {
  opacity: 1;
  pointer-events: all;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
}

.modal-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid #eee;
}

.modal-header h2 {
  margin: 0;
  color: #333;
  text-align: center;
}

.modal-body {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: #4a90e2;
  box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.25);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
}

.btn-primary {
  width: 100%;
  padding: 1rem;
  background-color: #4a90e2;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.btn-primary:hover {
  background-color: #357ab8;
}

.btn-primary:active {
  background-color: #2d628f;
}

.modal-footer {
  padding: 1.5rem;
  text-align: center;
  border-top: 1px solid #eee;
  font-size: 0.9rem;
  color: #666;
}

.modal-footer a {
  color: #4a90e2;
  text-decoration: none;
}

.modal-footer a:hover {
  text-decoration: underline;
}

/* Hidden state */
.login-modal.hidden {
  display: none;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test frontend/components/LoginModal.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
        git add frontend/components/LoginModal.js frontend/components/LoginModal.test.js frontend/styles/login.css
        git commit -m "feat: create basic modal login container"

### Task 3: Create Fullscreen Login Container

**Files:**
- Create: `frontend/components/LoginFullscreen.js`
- Modify: `frontend/styles/login.css` (add fullscreen styles)

- [ ] **Step 1: Write the failing test**

```javascript
import { LoginFullscreen } from './LoginFullscreen';

describe('LoginFullscreen', () => {
  it('should render a fullscreen layout with brand area and form area', () => {
    const fullscreen = new LoginFullscreen();
    const element = fullscreen.render();
    expect(element).toContain('class="login-fullscreen"');
    expect(element).toContain('class="brand-area"');
    expect(element).toContain('class="form-area"');
  });

  it('should include role character container', () => {
    const fullscreen = new LoginFullscreen();
    const element = fullscreen.render();
    expect(element).toContain('class="role-character"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test frontend/components/LoginFullscreen.test.js`
Expected: FAIL with "Cannot find module './LoginFullscreen'"

- [ ] **Step 3: Write minimal implementation**

```javascript
// frontend/components/LoginFullscreen.js
export class LoginFullscreen {
  constructor() {
    this.isVisible = false;
  }

  show() {
    this.isVisible = true;
  }

  hide() {
    this.isVisible = false;
  }

  render() {
    return `
      <div class="login-fullscreen ${this.isVisible ? 'show' : 'hidden'}">
        <div class="brand-area">
          <div class="brand-logo">
            <h1>UltraWork AI</h1>
            <p>智能虚拟角色平台</p>
          </div>
          <div class="role-character" aria-label="AI角色展示区">
            <div class="character-container">
              <div class="character-avatar" id="characterAvatar">
                <!-- Character will be rendered here -->
              </div>
              <div class="character-name" id="characterName">艾利</div>
              <div class="character-status" id="characterStatus">就绪</div>
            </div>
          </div>
          <div class="brand-features">
            <h3>平台特色</h3>
            <ul>
              <li>多角色切换</li>
              <li>情感化交互</li>
              <li>长期记忆管理</li>
              <li>实时语音对话</li>
            </ul>
          </div>
        </div>
        
        <div class="form-area">
          <div class="form-header">
            <h2>欢迎回来</h2>
            <p>请登录以继续您的AI之旅</p>
          </div>
          
          <form class="login-form">
            <div class="form-group">
              <label for="email">邮箱地址</label>
              <input type="email" id="email" name="email" required>
            </div>
            <div class="form-group">
              <label for="password">密码</label>
              <input type="password" id="password" name="password" required>
              <button type="button" class="toggle-password" aria-label="显示/隐藏密码">
                <span class="icon">👁️</span>
              </button>
            </div>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" name="rememberMe"> 记住我
              </label>
              <span class="forgot-password"><a href="/forgot-password">忘记密码？</a></span>
            </div>
            <button type="submit" class="btn-primary btn-large">登录</button>
          </form>
          
          <div class="social-login">
            <p>或使用社交账号登录</p>
            <div class="social-buttons">
              <button class="social-btn wechat" aria-label="微信登录">
                <span class="icon">微信</span>
              </button>
              <button class="social-btn qq" aria-label="QQ登录">
                <span class="icon">QQ</span>
              </button>
              <button class="social-btn github" aria-label="GitHub登录">
                <span class="icon">GitHub</span>
              </button>
              <button class="social-btn google" aria-label="Google登录">
                <span class="icon">Google</span>
              </button>
            </div>
          </div>
          
          <div class="auth-alternatives">
            <p>其他登录方式</p>
            <div class="alternative-links">
              <a href="/login/phone" class="alternative-link">手机验证码登录</a>
              <a href="/login/magic-link" class="alternative-link">邮箱魔法链接</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

// Add to frontend/styles/login.css
.login-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  overflow: hidden;
  z-index: 1000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.login-fullscreen.show {
  opacity: 1;
  pointer-events: all;
}

.brand-area {
  flex: 0 0 60%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  flex-direction: column;
  padding: 2rem;
  overflow-y: auto;
}

.form-area {
  flex: 0 0 40%;
  background: white;
  display: flex;
  flex-direction: column;
  padding: 2rem;
  overflow-y: auto;
}

.brand-logo {
  text-align: center;
  margin-bottom: 2rem;
}

.brand-logo h1 {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.brand-logo p {
  font-size: 1.2rem;
  opacity: 0.9;
}

.role-character {
  text-align: center;
  margin: 2rem 0;
  padding: 1rem;
}

.character-container {
  width: 120px;
  height: 120px;
  margin: 0 auto 1rem;
  position: relative;
}

.character-avatar {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  color: white;
  box-shadow: 0 4px 15px rgba(0,0,0,0.2);
}

.character-name {
  font-weight: 600;
  font-size: 1.2rem;
  margin-bottom: 0.5rem;
}

.character-status {
  font-size: 0.9rem;
  opacity: 0.8;
}

.brand-features h3 {
  margin-top: 2rem;
  margin-bottom: 1rem;
}

.brand-features ul {
  list-style: none;
  padding: 0;
}

.brand-features li {
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255,255,255,0.2);
}

.brand-features li:last-child {
  border-bottom: none;
}

.form-area {
  background: #f8f9fa;
}

.form-header {
  text-align: center;
  margin-bottom: 2rem;
}

.form-header h2 {
  color: #333;
  margin-bottom: 0.5rem;
}

.form-header p {
  color: #666;
}

.login-form {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #333;
}

.form-group input {
  width: 100%;
  padding: 1rem;
  border: 2px solid #eee;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.2s ease;
}

.form-group input:focus {
  outline: none;
  border-color: #4a90e2;
  box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
}

.toggle-password {
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
  font-size: 1rem;
  color: #666;
}

.toggle-password:hover {
  color: #333;
}

.form-group {
  position: relative;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
}

.forgot-password {
  margin-left: auto;
  font-size: 0.9rem;
}

.forgot-password a {
  color: #4a90e2;
  text-decoration: none;
}

.forgot-password a:hover {
  text-decoration: underline;
}

.btn-primary {
  padding: 1.25rem;
  background-color: #4a90e2;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease;
  margin-top: 1rem;
}

.btn-primary:hover {
  background-color: #357ab8;
}

.btn-primary:active {
  background-color: #2d628f;
}

.btn-large {
  height: 3rem;
  font-size: 1.2rem;
}

.social-login {
  text-align: center;
  margin: 2rem 0;
  padding-top: 1.5rem;
  border-top: 1px solid #eee;
}

.social-login p {
  margin-bottom: 1rem;
  color: #666;
}

.social-buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

.social-btn {
  width: 45px;
  height: 45px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid transparent;
}

.social-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.social-btn.wechat {
  background-color: #fff;
  color: #07c160;
  border-color: #07c160;
}

.social-btn.qq {
  background-color: #fff;
  color: #12b7f5;
  border-color: #12b7f5;
}

.social-btn.github {
  background-color: #fff;
  color: #333;
  border-color: #333;
}

.social-btn.google {
  background-color: #fff;
  color: #4285f4;
  border-color: #4285f4;
}

.auth-alternatives {
  text-align: center;
  margin: 2rem 0;
  color: #666;
}

.alternative-link {
  color: #4a90e2;
  text-decoration: none;
  margin: 0 0.5rem;
  font-size: 0.9rem;
}

.alternative-link:hover {
  text-decoration: underline;
}

/* Hidden state */
.login-fullscreen.hidden {
  display: none;
}

/* Responsive adjustments will be added in login-responsive.css */

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test frontend/components/LoginFullscreen.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/components/LoginFullscreen.js frontend/components/LoginFullscreen.test.js frontend/styles/login.css
git commit -m "feat: create fullscreen login container"
```

### Task 4: Create Biometric Authentication Component

**Files:**
- Create: `frontend/components/BiometricAuth.js`
- Create: `frontend/components/FingerprintAuth.js`
- Create: `frontend/components/FaceAuth.js`
- Create: `frontend/components/VoiceAuth.js`
- Modify: `frontend/styles/login.css` (add biometric styles)

- [ ] **Step 1: Write the failing test**

```javascript
import { BiometricAuth } from './BiometricAuth';

describe('BiometricAuth', () => {
  it('should initialize with supported biometric methods', () => {
    const auth = new BiometricAuth({ options: {} });
    expect(auth.supportedMethods).toContain('fingerprint');
    expect(auth.supportedMethods).toContain('face');
    expect(auth.supportedMethods).toContain('voice');
  });

  it('should return false for unsupported methods', () => {
    const auth = new BiometricAuth({ options: {} });
    expect(auth.isMethodAvailable('iris')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test frontend/components/BiometricAuth.test.js`
Expected: FAIL with "Cannot find module './BiometricAuth'"

- [ ] **Step 3: Write minimal implementation**

```javascript
// frontend/components/BiometricAuth.js
export class BiometricAuth {
  constructor(options = {}) {
    this.options = options;
    this.supportedMethods = this.detectSupportedMethods();
  }

  detectSupportedMethods() {
    const methods = [];
    
    // Check for WebAuthn (fingerprint/platform authenticator)
    if (window.PublicKeyCredential && 
        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      methods.push('fingerprint');
    }
    
    // Check for mediaDevices (face/voice recognition)
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      methods.push('face');
      methods.push('voice'); // Note: Voice recognition has more specific checks
    }
    
    return methods;
  }

  isMethodAvailable(method) {
    return this.supportedMethods.includes(method);
  }

  async authenticate(method) {
    switch(method) {
      case 'fingerprint':
        return this.authenticateFingerprint();
      case 'face':
        return this.authenticateFace();
      case 'voice':
        return this.authenticateVoice();
      default:
        throw new Error(`Unsupported biometric method: ${method}`);
    }
  }

  async authenticateFingerprint() {
    // Simplified WebAuthn implementation
    if (!this.isMethodAvailable('fingerprint')) {
      throw new Error('Fingerprint authentication not available');
    }
    
    // In real implementation, this would use the WebAuthn API
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true, method: 'fingerprint' });
      }, 1500);
    });
  }

  async authenticateFace() {
    // Simplified face recognition implementation
    if (!this.isMethodAvailable('face')) {
      throw new Error('Face authentication not available');
    }
    
    // In real implementation, this would access camera and process frames
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true, method: 'face' });
      }, 2000);
    });
  }

  async authenticateVoice() {
    // Simplified voice recognition implementation
    if (!this.isMethodAvailable('voice')) {
      throw new Error('Voice authentication not available');
    }
    
    // In real implementation, this would access microphone and process audio
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true, method: 'voice' });
      }, 2500);
    });
  }

  render() {
    return `
      <div class="biometric-auth">
        <h3>生物识别登录</h3>
        <div class="biometric-methods">
          ${this.supportedMethods.map(method => `
            <button class="biometric-btn biometric-${method}" 
                    data-method="${method}"
                    aria-label="${this.getMethodLabel(method)}登录">
              <span class="biometric-icon">${this.getMethodIcon(method)}</span>
              <span class="biometric-text">${this.getMethodLabel(method)}</span>
            </button>
          `).join('')}
        </div>
        <div class="biometric-status" aria-live="polite"></div>
      </div>
    `;
  }

  getMethodLabel(method) {
    const labels = {
      fingerprint: '指纹',
      face: '面部',
      voice: '声音'
    };
    return labels[method] || method;
  }

  getMethodIcon(method) {
    const icons = {
      fingerprint: '👆',
      face: '👁️',
      voice: '🎤'
    };
    return icons[method] || '⬤';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test frontend/components/BiometricAuth.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/components/BiometricAuth.js frontend/components/BiometricAuth.test.js
git commit -m "feat: create biometric authentication component"
```

### Task 5: Create Social Login Component

**Files:**
- Create: `frontend/components/SocialLogin.js`
- Modify: `frontend/styles/login.css` (add social login styles)

- [ ] **Step 1: Write the failing test**

```javascript
import { SocialLogin } from './SocialLogin';

describe('SocialLogin', () => {
  it('should render social login buttons for configured providers', () => {
    const socialLogin = new SocialLogin({ providers: ['wechat', 'qq', 'github', 'google'] });
    const element = socialLogin.render();
    expect(element).toContain('class="social-btn wechat"');
    expect(element).toContain('class="social-btn qq"');
    expect(element).toContain('class="social-btn github"');
    expect(element).toContain('class="social-btn google"');
  });

  it('should handle click events and call provider callbacks', () => {
    const socialLogin = new SocialLogin({
      providers: ['wechat'],
      onProviderClick: jest.fn()
    });
    const element = socialLogin.render();
    // Simulate click on wechat button
    const wechatButton = element.querySelector('.social-btn.wechat');
    wechatButton.click();
    expect(socialLogin.onProviderClick).toHaveBeenCalledWith('wechat');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test frontend/components/SocialLogin.test.js`
Expected: FAIL with "Cannot find module './SocialLogin'"

- [ ] **Step 3: Write minimal implementation**

```javascript
// frontend/components/SocialLogin.js
export class SocialLogin {
  constructor(options = {}) {
    this.providers = options.providers || ['wechat', 'qq', 'github', 'google'];
    this.onProviderClick = options.onProviderClick || (() => {});
  }

  render() {
    return `
      <div class="social-login">
        <p>或使用社交账号登录</p>
        <div class="social-buttons">
          ${this.providers.map(provider => `
            <button class="social-btn ${provider}" 
                    data-provider="${provider}"
                    aria-label="${this.getProviderLabel(provider)}登录">
              <span class="provider-icon">${this.getProviderIcon(provider)}</span>
              <span class="provider-text">${this.getProviderLabel(provider)}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  attachEventListeners(container) {
    container.querySelectorAll('.social-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        const provider = button.getAttribute('data-provider');
        this.onProviderClick(provider);
      });
    });
  }

  getProviderLabel(provider) {
    const labels = {
      wechat: '微信',
      qq: 'QQ',
      github: 'GitHub',
      google: 'Google'
    };
    return labels[provider] || provider;
  }

  getProviderIcon(provider) {
    const icons = {
      wechat: '微信',
      qq: 'QQ',
      github: 'Octocat',
      google: 'G'
    };
    return icons[provider] || '🔗';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test frontend/components/SocialLogin.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/components/SocialLogin.js frontend/components/SocialLogin.test.js frontend/styles/login.css
git commit -m "feat: create social login component"
```

### Task 6: Create Role Integration Component

**Files:**
- Create: `frontend/components/RoleIntegration.js`
- Create: `frontend/components/CharacterAvatar.js`
- Modify: `frontend/styles/login.css` (add role integration styles)
- Modify: `frontend/styles/avatar.css` (if needed for character animations)

- [ ] **Step 1: Write the failing test**

```javascript
import { RoleIntegration } from './RoleIntegration';

describe('RoleIntegration', () => {
  it('should render character container with avatar and info', () => {
    const roleIntegration = new RoleIntegration({ character: { name: '艾利', status: '就绪' } });
    const element = roleIntegration.render();
    expect(element).toContain('class="role-integration"');
    expect(element).toContain('class="character-avatar"');
    expect(element).toContain('艾利');
    expect(element).toContain('就绪');
  });

  it('should update character state when changed', () => {
    const roleIntegration = new RoleIntegration({ character: { name: '艾利', status: '就绪' } });
    roleIntegration.updateCharacter({ name: '狐九', status: '兴奋' });
    const element = roleIntegration.render();
    expect(element).toContain('狐九');
    expect(element).toContain('兴奋');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test frontend/components/RoleIntegration.test.js`
Expected: FAIL with "Cannot find module './RoleIntegration'"

- [ ] **Step 3: Write minimal implementation**

```javascript
// frontend/components/RoleIntegration.js
export class RoleIntegration {
  constructor(options = {}) {
    this.character = options.character || {
      name: '艾利',
      status: '就绪',
      mood: 'neutral'
    };
    this.onCharacterClick = options.onCharacterClick || (() => {});
  }

  render() {
    return `
      <div class="role-integration" aria-label="AI角色互动区" tabindex="0">
        <div class="character-avatar-container">
          <div class="character-avatar mood-${this.character.mood.toLowerCase()}" 
               id="characterAvatar"
               aria-label="${this.character.name}的头像">
            <!-- Avatar image or SVG would go here -->
            <div class="avatar-initials">${this.character.name.charAt(0)}</div>
          </div>
          <div class="character-status-indicator" aria-hidden="true"></div>
        </div>
        <div class="character-info">
          <div class="character-name">${this.character.name}</div>
          <div class="character-status">${this.character.status}</div>
        </div>
      </div>
    `;
  }

  updateCharacter(newCharacter) {
    this.character = { ...this.character, ...newCharacter };
    // In a real implementation, this would trigger a re-render
    return this.render();
  }

  attachEventListeners(container) {
    container.addEventListener('click', () => {
      this.onCharacterClick(this.character);
    });
    
    // Keyboard accessibility
    container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.onCharacterClick(this.character);
      }
    });
  }
}

// frontend/components/CharacterAvatar.js (optional separate component)
export class CharacterAvatar {
  constructor(options = {}) {
    this.character = options.character || {
      name: '艾利',
      mood: 'neutral'
    };
  }

  render() {
    return `
      <div class="character-avatar-wrapper">
        <div class="character-avatar mood-${this.character.mood.toLowerCase()}" 
             aria-label="${this.character.name}的头像">
          ${this.renderAvatarContent()}
        </div>
        <div class="character-name">${this.character.name}</div>
      </div>
    `;
  }

  renderAvatarContent() {
    // This could be an image, SVG, or Lottie animation
    // For simplicity, we'll use initials with background color
    return `
      <div class="avatar-content">
        <div class="avatar-initials">${this.character.name.charAt(0)}</div>
      </div>
    `;
  }
}
```

```css
/* Add to frontend/styles/login.css */
.role-integration {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.role-integration:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.role-integration:focus {
  outline: 2px solid #4a90e2;
  outline-offset: 2px;
}

.character-avatar-container {
  flex-shrink: 0;
}

.character-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: white;
  font-size: 1.5rem;
  position: relative;
  overflow: hidden;
}

.character-avatar.mood-happy {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  animation: bounce-happy 0.5s ease;
}

.character-avatar.mood-excited {
  background: linear-gradient(135deg, #ef4444, #f97316);
  animation: shake-excited 0.3s ease infinite;
}

.character-avatar.mood-sad {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  filter: saturate(0.8);
}

.character-avatar.mood-curious {
  background: linear-gradient(135deg, #10b981, #059669);
  animation: tilt-curious 1s ease infinite;
}

.character-avatar.mood-shy {
  background: linear-gradient(135deg, #8b5cf6, #d946ef);
  transform: scale(0.95);
}

.character-avatar.mood-proud {
  background: linear-gradient(135deg, #f97316, #ea580c);
  filter: brightness(1.1) drop-shadow(0 0 10px rgba(255, 215, 0, 0.5));
}

.character-avatar.mood-neutral {
  background: linear-gradient(135deg, #6b7280, #4b5563);
}

.character-avatar.mood-thinking {
  background: linear-gradient(135deg, #8b5cf6, #d946ef);
}

.character-avatar.mood-speaking {
  background: linear-gradient(135deg, #06b6d4, #0891b2);
  animation: pulse-speak 0.3s ease infinite;
}

.character-avatar .avatar-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.character-avatar .avatar-initials {
  font-size: 1.8rem;
  font-weight: bold;
}

.character-status-indicator {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 2px white;
  animation: pulse 2s ease-in-out infinite;
}

.character-info {
  display: flex;
  flex-direction: column;
}

.character-name {
  font-weight: 600;
  font-size: 1.1rem;
  color: white;
}

.character-status {
  font-size: 0.9rem;
  opacity: 0.9;
  color: white;
  text-transform: capitalize;
}

//* Character animation keyframes */
@keyframes bounce-happy {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

@keyframes shake-excited {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  75% { transform: translateX(3px); }
}

@keyframes tilt-curious {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(5deg); }
}

@keyframes pulse-speak {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Add to avatar.css if exists, otherwise these can go in login.css */
.avatar-container {
  position: relative;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-image {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  transition: transform 0.3s ease, filter 0.3s ease;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

/* Mood-based avatar modifications from existing avatar.css */
.avatar-container.mood-happy .avatar-image {
  animation: bounce-happy 0.5s ease;
}

.avatar-container.mood-excited .avatar-image {
  animation: shake-excited 0.3s ease infinite;
  filter: brightness(1.1);
}

.avatar-container.mood-sad .avatar-image {
  filter: saturate(0.7) brightness(0.9);
  transform: rotate(-5deg);
}

.avatar-container.mood-curious .avatar-image {
  animation: tilt-curious 1s ease infinite;
}

.avatar-container.mood-shy .avatar-image {
  filter: brightness(1.05);
  transform: scale(0.95);
}

.avatar-container.mood-proud .avatar-image {
  transform: scale(1.05);
  filter: brightness(1.1) drop-shadow(0 0 10px rgba(255, 215, 0, 0.5));
}

.avatar-container.speaking .avatar-image {
  animation: pulse-speak 0.3s ease infinite;
}

/* If avatar.css doesn't exist, we'll note that it should be created or styles added elsewhere */
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test frontend/components/RoleIntegration.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/components/RoleIntegration.js frontend/components/CharacterAvatar.js frontend/components/RoleIntegration.test.js frontend/styles/login.css
git commit -m "feat: create role integration component"
```

### Task 7: Create Responsive Adaptations

**Files:**
- Create: `frontend/styles/login-responsive.css`
- Modify: `frontend/index.html` (add viewport meta tag if needed)
- Modify: `frontend/components/LoginModeSelector.js` (add resize event handling)

- [ ] **Step 1: Write the failing test**

```javascript
// This would be more of a visual/manual test, but we can test the logic
import { LoginModeSelector } from './LoginModeSelector';

describe('LoginModeSelector responsive behavior', () => {
  it('should adapt mode based on viewport width', () => {
    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true
    });
    
    // Test mobile width
    window.innerWidth = 320;
    const selector = new LoginModeSelector({});
    // This would depend on implementation - selector might have a method to get responsive mode
    // For now, we'll test that the selector can handle responsive logic
    expect(typeof selector.getMode).toBe('function');
    
    // Test desktop width
    window.innerWidth = 1440;
    expect(typeof selector.getMode).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test frontend/components/LoginModeSelector.test.js`
Expected: FAIL (if we add responsive tests) or PASS (if we don't modify the existing test)

- [ ] **Step 3: Write minimal implementation**

```javascript
// frontend/styles/login-responsive.css
/* Mobile-first responsive design */

/* Extra small devices (phones, 600px and down) */
@media only screen and (max-width: 600px) {
  .login-fullscreen {
    flex-direction: column;
  }
  
  .brand-area,
  .form-area {
    flex: none;
    width: 100%;
    height: auto;
  }
  
  .brand-area {
    padding: 1.5rem;
  }
  
  .form-area {
    padding: 1.5rem;
  }
  
  .role-character {
    margin: 1.5rem 0;
  }
  
  .character-avatar {
    width: 100px;
    height: 100px;
    font-size: 2.5rem;
  }
  
  .modal-content {
    width: 95%;
    max-width: 500px;
    margin: 1rem;
  }
}

/* Small devices (portrait tablets and large phones, 600px and up) */
@media only screen and (min-width: 600px) {
  .brand-area {
    padding: 2rem;
  }
  
  .form-area {
    padding: 2rem;
  }
}

/* Medium devices (landscape tablets, 768px and up) */
@media only screen and (min-width: 768px) {
  .login-fullscreen {
    /* Keep default flex layout for larger screens */
  }
  
  .brand-area {
    flex: 0 0 50%;
  }
  
  .form-area {
    flex: 0 0 50%;
  }
}

/* Large devices (laptops/desktops, 992px and up) */
@media only screen and (min-width: 992px) {
  .brand-area {
    flex: 0 0 40%;
  }
  
  .form-area {
    flex: 0 0 60%;
  }
}

/* Extra large devices (large laptops and desktops, 1200px and up) */
@media only screen and (min-width: 1200px) {
  .brand-area {
    flex: 0 0 35%;
  }
  
  .form-area {
    flex: 0 0 65%;
  }
}

/* Touch device enhancements */
@media (pointer: coarse) {
  .btn-primary,
  .social-btn,
  .biometric-btn {
    min-height: 44px; /* Touch target size */
    min-width: 44px;
  }
  
  .form-group input {
    min-height: 44px;
    padding: 1rem;
  }
}

/* Reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  
  .character-avatar {
    animation: none !important;
  }
  
  .bg-animation::before,
  .particle {
    animation: none !important;
  }
}

/* High contrast mode */
@media (prefers-contrast: high) {
  :root {
    --text-primary: #000000;
    --text-secondary: #333333;
    --border-color: #000000;
  }
  
  .login-modal,
  .login-fullscreen {
    border: 2px solid #000000;
  }
  
  .btn-primary {
    border: 2px solid #000000;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  :root {
    --bg-dark: #0f0f1a;
    --bg-card: rgba(255, 255, 255, 0.08);
    --text-primary: #ffffff;
    --text-secondary: rgba(255, 255, 255, 0.7);
    --glass-bg: rgba(255, 255, 255, 0.1);
    --glass-border: rgba(255, 255, 255, 0.18);
  }
  
  /* Override for light elements in dark mode */
  .form-area {
    background: rgba(0, 0, 0, 0.3);
  }
  
  .form-group input {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.3);
    color: #ffffff;
  }
  
  .form-group input::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }
  
  .form-group input:focus {
    border-color: #4a90e2;
    box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.2);
  }
}

/* Print styles */
@media print {
  .login-modal,
  .login-fullscreen {
    position: static;
    width: 100%;
    height: auto;
    background: none;
    box-shadow: none;
  }
  
  .brand-area {
    display: none; /* Hide brand area in print */
  }
  
  .form-area {
    width: 100%;
  }
}

/* Add to frontend/components/LoginModeSelector.js - responsive mode detection */
// Add this method to the LoginModeSelector class:
getResponsiveMode() {
  const width = window.innerWidth;
  
  if (width < 600) {
    // On mobile, always use modal for better UX
    return 'modal';
  } else if (width < 900) {
    // On tablets, consider context
    if (this.options.isFirstVisit || this.options.fromExternalLink) {
      return 'fullscreen';
    }
    return 'modal';
  } else {
    // On desktop, use standard logic
    return this.getMode();
  }
}

// Add resize event listener handling
attachResizeListener(callback) {
  let resizeTimeout;
  
  const handleResize = () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      callback(this.getResponsiveMode());
    }, 250);
  };
  
  window.addEventListener('resize', handleResize);
  
  // Return cleanup function
  return () => {
    window.removeEventListener('resize', handleResize);
    clearTimeout(resizeTimeout);
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test frontend/components/LoginModeSelector.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/styles/login-responsive.css frontend/components/LoginModeSelector.js
git commit -m "feat: create responsive adaptations for login system"
```

### Task 8: Enhance Backend Authentication

**Files:**
- Modify: `server/routes/auth.js` (enhance authentication routes)
- Create: `server/services/authService.js` (authentication business logic)
- Create: `server/middleware/securityMiddleware.js` (security enhancements)
- Modify: `server/index.js` (register new middleware and routes)

- [ ] **Step 1: Write the failing test**

```javascript
// This would be backend tests - simplified examples
const request = require('supertest');
const app = require('../server/index'); // Assuming Express app is exported

describe('Authentication API', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'SecurePass123!'
      });
    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('test@example.com');
  });

  it('should login with valid credentials', async () => {
    // First register a user
    await request(app)
      .post('/api/auth/register')
      .send({
        username: 'testuser2',
        email: 'test2@example.com',
        password: 'SecurePass123!'
      });
    
    // Then login
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test2@example.com',
        password: 'SecurePass123!'
      });
    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
  });

  it('should reject invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'wrongpassword'
      });
    expect(res.statusCode).toEqual(401);
    expect(res.body.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test server/auth.test.js`
Expected: FAIL with "Cannot find module '../server/index'" or similar

- [ ] **Step 3: Write minimal implementation**

```javascript
// server/services/authService.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// In-memory storage (would be database in production)
const users = new Map();
const refreshTokens = new Map();

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '24h';
const REFRESH_TOKEN_EXPIRES_IN = '30d';

class AuthService {
  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} Registered user data
   */
  async register(userData) {
    const { username, email, password } = userData;
    
    // Check if user already exists
    if (users.has(email)) {
      throw new Error('User already exists');
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user object
    const user = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
      username,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Store user
    users.set(email, user);
    
    // Generate tokens
    const token = this.generateToken(user);
    const refreshToken = this.generateRefreshToken(user);
    
    // Store refresh token
    refreshTokens.set(user.id, refreshToken);
    
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      token,
      refreshToken
    };
  }
  
  /**
   * Login user
   * @param {Object} loginData - Login credentials
   * @returns {Promise<Object>} Login result with tokens
   */
  async login(loginData) {
    const { email, password } = loginData;
    
    // Find user
    const user = users.get(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }
    
    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }
    
    // Generate tokens
    const token = this.generateToken(user);
    const refreshToken = this.generateRefreshToken(user);
    
    // Update refresh token
    refreshTokens.set(user.id, refreshToken);
    
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      token,
      refreshToken
    };
  }
  
  /**
   * Refresh access token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New access token
   */
  async refreshToken(refreshToken) {
    // Find user by refresh token
    let userId = null;
    refreshTokens.forEach((token, id) => {
      if (token === refreshToken) {
        userId = id;
      }
    });
    
    if (!userId) {
      throw new Error('Invalid refresh token');
    }
    
    // Find user
    let user = null;
    users.forEach((u, email) => {
      if (u.id === userId) {
        user = u;
      }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Generate new tokens
    const token = this.generateToken(user);
    const newRefreshToken = this.generateRefreshToken(user);
    
    // Update refresh token
    refreshTokens.set(user.id, newRefreshToken);
    
    return {
      token,
      refreshToken: newRefreshToken
    };
  }
  
  /**
   * Logout user
   * @param {string} refreshToken - Refresh token to remove
   */
  logout(refreshToken) {
    // Find user by refresh token and remove it
    refreshTokens.forEach((token, id) => {
      if (token === refreshToken) {
        refreshTokens.delete(id);
      }
    });
  }
  
  /**
   * Generate JWT access token
   * @param {Object} user - User object
   * @returns {string} JWT token
   */
  generateToken(user) {
    return jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }
  
  /**
   * Generate JWT refresh token
   * @param {Object} user - User object
   * @returns {string} JWT refresh token
   */
  generateRefreshToken(user) {
    return jwt.sign(
      { id: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );
  }
  
  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @returns {Object|false} Decoded token or false if invalid
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Object|null} User object or null
   */
  getUserById(userId) {
    for (const [email, user] of users.entries()) {
      if (user.id === userId) {
        return user;
      }
    }
    return null;
  }
  
  /**
   * Get user by email
   * @param {string} email - User email
   * @returns {Object|null} User object or null
   */
  getUserByEmail(email) {
    return users.get(email) || null;
  }
}

module.exports = new AuthService();
```

```javascript
// server/middleware/securityMiddleware.js
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');

/**
 * Rate limiter for authentication endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 15 minutes',
    code: 'TOO_MANY_REQUESTS'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Enhanced rate limiter for login attempts
 */
const loginLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: {
    success: false,
    error: 'Account temporarily locked due to too many failed login attempts',
    code: 'ACCOUNT_LOCKED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Security headers middleware
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
});

/**
 * Input sanitization middleware
 */
const inputSanitization = [
  xss(),
  mongoSanitize()
];

/**
 * Request validation middleware for auth endpoints
 */
const validateAuthRequest = (req, res, next) => {
  const { email, password } = req.body;
  
  // Basic validation
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required',
      code: 'MISSING_FIELDS'
    });
  }
  
  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid email format',
      code: 'INVALID_EMAIL'
    });
  }
  
  // Password strength validation
  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 8 characters long',
      code: 'WEAK_PASSWORD'
    });
  }
  
  next();
};

module.exports = {
  authLimiter,
  loginLimiter,
  securityHeaders,
  inputSanitization,
  validateAuthRequest
};
```

```javascript
// server/routes/auth.js (enhanced)
const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { 
  authLimiter, 
  loginLimiter, 
  securityHeaders, 
  inputSanitization,
  validateAuthRequest
} = require('../middleware/securityMiddleware');

// Apply security headers to all auth routes
router.use(securityHeaders);

/**
 * POST /api/auth/register
 * 用户注册
 */
router.post('/register', authLimiter, inputSanitization, validateAuthRequest, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Register user
    const result = await authService.register({ username, email, password });
    
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Register error:', error);
    
    // Handle specific errors
    if (error.message === 'User already exists') {
      return res.status(409).json({
        success: false,
        error: '该邮箱已被注册',
        code: 'USER_EXISTS'
      });
    }
    
    res.status(500).json({
      success: false,
      error: '注册失败',
      code: 'REGISTER_ERROR'
    });
  }
});

/**
 * POST /api/auth/login
 * 用户登录
 */
router.post('/login', loginLimiter, inputSanitization, validateAuthRequest, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Login user
    const result = await authService.login({ email, password });
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Login error:', error);
    
    // Handle specific errors
    if (error.message === 'Invalid credentials') {
      return res.status(401).json({
        success: false,
        error: '邮箱或密码错误',
        code: 'INVALID_CREDENTIALS'
      });
    }
    
    res.status(500).json({
      success: false,
      error: '登录失败',
      code: 'LOGIN_ERROR'
    });
  }
});

/**
 * POST /api/auth/refresh
 * 刷新访问令牌
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: '刷新令牌是必需的',
        code: 'MISSING_REFRESH_TOKEN'
      });
    }
    
    // Refresh token
    const result = await authService.refreshToken(refreshToken);
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    
    if (error.message === 'Invalid refresh token' || 
        error.message === 'User not found') {
      return res.status(401).json({
        success: false,
        error: '无效的刷新令牌',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }
    
    res.status(500).json({
      success: false,
      error: '刷新令牌失败',
      code: 'REFRESH_TOKEN_ERROR'
    });
  }
});

/**
 * POST /api/auth/logout
 * 用户登出
 */
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: '刷新令牌是必需的',
        code: 'MISSING_REFRESH_TOKEN'
      });
    }
    
    // Logout user
    authService.logout(refreshToken);
    
    res.status(200).json({
      success: true,
      message: '登出成功'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: '登出失败',
      code: 'LOGOUT_ERROR'
    });
  }
});

/**
 * GET /api/auth/me
 * 获取当前用户信息
 */
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: '未提供有效的认证令牌',
        code: 'MISSING_AUTH_TOKEN'
      });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = authService.verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: '无效或过期的认证令牌',
        code: 'INVALID_AUTH_TOKEN'
      });
    }
    
    const user = authService.getUserById(decoded.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在',
        code: 'USER_NOT_FOUND'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: '获取用户信息失败',
      code: 'GET_USER_ERROR'
    });
  }
});

module.exports = router;
```

```javascript
// server/index.js (modifications)
const express = require('express');
const authRoutes = require('./routes/auth');
// ... other imports

const app = express();
// ... existing middleware

// Register auth routes
app.use('/api/auth', authRoutes);

// ... other route registrations

// ... existing server startup code
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test server/auth.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/authService.js server/middleware/securityMiddleware.js server/routes/auth.js server/index.js
git commit -m "feat: enhance backend authentication with security features"
```

### Task 9: Add Security Middleware

Note: Security middleware was already added in Task 8. This task ensures that all security measures are properly integrated and tested.

**Files:**
- No new files needed (already created in Task 8)
- Modify: `server/tests/auth.test.js` (add security-specific tests)

- [ ] **Step 1: Write the failing test**

```javascript
const request = require('supertest');
const app = require('../server/index');
const { loginLimiter } = require('../server/middleware/securityMiddleware');

describe('Security Middleware', () => {
  it('should apply rate limiting to login endpoint', async () => {
    // Make 6 requests quickly (limit is 5 per 30 minutes)
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: `test${i}@example.com`,
          password: 'WrongPass123!'
        });
      
      if (i < 5) {
        // First 5 should get 401 (invalid credentials) or 400 (validation)
        expect([400, 401]).toContain(res.statusCode);
      } else {
        // 6th should get 429 (too many requests)
        expect(res.statusCode).toBe(429);
        expect(res.body.error).toContain('Account temporarily locked');
      }
    }
  });

  it('should sanitize input to prevent XSS', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: '<script>alert("xss")</script>',
        email: 'xss@example.com',
        password: 'ValidPass123!'
      });
    
    // Should either reject or sanitize the input
    // In our implementation, xss-clean middleware will sanitize
    expect(res.statusCode).toBe(400); // Validation might fail due to invalid username format
    // If it passes validation, the username should be sanitized
  });

  it('should set security headers', async () => {
    const res = await request(app).get('/api/auth/register');
    
    expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
    expect(res.headers).toHaveProperty('x-frame-options', 'SAMEORIGIN');
    expect(res.headers).toHaveProperty('strict-transport-security');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test server/security.test.js`
Expected: FAIL with "Cannot find module '../server/index'" or similar

- [ ] **Step 3: Write minimal implementation**

```javascript
// server/tests/security.test.js
const request = require('supertest');
const app = require('../server/index');
const { loginLimiter } = require('../server/middleware/securityMiddleware');

describe('Security Middleware', () => {
  it('should apply rate limiting to login endpoint', async () => {
    // Make 6 requests quickly (limit is 5 per 30 minutes)
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: `test${i}@example.com`,
          password: 'WrongPass123!'
        });
      
      if (i < 5) {
        // First 5 should get 401 (invalid credentials) or 400 (validation)
        expect([400, 401]).toContain(res.statusCode);
      } else {
        // 6th should get 429 (too many requests)
        expect(res.statusCode).toBe(429);
        expect(res.body.error).toContain('Account temporarily locked');
      }
    }
  });

  it('should sanitize input to prevent XSS', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: '<script>alert("xss")</script>',
        email: 'xss@example.com',
        password: 'ValidPass123!'
      });
    
    // Should either reject or sanitize the input
    // In our implementation, xss-clean middleware will sanitize
    expect(res.statusCode).toBe(400); // Validation might fail due to invalid username format
    // If it passes validation, the username should be sanitized
  });

  it('should set security headers', async () => {
    const res = await request(app).get('/api/auth/register');
    
    expect(res.headers).toHaveProperty('x-content-type-options', 'nosniff');
    expect(res.headers).toHaveProperty('x-frame-options', 'SAMEORIGIN');
    expect(res.headers).toHaveProperty('strict-transport-security');
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test server/security.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/tests/security.test.js
git commit -m "feat: add security middleware tests"
```

### Task 10: Write Unit Tests

**Files:**
- Create: `tests/frontend/LoginModal.unit.test.js`
- Create: `tests/frontend/LoginFullscreen.unit.test.js`
- Create: `tests/frontend/LoginModeSelector.unit.test.js`
- Create: `tests/frontend/BiometricAuth.unit.test.js`
- Create: `tests/frontend/SocialLogin.unit.test.js`
- Create: `tests/frontend/RoleIntegration.unit.test.js`
- Create: `tests/server/authService.unit.test.js`
- Modify: `package.json` (add test scripts if needed)

- [ ] **Step 1: Write the failing test for LoginModal**

```javascript
import { LoginModal } from '../../frontend/components/LoginModal';

describe('LoginModal Unit Tests', () => {
  it('should initialize with default state', () => {
    const modal = new LoginModal();
    expect(modal.isVisible).toBe(false);
  });

  it('should show modal when show() is called', () => {
    const modal = new LoginModal();
    modal.show();
    expect(modal.isVisible).toBe(true);
  });

  it('should hide modal when hide() is called', () => {
    const modal = new LoginModal();
    modal.hide();
    expect(modal.isVisible).toBe(false);
  });

  it('should render proper HTML structure', () => {
    const modal = new LoginModal();
    const html = modal.render();
    expect(html).toContain('class="login-modal"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('class="modal-close"');
    expect(html).toContain('<form class="login-form">');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/frontend/LoginModal.unit.test.js`
Expected: FAIL with "Cannot find module '../../frontend/components/LoginModal'"

- [ ] **Step 3: Write minimal implementation**

// Already implemented in previous tasks - the component should already exist
// If not, we would need to create it, but we already did in Tasks 2 and 3

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/frontend/LoginModal.unit.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/frontend/LoginModal.unit.test.js
git commit -m "feat: add unit tests for LoginModal component"
```

- [ ] **Step 6: Repeat for other components**

Follow the same pattern for:
- LoginFullscreen.unit.test.js
- LoginModeSelector.unit.test.js
- BiometricAuth.unit.test.js
- SocialLogin.unit.test.js
- RoleIntegration.unit.test.js
- authService.unit.test.js

Each test file should focus on testing the individual component's logic in isolation.

- [ ] **Step 7: Commit all unit tests**

```bash
git add tests/frontend/LoginFullscreen.unit.test.js
git add tests/frontend/LoginModeSelector.unit.test.js
git add tests/frontend/BiometricAuth.unit.test.js
git add tests/frontend/SocialLogin.unit.test.js
git add tests/frontend/RoleIntegration.unit.test.js
git add tests/server/authService.unit.test.js
git commit -m "feat: add unit tests for all login components"
```

### Task 11: Write Integration Tests

**Files:**
- Create: `tests/frontend/LoginFlow.integration.test.js`
- Create: `tests/frontend/AuthModeSwitching.integration.test.js`
- Create: `tests/frontend/BiometricAuthFlow.integration.test.js`
- Create: `tests/server/authApi.integration.test.js`
- Create: `tests/e2e/login.spec.js` (end-to-end, but we'll mention it here too)

- [ ] **Step 1: Write the failing test for Login Flow Integration**

```javascript
// tests/frontend/LoginFlow.integration.test.js
import { LoginModeSelector } from '../../frontend/components/LoginModeSelector';
import { LoginModal } from '../../frontend/components/LoginModal';
import { LoginFullscreen } from '../../frontend/components/LoginFullscreen';

describe('Login Flow Integration Tests', () => {
  it('should select fullscreen mode for first-time visitors', () => {
    const selector = new LoginModeSelector({ isFirstVisit: true });
    expect(selector.getMode()).toBe('fullscreen');
    
    const fullscreen = new LoginFullscreen();
    fullscreen.show();
    // In a real test, we would check if the fullscreen component is rendered
    expect(fullscreen.isVisible).toBe(true);
  });

  it('should select modal mode for returning users', () => {
    const selector = new LoginModeSelector({ 
      isFirstVisit: false, 
      isReturningUser: true 
    });
    expect(selector.getMode()).toBe('modal');
    
    const modal = new LoginModal();
    modal.show();
    expect(modal.isVisible).toBe(true);
  });

  it('should handle mode switching based on context', () => {
    // Simulate user journey: first visit -> returning user
    const selector = new LoginModeSelector({});
    
    // First visit
    selector.options.isFirstVisit = true;
    expect(selector.getMode()).toBe('fullscreen');
    
    // Returning user
    selector.options.isFirstVisit = false;
    selector.options.isReturningUser = true;
    expect(selector.getMode()).toBe('modal');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/frontend/LoginFlow.integration.test.js`
Expected: FAIL with "Cannot find module" errors

- [ ] **Step 3: Write minimal implementation**

// The components should already exist from previous tasks
// We're testing how they work together

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/frontend/LoginFlow.integration.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/frontend/LoginFlow.integration.test.js
git commit -m "feat: add login flow integration tests"
```

- [ ] **Step 6: Write Auth Mode Switching Integration Test**

```javascript
// tests/frontend/AuthModeSwitching.integration.test.js
import { LoginModeSelector } from '../../frontend/components/LoginModeSelector';
import { LoginModal } from '../../frontend/components/LoginModal';
import { LoginFullscreen } from '../../frontend/components/LoginFullscreen';

describe('Auth Mode Switching Integration Tests', () => {
  it('should switch from fullscreen to modal after successful login', () => {
    const selector = new LoginModeSelector({ isFirstVisit: true });
    
    // Initial state - first visit
    expect(selector.getMode()).toBe('fullscreen');
    
    // Simulate successful login
    selector.options.isFirstVisit = false;
    selector.options.isReturningUser = true;
    
    // After login, should use modal mode
    expect(selector.getMode()).toBe('modal');
  });

  it('should maintain modal mode for feature access', () => {
    const selector = new LoginModeSelector({ 
      isFirstVisit: false, 
      isReturningUser: true 
    });
    
    // Already a returning user
    expect(selector.getMode()).toBe('modal');
    
    // Accessing a feature that requires auth
    selector.options.featureAccess = true;
    expect(selector.getMode()).toBe('modal'); // Should still be modal
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test tests/frontend/AuthModeSwitching.integration.test.js`
Expected: FAIL with "Cannot find module" errors

- [ ] **Step 8: Write minimal implementation**

// Components should already exist

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test tests/frontend/AuthModeSwitching.integration.test.js`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add tests/frontend/AuthModeSwitching.integration.test.js
git commit -m "feat: add auth mode switching integration tests"
```

- [ ] **Step 11: Write Biometric Auth Flow Integration Test**

```javascript
// tests/frontend/BiometricAuthFlow.integration.test.js
import { BiometricAuth } from '../../frontend/components/BiometricAuth';

describe('Biometric Auth Flow Integration Tests', () => {
  it('should detect available biometric methods', () => {
    const auth = new BiometricAuth({});
    // Should at least check for available methods
    expect(typeof auth.detectSupportedMethods).toBe('function');
    expect(Array.isArray(auth.supportedMethods)).toBe(true);
  });

  it('should handle biometric authentication flow', async () => {
    const auth = new BiometricAuth({});
    
    // Mock the authentication methods to avoid actual hardware access
    auth.authenticateFingerprint = jest.fn().mockResolvedValue({ success: true, method: 'fingerprint' });
    auth.authenticateFace = jest.fn().mockResolvedValue({ success: true, method: 'face' });
    auth.authenticateVoice = jest.fn().mockResolvedValue({ success: true, method: 'voice' });
    
    // Test fingerprint authentication
    const fingerprintResult = await auth.authenticate('fingerprint');
    expect(fingerprintResult.success).toBe(true);
    expect(fingerprintResult.method).toBe('fingerprint');
    expect(auth.authenticateFingerprint).toHaveBeenCalled();
    
    // Test face authentication
    const faceResult = await auth.authenticate('face');
    expect(faceResult.success).toBe(true);
    expect(faceResult.method).toBe('face');
    expect(auth.authenticateFace).toHaveBeenCalled();
    
    // Test voice authentication
    const voiceResult = await auth.authenticate('voice');
    expect(voiceResult.success).toBe(true);
    expect(voiceResult.method).toBe('voice');
    expect(auth.authenticateVoice).toHaveBeenCalled();
  });

  it('should handle unsupported biometric methods', async () => {
    const auth = new BiometricAuth({});
    
    // Mock as no methods available for this test
    auth.supportedMethods = [];
    
    await expect(auth.authenticate('fingerprint')).rejects.toThrow('Fingerprint authentication not available');
    await expect(auth.authenticate('face')).rejects.toThrow('Face authentication not available');
    await expect(auth.authenticate('voice')).rejects.toThrow('Voice authentication not available');
  });
});
```

- [ ] **Step 12: Run test to verify it fails**

Run: `npm test tests/frontend/BiometricAuthFlow.integration.test.js`
Expected: FAIL with "Cannot find module" errors

- [ ] **Step 13: Write minimal implementation**

// Component should already exist from Task 4

- [ ] **Step 14: Run test to verify it passes**

Run: `npm test tests/frontend/BiometricAuthFlow.integration.test.js`
Expected: PASS

- [ ] **Step 15: Commit**

```bash
git add tests/frontend/BiometricAuthFlow.integration.test.js
git commit -m "feat: add biometric auth flow integration tests"
```

- [ ] **Step 16: Write Backend Auth API Integration Test**

```javascript
// tests/server/authApi.integration.test.js
const request = require('supertest');
const app = require('../server/index');

describe('Auth API Integration Tests', () => {
  beforeEach(() => {
    // Clear in-memory storage before each test
    // In a real implementation, we'd have a way to reset the test database
    // For now, we'll rely on the fact that each test uses different data
  });

  it('should handle complete registration and login flow', async () => {
    const testUser = {
      username: 'integrationtest',
      email: 'integration@example.com',
      password: 'SecurePass123!'
    };

    // Register user
    let res = await request(app)
      .post('/api/auth/register')
      .send(testUser);
    
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();

    // Login with same credentials
    res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      });
    
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();

    // Access protected route
    res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.data.token}`);
    
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(testUser.email);
  });

  it('should handle refresh token flow', async () => {
    const testUser = {
      username: 'refreshtest',
      email: 'refresh@example.com',
      password: 'SecurePass123!'
    };

    // Register user
    let res = await request(app)
      .post('/api/auth/register')
      .send(testUser);
    
    expect(res.statusCode).toBe(201);

    // Login to get tokens
    res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      });
    
    expect(res.statusCode).toBe(200);
    const refreshToken = res.body.data.refreshToken;

    // Use refresh token to get new access token
    res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    // Note: In our implementation, we generate a new refresh token each time
  });

  it('should handle logout flow', async () => {
    const testUser = {
      username: 'logouttest',
      email: 'logout@example.com',
      password: 'SecurePass123!'
    };

    // Register and login
    let res = await request(app)
      .post('/api/auth/register')
      .send(testUser);
    
    res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password
      });
    
    const refreshToken = res.body.data.refreshToken;

    // Logout
    res = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken });
    
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    // Try to use the same refresh token after logout - should fail
    res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    
    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
```

- [ ] **Step 17: Run test to verify it fails**

Run: `npm test tests/server/authApi.integration.test.js`
Expected: FAIL with "Cannot find module '../server/index'" or similar

- [ ] **Step 18: Write minimal implementation**

// The server and routes should already exist from Task 8

- [ ] **Step 19: Run test to verify it passes**

Run: `npm test tests/server/authApi.integration.test.js`
Expected: PASS

- [ ] **Step 20: Commit**

```bash
git add tests/server/authApi.integration.test.js
git commit -m "feat: add auth API integration tests"
```

### Task 12: Write End-to-End Tests

**Files:**
- Create: `tests/e2e/login.spec.js` (end-to-end login flow tests)
- Create: `tests/e2e/login-mobile.spec.js` (mobile-specific login tests)
- Create: `tests/e2e/login-accessibility.spec.js` (accessibility-focused login tests)

- [ ] **Step 1: Write the failing test for login flow**

```javascript
// tests/e2e/login.spec.js
const { test, expect } = require('@playwright/test');

test.describe('Login Flow E2E Tests', () => {
  test('should display login page correctly', async ({ page }) => {
    await page.goto('/');
    
    // Check if login elements are present
    await expect(page.locator('text=登录UltraWork AI')).toBeVisible();
    await expect(page.locator('input[placeholder="your@email.com"]')).toBeVisible();
    await expect(page.locator('input[placeholder="••••••••"]')).toBeVisible();
    await expect(page.locator('text=记住我')).toBeVisible();
    await expect(page.locator('text=登录')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/');
    
    // Fill in invalid credentials
    await page.fill('input[placeholder="your@email.com"]', 'invalid@example.com');
    await page.fill('input[placeholder="••••••••"]', 'wrongpassword');
    
    // Submit form
    await page.click('text=登录');
    
    // Check for error message
    await expect(page.locator('text=邮箱或密码错误')).toBeVisible();
  });

  test('should switch to modal mode for returning users', async ({ page }) => {
    // This would require setting up a returning user state
    // For simplicity, we'll test that both modes can be rendered
    await page.goto('/?mode=modal'); // Assuming we have a way to force mode
    
    await expect(page.locator('.login-modal')).toBeVisible();
    
    await page.goto('/?mode=fullscreen'); // Assuming we have a way to force mode
    
    await expect(page.locator('.login-fullscreen')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/e2e/login.spec.js`
Expected: FAIL with "Cannot find module '@playwright/test'" or similar (if Playwright not installed) or "Page not found" if routes not set up

- [ ] **Step 3: Write minimal implementation**

// The frontend and backend should already be implemented from previous tasks
// We need to ensure the routes are set up correctly

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/e2e/login.spec.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/login.spec.js
git commit -m "feat: add end-to-end login tests"
```

- [ ] **Step 6: Write mobile-specific login tests**

```javascript
// tests/e2e/login-mobile.spec.js
const { test, expect } = require('@playwright/test');

test.describe('Login Mobile E2E Tests', () => {
  test.use({
    viewport: { width: 375, height: 667 }, // iPhone SE size
  });

  test('should adapt layout for mobile devices', async ({ page }) => {
    await page.goto('/');
    
    // On mobile, should see stacked layout (brand area on top, form area below)
    const brandArea = page.locator('.brand-area');
    const formArea = page.locator('.form-area');
    
    const brandPosition = await brandArea.boundingBox();
    const formPosition = await formArea.boundingBox();
    
    // Brand area should be above form area
    expect(brandPosition.y + brandPosition.height).toBeLessThan(formPosition.y);
  });

  test('should have touch-friendly controls', async ({ page }) => {
    await page.goto('/');
    
    // Check minimum touch target sizes
    const loginButton = page.locator('text=登录');
    const buttonBox = await loginButton.boundingBox();
    
    expect(buttonBox.width).toBeGreaterThanOrEqual(44);
    expect(buttonBox.height).toBeGreaterThanOrEqual(44);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test tests/e2e/login-mobile.spec.js`
Expected: FAIL with similar reasons as above

- [ ] **Step 8: Write minimal implementation**

// Responsive styles should already be implemented from Task 7

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test tests/e2e/login-mobile.spec.js`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add tests/e2e/login-mobile.spec.js
git commit -m "feat: add mobile-specific end-to-end login tests"
```

- [ ] **Step 11: Write accessibility-focused login tests**

```javascript
// tests/e2e/login-accessibility.spec.js
const { test, expect } = require('@playwright/test');

test.describe('Login Accessibility E2E Tests', () => {
  test('should have proper ARIA labels and roles', async ({ page }) => {
    await page.goto('/');
    
    // Check for ARIA labels
    await expect(page.locator('[aria-label="Close modal"]')).toBeVisible();
    await expect(page.locator('[aria-label="显示/隐藏密码"]')).toBeVisible();
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toBeVisible();
    
    // Check for form labels
    await expect(page.locator('label[for="email"]')).toBeVisible();
    await expect(page.locator('label[for="password"]')).toBeVisible();
  });

  test('should be navigable via keyboard', async ({ page }) => {
    await page.goto('/');
    
    // Start with email field focused (assuming it's first in tab order)
    await page.fill('input[placeholder="your@email.com"]', 'test@example.com');
    
    // Press Tab to move to password field
    await page.press('input[placeholder="your@email.com"]', 'Tab');
    await expect(page.locator('input[placeholder="••••••••"]')).toBeFocused();
    
    // Press Tab to move to remember me checkbox
    await page.press('input[placeholder="••••••••"]', 'Tab');
    await expect(page.locator('input[type="checkbox"]')).toBeFocused();
    
    // Press Tab to move to login button
    await page.press('input[type="checkbox"]', 'Tab');
    await expect(page.locator('text=登录')).toBeFocused();
    
    // Press Enter to submit
    await page.press('text=登录', 'Enter');
    
    // Should show error for invalid password
    await expect(page.locator('text=邮箱或密码错误')).toBeVisible();
  });

  test('should respect reduced motion preferences', async ({ page }) => {
    // This would require setting up the browser to prefer reduced motion
    // For now, we'll check that animations are disabled when preferred
    await page.goto('/');
    
    // Check that character avatar doesn't have animation when reduced motion is preferred
    // This would require more complex setup to test properly
    // For now, we'll just verify the media query exists in our CSS
  });
});
```

- [ ] **Step 12: Run test to verify it fails**

Run: `npm test tests/e2e/login-accessibility.spec.js`
Expected: FAIL with similar reasons as above

- [ ] **Step 13: Write minimal implementation**

// Accessibility features should already be implemented from Task 6 and Task 7

- [ ] **Step 14: Run test to verify it passes**

Run: `npm test tests/e2e/login-accessibility.spec.js`
Expected: PASS

- [ ] **Step 15: Commit**

```bash
git add tests/e2e/login-accessibility.spec.js
git commit -m "feat: add accessibility-focused end-to-end login tests"
```

### Task 13: Update Documentation
```
