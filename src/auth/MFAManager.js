const crypto = require('crypto');

class MFAManager {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.issuer = options.issuer || 'UltraWork';
    this.backupCodes = new Map();
    this.userSecrets = new Map();
    this.tempSecrets = new Map();
  }

  generateSecret(username) {
    const secret = crypto.randomBytes(20).toString('hex');
    const tempId = crypto.randomBytes(8).toString('hex');
    
    this.tempSecrets.set(tempId, {
      username,
      secret,
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000
    });

    return {
      tempId,
      secret,
      otpauthUrl: `otpauth://totp/${this.issuer}:${username}?secret=${this.secret}&issuer=${this.issuer}&algorithm=SHA1&digits=6&period=30`
    };
  }

  verifyTempSecret(tempId, totpCode) {
    const tempData = this.tempSecrets.get(tempId);
    if (!tempData) {
      return { valid: false, error: 'Invalid setup ID' };
    }

    if (Date.now() > tempData.expiresAt) {
      this.tempSecrets.delete(tempId);
      return { valid: false, error: 'Setup expired' };
    }

    const isValid = this.verifyTOTP(tempData.secret, totpCode);
    if (isValid) {
      this.userSecrets.set(tempData.username, {
        secret: tempData.secret,
        enabled: true,
        enabledAt: Date.now()
      });
      this.tempSecrets.delete(tempId);
      this._generateBackupCodes(tempData.username);
      return { valid: true, backupCodes: this.getBackupCodes(tempData.username) };
    }

    return { valid: false, error: 'Invalid code' };
  }

  verifyTOTP(secret, code) {
    if (!code || !/^\d{6}$/.test(code)) {
      return false;
    }

    const time = Math.floor(Date.now() / 30000);
    const window = 1;

    for (let i = -window; i <= window; i++) {
      const t = time + i;
      const expectedCode = this._generateTOTP(secret, t);
      if (this._timingSafeEqual(code, expectedCode)) {
        return true;
      }
    }

    return false;
  }

  _generateTOTP(secret, time) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(time), 0);
    
    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'hex'));
    hmac.update(buffer);
    const hmacResult = hmac.digest();

    const offset = hmacResult[hmacResult.length - 1] & 0x0F;
    const code = (
      ((hmacResult[offset] & 0x7F) << 24) |
      ((hmacResult[offset + 1] & 0xFF) << 16) |
      ((hmacResult[offset + 2] & 0xFF) << 8) |
      (hmacResult[offset + 3] & 0xFF)
    ) % 1000000;

    return code.toString().padStart(6, '0');
  }

  _timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return crypto.timingSafeEqual(bufA, bufB);
  }

  verify(username, code) {
    const userMFA = this.userSecrets.get(username);
    if (!userMFA || !userMFA.enabled) {
      return { valid: false, error: 'MFA not enabled' };
    }

    if (/^\d{8}-\d{8}$/.test(code)) {
      return this._verifyBackupCode(username, code);
    }

    return this.verifyTOTP(userMFA.secret, code)
      ? { valid: true }
      : { valid: false, error: 'Invalid code' };
  }

  _generateBackupCodes(username) {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      const code = `${this._randomDigits(8)}-${this._randomDigits(8)}`;
      codes.push({ code, used: false, usedAt: null });
    }
    this.backupCodes.set(username, codes);
    return codes;
  }

  _randomDigits(length) {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += Math.floor(Math.random() * 10);
    }
    return result;
  }

  getBackupCodes(username) {
    const codes = this.backupCodes.get(username);
    if (!codes) return [];
    return codes.filter(c => !c.used).map(c => c.code);
  }

  _verifyBackupCode(username, code) {
    const codes = this.backupCodes.get(username);
    if (!codes) return { valid: false, error: 'No backup codes' };

    const index = codes.findIndex(c => c.code === code && !c.used);
    if (index === -1) {
      return { valid: false, error: 'Invalid backup code' };
    }

    codes[index] = { code: codes[index].code, used: true, usedAt: Date.now() };
    return { valid: true, remainingCodes: codes.filter(c => !c.used).length };
  }

  isEnabled(username) {
    const userMFA = this.userSecrets.get(username);
    return userMFA?.enabled || false;
  }

  disable(username) {
    this.userSecrets.delete(username);
    this.backupCodes.delete(username);
    return { success: true };
  }

  getStatus(username) {
    const userMFA = this.userSecrets.get(username);
    return {
      enabled: userMFA?.enabled || false,
      enabledAt: userMFA?.enabledAt || null,
      backupCodesRemaining: this.backupCodes.get(username)?.filter(c => !c.used).length || 0
    };
  }
}

let globalMFAManager = null;

function getMFAManager(options) {
  if (!globalMFAManager) {
    globalMFAManager = new MFAManager(options);
  }
  return globalMFAManager;
}

module.exports = { MFAManager, getMFAManager };
