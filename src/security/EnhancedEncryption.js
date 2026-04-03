/**
 * EnhancedEncryption - 增强加密服务
 * 提供多种加密算法、密钥轮换、数据签名、密钥派生
 */

const crypto = require('crypto');

class EnhancedEncryption {
  constructor(options = {}) {
    this.defaultAlgorithm = options.algorithm || 'aes-256-gcm';
    this.defaultKeyLength = 32;
    this.defaultIVLength = 16;
    this.defaultAuthTagLength = 16;
    
    // 密钥缓存
    this.keyCache = new Map();
  }
  
  // 生成密钥
  generateKey(algorithm = this.defaultAlgorithm, length = this.defaultKeyLength) {
    return crypto.randomBytes(length);
  }
  
  // 从密码派生密钥
  deriveKey(password, salt, iterations = 100000, keyLength = 32) {
    return crypto.pbkdf2Sync(password, salt, iterations, keyLength, 'sha512');
  }
  
  // 生成盐
  generateSalt(length = 32) {
    return crypto.randomBytes(length);
  }
  
  // AES-GCM 加密
  encryptAESGCM(plaintext, key, iv = null) {
    const actualIV = iv || crypto.randomBytes(this.defaultIVLength);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, actualIV);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    return {
      iv: actualIV.toString('base64'),
      authTag: authTag.toString('base64'),
      data: encrypted
    };
  }
  
  // AES-GCM 解密
  decryptAESGCM(encryptedData, key) {
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');
    const data = Buffer.from(encryptedData.data, 'base64');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  // AES-CBC 加密
  encryptAESCBC(plaintext, key, iv = null) {
    const actualIV = iv || crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, actualIV);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      iv: actualIV.toString('hex'),
      data: encrypted
    };
  }
  
  // AES-CBC 解密
  decryptAESCBC(encryptedData, key) {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const data = Buffer.from(encryptedData.data, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  // RSA 加密
  encryptRSA(plaintext, publicKey, padding = 'oaep') {
    const buffer = Buffer.from(plaintext, 'utf8');
    const actualPadding = padding === 'oaep' ? 'RSA-OAEP' : 'RSA-PKCS1';
    
    const encrypted = crypto.publicEncrypt(
      { key: publicKey, padding: crypto[actualPadding] },
      buffer
    );
    
    return encrypted.toString('base64');
  }
  
  // RSA 解密
  decryptRSA(encryptedData, privateKey, padding = 'oaep') {
    const buffer = Buffer.from(encryptedData, 'base64');
    const actualPadding = padding === 'oaep' ? 'RSA-OAEP' : 'RSA-PKCS1';
    
    const decrypted = crypto.privateDecrypt(
      { key: privateKey, padding: crypto[actualPadding] },
      buffer
    );
    
    return decrypted.toString('utf8');
  }
  
  // 生成 RSA 密钥对
  generateRSAKeyPair(bits = 2048) {
    return crypto.generateKeyPairSync('rsa', {
      modulusLength: bits,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
  }
  
  // HMAC 签名
  signHMAC(data, key, algorithm = 'sha256') {
    const hmac = crypto.createHmac(algorithm, key);
    hmac.update(data);
    return hmac.digest('base64');
  }
  
  // 验证 HMAC
  verifyHMAC(data, signature, key, algorithm = 'sha256') {
    const expected = this.signHMAC(data, key, algorithm);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'base64'),
      Buffer.from(expected, 'base64')
    );
  }
  
  // RSA 签名
  signRSA(data, privateKey, algorithm = 'RSA-SHA256') {
    const sign = crypto.createSign(algorithm);
    sign.update(data);
    return sign.sign(privateKey, 'base64');
  }
  
  // 验证 RSA 签名
  verifyRSA(data, signature, publicKey, algorithm = 'RSA-SHA256') {
    const verify = crypto.createVerify(algorithm);
    verify.update(data);
    return verify.verify(publicKey, signature, 'base64');
  }
  
  // 哈希
  hash(data, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }
  
  // 随机 ID
  randomId(length = 16) {
    return crypto.randomBytes(length).toString('hex');
  }
  
  // 密钥轮换
  rotateKey(oldKey, newKey, data, encryptFn = 'encryptAESGCM') {
    // 解密旧数据
    const decrypted = this[encryptFn](data, oldKey).data || data;
    
    // 用新密钥加密
    return this[encryptFn](decrypted, newKey);
  }
  
  // 数据袋 (包含元数据)
  createSealedBag(data, key, options = {}) {
    const { algorithm = 'aes-256-gcm', expiresIn } = options;
    
    const sealed = {
      v: 1, // 版本
      alg: algorithm,
      data: this.encryptAESGCM(JSON.stringify(data), key),
      created: Date.now()
    };
    
    if (expiresIn) {
      sealed.expires = Date.now() + expiresIn;
    }
    
    return Buffer.from(JSON.stringify(sealed)).toString('base64');
  }
  
  // 解开数据袋
  openSealedBag(sealedBag, key) {
    try {
      const sealed = JSON.parse(Buffer.from(sealedBag, 'base64').toString('utf8'));
      
      // 检查版本
      if (sealed.v !== 1) {
        throw new Error('Unsupported version');
      }
      
      // 检查过期
      if (sealed.expires && Date.now() > sealed.expires) {
        throw new Error('Sealed bag has expired');
      }
      
      // 解密
      const decrypted = this.decryptAESGCM(sealed.data, key);
      return JSON.parse(decrypted);
    } catch (error) {
      return { error: error.message };
    }
  }
  
  // 临时密钥 (用于短时间加密)
  createEphemeralKey() {
    return {
      key: this.generateKey(),
      created: Date.now(),
      expires: Date.now() + 5 * 60 * 1000 // 5分钟
    };
  }
  
  // 验证临时密钥
  validateEphemeralKey(ephemeralKey) {
    if (Date.now() > ephemeralKey.expires) {
      return { valid: false, error: 'Key expired' };
    }
    return { valid: true, key: ephemeralKey.key };
  }
}

const encryption = new EnhancedEncryption();

module.exports = { EnhancedEncryption, encryption };