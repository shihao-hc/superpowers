const crypto = require('crypto');

class EncryptedChannel {
  constructor(options = {}) {
    this.algorithm = options.algorithm || 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
    this.keys = new Map();
    this.sessions = new Map();
    this.masterKey = options.masterKey || crypto.randomBytes(32);
  }

  generateKeyPair(agentId) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'secp256k1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    this.keys.set(agentId, { publicKey, privateKey });

    return { publicKey };
  }

  getPublicKey(agentId) {
    const keys = this.keys.get(agentId);
    return keys ? keys.publicKey : null;
  }

  createSession(agentA, agentB) {
    const sessionId = `sess_${agentA}_${agentB}_${Date.now().toString(36)}`;
    const sessionKey = crypto.randomBytes(32);

    this.sessions.set(sessionId, {
      id: sessionId,
      agents: [agentA, agentB],
      key: sessionKey,
      createdAt: Date.now(),
      messageCount: 0
    });

    return { sessionId };
  }

  encrypt(plaintext, key) {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    let encrypted = cipher.update(typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
      iv: iv.toString('hex'),
      content: encrypted,
      tag: tag.toString('hex')
    };
  }

  decrypt(encryptedData, key) {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      key,
      Buffer.from(encryptedData.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));

    let decrypted = decipher.update(encryptedData.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    try {
      return JSON.parse(decrypted);
    } catch (e) {
      return decrypted;
    }
  }

  encryptMessage(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const envelope = {
      id: `enc_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
      sessionId,
      from: message.from,
      to: message.to,
      timestamp: Date.now(),
      messageCount: ++session.messageCount
    };

    const encrypted = this.encrypt({
      content: message.content,
      metadata: message.metadata || {}
    }, session.key);

    return {
      ...envelope,
      encrypted
    };
  }

  decryptMessage(sessionId, envelope) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const decrypted = this.decrypt(envelope.encrypted, session.key);

    return {
      id: envelope.id,
      sessionId,
      from: envelope.from,
      to: envelope.to,
      content: decrypted.content,
      metadata: decrypted.metadata,
      timestamp: envelope.timestamp
    };
  }

  signData(data, privateKey) {
    const sign = crypto.createSign('SHA256');
    sign.update(JSON.stringify(data));
    return sign.sign(privateKey, 'hex');
  }

  verifySignature(data, signature, publicKey) {
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(JSON.stringify(data));
      return verify.verify(publicKey, signature, 'hex');
    } catch (e) {
      return false;
    }
  }

  signAndEncrypt(sessionId, message, privateKey) {
    const encrypted = this.encryptMessage(sessionId, message);
    const signature = this.signData(encrypted, privateKey);

    return {
      ...encrypted,
      signature
    };
  }

  verifyAndDecrypt(sessionId, envelope, publicKey) {
    if (envelope.signature) {
      const { signature, ...data } = envelope;
      if (!this.verifySignature(data, signature, publicKey)) {
        throw new Error('Signature verification failed');
      }
    }

    return this.decryptMessage(sessionId, envelope);
  }

  createAccessToken(agentId, permissions = {}, ttl = 3600000) {
    const token = {
      agentId,
      permissions,
      issuedAt: Date.now(),
      expiresAt: Date.now() + ttl,
      nonce: crypto.randomBytes(16).toString('hex')
    };

    const encrypted = this.encrypt(token, this.masterKey);

    return {
      token: Buffer.from(JSON.stringify(encrypted)).toString('base64'),
      expiresAt: token.expiresAt
    };
  }

  validateAccessToken(tokenStr) {
    try {
      const encrypted = JSON.parse(Buffer.from(tokenStr, 'base64').toString('utf8'));
      const token = this.decrypt(encrypted, this.masterKey);

      if (Date.now() > token.expiresAt) {
        return { valid: false, error: 'Token expired' };
      }

      return { valid: true, token };
    } catch (e) {
      return { valid: false, error: 'Invalid token' };
    }
  }

  rotateSessionKey(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    session.key = crypto.randomBytes(32);
    session.rotatedAt = Date.now();
    session.messageCount = 0;

    return { sessionId, rotatedAt: session.rotatedAt };
  }

  closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.key = null;
      this.sessions.delete(sessionId);
      return true;
    }
    return false;
  }

  getStats() {
    return {
      agents: this.keys.size,
      sessions: this.sessions.size,
      algorithm: this.algorithm
    };
  }

  destroy() {
    for (const [sessionId, session] of this.sessions) {
      session.key = null;
    }
    this.sessions.clear();
    this.keys.clear();
  }
}

module.exports = { EncryptedChannel };
