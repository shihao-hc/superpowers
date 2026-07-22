const { EnhancedEncryption } = require('../../src/security/EnhancedEncryption');

describe('EnhancedEncryption', () => {
  let enc;

  beforeEach(() => {
    enc = new EnhancedEncryption();
  });

  describe('constructor', () => {
    it('should create instance with defaults', () => {
      expect(enc.defaultAlgorithm).toBe('aes-256-gcm');
      expect(enc.defaultKeyLength).toBe(32);
      expect(enc.keyCache instanceof Map).toBe(true);
    });
  });

  describe('key generation', () => {
    it('should generate random key', () => {
      const key = enc.generateKey();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('should generate key with custom length', () => {
      const key = enc.generateKey('aes-256-gcm', 16);
      expect(key.length).toBe(16);
    });
  });

  describe('deriveKey / generateSalt', () => {
    it('should derive key from password', () => {
      const salt = enc.generateSalt(16);
      const key = enc.deriveKey('password123', salt, 100, 32);
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('should produce same key with same inputs', () => {
      const salt = enc.generateSalt(16);
      const key1 = enc.deriveKey('test', salt, 100, 16);
      const key2 = enc.deriveKey('test', salt, 100, 16);
      expect(key1.equals(key2)).toBe(true);
    });

    it('should use default salt length', () => {
      const salt = enc.generateSalt();
      expect(Buffer.isBuffer(salt)).toBe(true);
      expect(salt.length).toBe(32);
    });

    it('should use default iterations and keyLength', () => {
      const salt = enc.generateSalt(16);
      const key = enc.deriveKey('defaults', salt);
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });
  });

  describe('AES-GCM encrypt/decrypt', () => {
    it('should encrypt and decrypt', () => {
      const key = enc.generateKey();
      const encrypted = enc.encryptAESGCM('hello world', key);
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('authTag');
      expect(encrypted).toHaveProperty('data');
      const decrypted = enc.decryptAESGCM(encrypted, key);
      expect(decrypted).toBe('hello world');
    });

    it('should produce different ciphertext each time', () => {
      const key = enc.generateKey();
      const a = enc.encryptAESGCM('same', key);
      const b = enc.encryptAESGCM('same', key);
      expect(a.data).not.toBe(b.data);
    });
  });

  describe('AES-CBC encrypt/decrypt', () => {
    it('should encrypt and decrypt', () => {
      const key = enc.generateKey();
      const encrypted = enc.encryptAESCBC('test data', key);
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('data');
      const decrypted = enc.decryptAESCBC(encrypted, key);
      expect(decrypted).toBe('test data');
    });
  });

  describe('RSA encrypt/decrypt', () => {
    it('should encrypt and decrypt with key pair', () => {
      const { publicKey, privateKey } = enc.generateRSAKeyPair(1024);
      const encrypted = enc.encryptRSA('rsa secret', publicKey);
      const decrypted = enc.decryptRSA(encrypted, privateKey);
      expect(decrypted).toBe('rsa secret');
    });

    it('should support pkcs1 padding', () => {
      const { publicKey, privateKey } = enc.generateRSAKeyPair(1024);
      const encrypted = enc.encryptRSA('data', publicKey, 'pkcs1');
      const decrypted = enc.decryptRSA(encrypted, privateKey, 'pkcs1');
      expect(decrypted).toBe('data');
    });

    it('should use default bit length', () => {
      const { publicKey, privateKey } = enc.generateRSAKeyPair();
      expect(publicKey).toMatch(/BEGIN PUBLIC KEY/);
      expect(privateKey).toMatch(/BEGIN PRIVATE KEY/);
    });
  });

  describe('HMAC sign/verify', () => {
    it('should sign and verify', () => {
      const key = enc.generateKey(undefined, 16);
      const sig = enc.signHMAC('message', key);
      expect(typeof sig).toBe('string');
      expect(enc.verifyHMAC('message', sig, key)).toBe(true);
    });

    it('should reject tampered data', () => {
      const key = enc.generateKey(undefined, 16);
      const sig = enc.signHMAC('message', key);
      expect(enc.verifyHMAC('tampered', sig, key)).toBe(false);
    });
  });

  describe('RSA sign/verify', () => {
    it('should sign and verify', () => {
      const { publicKey, privateKey } = enc.generateRSAKeyPair(1024);
      const sig = enc.signRSA('important', privateKey);
      expect(enc.verifyRSA('important', sig, publicKey)).toBe(true);
    });

    it('should reject wrong signature', () => {
      const k1 = enc.generateRSAKeyPair(1024);
      const k2 = enc.generateRSAKeyPair(1024);
      const sig = enc.signRSA('data', k1.privateKey);
      expect(enc.verifyRSA('data', sig, k2.publicKey)).toBe(false);
    });
  });

  describe('hash', () => {
    it('should hash data', () => {
      const h = enc.hash('test');
      expect(typeof h).toBe('string');
      expect(h.length).toBe(64);
    });

    it('should produce consistent hash', () => {
      expect(enc.hash('same')).toBe(enc.hash('same'));
    });
  });

  describe('randomId', () => {
    it('should generate hex string', () => {
      const id = enc.randomId(8);
      expect(typeof id).toBe('string');
      expect(id.length).toBe(16);
    });

    it('should use default length', () => {
      const id = enc.randomId();
      expect(id.length).toBe(32);
    });
  });

  describe('sealed bag', () => {
    it('should create and open sealed bag', () => {
      const key = enc.generateKey();
      const bag = enc.createSealedBag({ user: 'alice', role: 'admin' }, key);
      expect(typeof bag).toBe('string');
      const result = enc.openSealedBag(bag, key);
      expect(result.user).toBe('alice');
      expect(result.role).toBe('admin');
    });

    it('should reject expired bag', () => {
      const key = enc.generateKey();
      const bag = enc.createSealedBag('data', key, { expiresIn: -1000 });
      const result = enc.openSealedBag(bag, key);
      expect(result.error).toBe('Sealed bag has expired');
    });
  });

  describe('ephemeral key', () => {
    it('should create and validate ephemeral key', () => {
      const ek = enc.createEphemeralKey();
      expect(ek.key).toBeDefined();
      expect(ek.expires).toBeGreaterThan(Date.now());
      const result = enc.validateEphemeralKey(ek);
      expect(result.valid).toBe(true);
    });

    it('should reject expired ephemeral key', () => {
      const ek = enc.createEphemeralKey();
      ek.expires = Date.now() - 1000;
      const result = enc.validateEphemeralKey(ek);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Key expired');
    });
  });

  describe('rotateKey', () => {
    it('should re-encrypt data with new key', () => {
      const oldKey = enc.generateKey();
      const newKey = enc.generateKey();
      const rotated = enc.rotateKey(oldKey, newKey, 'rotate me');
      expect(rotated).toHaveProperty('iv');
      expect(rotated).toHaveProperty('authTag');
      expect(rotated).toHaveProperty('data');
      const mid = enc.decryptAESGCM(
        { iv: rotated.iv, authTag: rotated.authTag, data: rotated.data }, newKey
      );
      expect(typeof mid).toBe('string');
      expect(mid.length).toBeGreaterThan(0);
    });

    it('should handle encryptFn without .data property', () => {
      const oldKey = enc.generateKey();
      const newKey = enc.generateKey();
      const result = enc.rotateKey(oldKey, newKey, 'fallback-data', 'signHMAC');
      expect(typeof result).toBe('string');
    });
  });

  describe('sealed bag version', () => {
    it('should reject unsupported version', () => {
      const key = enc.generateKey();
      const unsupported = Buffer.from(JSON.stringify({ v: 2, alg: 'aes-256-gcm', data: {}, created: Date.now() })).toString('base64');
      const result = enc.openSealedBag(unsupported, key);
      expect(result.error).toBe('Unsupported version');
    });
  });

  describe('explicit IV', () => {
    it('should encrypt GCM with provided IV', () => {
      const key = enc.generateKey();
      const iv = Buffer.alloc(16, 0x42);
      const result = enc.encryptAESGCM('fixed-iv-test', key, iv);
      expect(result.iv).toBe(iv.toString('base64'));
    });

    it('should encrypt CBC with provided IV', () => {
      const key = enc.generateKey();
      const iv = Buffer.alloc(16, 0x42);
      const result = enc.encryptAESCBC('fixed-iv-cbc', key, iv);
      expect(result.iv).toBe(iv.toString('hex'));
    });
  });
});
