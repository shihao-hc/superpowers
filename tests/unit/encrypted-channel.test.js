'use strict';

const crypto = require('crypto');
const { EncryptedChannel } = require('../../src/agent/EncryptedChannel');

describe('EncryptedChannel', () => {
  let channel;

  beforeEach(() => {
    channel = new EncryptedChannel();
  });

  describe('constructor', () => {
    it('uses aes-256-gcm by default', () => {
      expect(channel.algorithm).toBe('aes-256-gcm');
    });

    it('sets key lengths correctly', () => {
      expect(channel.keyLength).toBe(32);
      expect(channel.ivLength).toBe(16);
      expect(channel.tagLength).toBe(16);
    });

    it('initializes empty maps', () => {
      expect(channel.keys.size).toBe(0);
      expect(channel.sessions.size).toBe(0);
    });

    it('generates random masterKey when none provided', () => {
      expect(channel.masterKey.length).toBe(32);
    });

    it('uses provided masterKey', () => {
      const key = crypto.randomBytes(32);
      const c = new EncryptedChannel({ masterKey: key });
      expect(c.masterKey).toEqual(key);
    });

    it('uses custom algorithm', () => {
      const c = new EncryptedChannel({ algorithm: 'aes-256-cbc' });
      expect(c.algorithm).toBe('aes-256-cbc');
    });
  });

  describe('generateKeyPair', () => {
    it('returns publicKey', () => {
      const result = channel.generateKeyPair('agent1');
      expect(result.publicKey).toContain('BEGIN PUBLIC KEY');
    });

    it('stores keys internally', () => {
      channel.generateKeyPair('agent1');
      const keys = channel.keys.get('agent1');
      expect(keys.publicKey).toContain('BEGIN PUBLIC KEY');
      expect(keys.privateKey).toContain('BEGIN PRIVATE KEY');
    });

    it('overwrites existing keys for same agent', () => {
      channel.generateKeyPair('agent1');
      const firstKey = channel.keys.get('agent1').publicKey;
      channel.generateKeyPair('agent1');
      const secondKey = channel.keys.get('agent1').publicKey;
      expect(firstKey).not.toBe(secondKey);
    });
  });

  describe('getPublicKey', () => {
    it('returns public key for registered agent', () => {
      channel.generateKeyPair('agent1');
      const key = channel.getPublicKey('agent1');
      expect(key).toContain('BEGIN PUBLIC KEY');
    });

    it('returns null for unregistered agent', () => {
      expect(channel.getPublicKey('nonexistent')).toBeNull();
    });
  });

  describe('createSession', () => {
    it('returns sessionId', () => {
      const result = channel.createSession('alice', 'bob');
      expect(result.sessionId).toContain('sess_alice_bob_');
    });

    it('stores session with metadata', () => {
      const result = channel.createSession('alice', 'bob');
      const session = channel.sessions.get(result.sessionId);
      expect(session.agents).toEqual(['alice', 'bob']);
      expect(session.key.length).toBe(32);
      expect(session.messageCount).toBe(0);
      expect(session.createdAt).toBeDefined();
    });
  });

  describe('encrypt and decrypt', () => {
    it('encrypts and decrypts a string', () => {
      const key = crypto.randomBytes(32);
      const encrypted = channel.encrypt('hello secret', key);
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.content).toBeDefined();
      expect(encrypted.tag).toBeDefined();

      const decrypted = channel.decrypt(encrypted, key);
      expect(decrypted).toBe('hello secret');
    });

    it('encrypts and decrypts an object', () => {
      const key = crypto.randomBytes(32);
      const data = { foo: 'bar', num: 42 };
      const encrypted = channel.encrypt(data, key);
      const decrypted = channel.decrypt(encrypted, key);
      expect(decrypted).toEqual(data);
    });

    it('produces different ciphertext each time for same input', () => {
      const key = crypto.randomBytes(32);
      const e1 = channel.encrypt('same', key);
      const e2 = channel.encrypt('same', key);
      expect(e1.content).not.toBe(e2.content);
      expect(e1.iv).not.toBe(e2.iv);
    });

    it('encrypts plain string input', () => {
      const key = crypto.randomBytes(32);
      const encrypted = channel.encrypt('raw string', key);
      const decrypted = channel.decrypt(encrypted, key);
      expect(decrypted).toBe('raw string');
    });
  });

  describe('encryptMessage and decryptMessage', () => {
    let sessionId;

    beforeEach(() => {
      const sess = channel.createSession('alice', 'bob');
      sessionId = sess.sessionId;
    });

    it('encrypts and decrypts a message round-trip', () => {
      const msg = {
        from: 'alice',
        to: 'bob',
        content: 'Hello Bob!',
        metadata: { type: 'text' }
      };

      const envelope = channel.encryptMessage(sessionId, msg);
      expect(envelope.id).toContain('enc_');
      expect(envelope.sessionId).toBe(sessionId);
      expect(envelope.from).toBe('alice');
      expect(envelope.to).toBe('bob');
      expect(envelope.timestamp).toBeDefined();
      expect(envelope.messageCount).toBe(1);
      expect(envelope.encrypted).toBeDefined();

      const decrypted = channel.decryptMessage(sessionId, envelope);
      expect(decrypted.content).toBe('Hello Bob!');
      expect(decrypted.metadata).toEqual({ type: 'text' });
      expect(decrypted.from).toBe('alice');
    });

    it('increments messageCount on each call', () => {
      channel.encryptMessage(sessionId, { from: 'alice', to: 'bob', content: 'msg1' });
      expect(channel.sessions.get(sessionId).messageCount).toBe(1);

      channel.encryptMessage(sessionId, { from: 'alice', to: 'bob', content: 'msg2' });
      expect(channel.sessions.get(sessionId).messageCount).toBe(2);
    });

    it('throws for invalid session on encrypt', () => {
      expect(() => channel.encryptMessage('invalid', { from: 'x', to: 'y', content: 'test' }))
        .toThrow('Session not found');
    });

    it('throws for invalid session on decrypt', () => {
      expect(() => channel.decryptMessage('invalid', { encrypted: {} }))
        .toThrow('Session not found');
    });

    it('defaults metadata to empty object', () => {
      const envelope = channel.encryptMessage(sessionId, {
        from: 'alice', to: 'bob', content: 'no meta'
      });
      const decrypted = channel.decryptMessage(sessionId, envelope);
      expect(decrypted.metadata).toEqual({});
    });
  });

  describe('signData and verifySignature', () => {
    let keyPair;

    beforeEach(() => {
      keyPair = crypto.generateKeyPairSync('ec', {
        namedCurve: 'secp256k1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
    });

    it('signs data and verifies with valid public key', () => {
      const data = { id: 1, message: 'hello' };
      const signature = channel.signData(data, keyPair.privateKey);
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);

      const valid = channel.verifySignature(data, signature, keyPair.publicKey);
      expect(valid).toBe(true);
    });

    it('rejects signature with wrong public key', () => {
      const data = { id: 1 };
      const signature = channel.signData(data, keyPair.privateKey);

      const otherPair = crypto.generateKeyPairSync('ec', {
        namedCurve: 'secp256k1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const valid = channel.verifySignature(data, signature, otherPair.publicKey);
      expect(valid).toBe(false);
    });

    it('returns false for tampered data', () => {
      const data = { id: 1, message: 'original' };
      const signature = channel.signData(data, keyPair.privateKey);

      const tamperedData = { id: 1, message: 'tampered' };
      const valid = channel.verifySignature(tamperedData, signature, keyPair.publicKey);
      expect(valid).toBe(false);
    });

    it('returns false for invalid signature format', () => {
      const result = channel.verifySignature({}, 'invalid-signature', keyPair.publicKey);
      expect(result).toBe(false);
    });

    it('returns false when verify throws', () => {
      const result = channel.verifySignature({}, 'garbage', 'not-a-key');
      expect(result).toBe(false);
    });
  });

  describe('signAndEncrypt and verifyAndDecrypt', () => {
    let sessionId;
    let keyPair;

    beforeEach(() => {
      const sess = channel.createSession('alice', 'bob');
      sessionId = sess.sessionId;
      keyPair = crypto.generateKeyPairSync('ec', {
        namedCurve: 'secp256k1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
    });

    it('signs encrypts and verify-decrypts round-trip', () => {
      const msg = { from: 'alice', to: 'bob', content: 'signed message', metadata: {} };
      const signed = channel.signAndEncrypt(sessionId, msg, keyPair.privateKey);
      expect(signed.signature).toBeDefined();

      const result = channel.verifyAndDecrypt(sessionId, signed, keyPair.publicKey);
      expect(result.content).toBe('signed message');
    });

    it('throws on signature mismatch', () => {
      const msg = { from: 'alice', to: 'bob', content: 'test', metadata: {} };
      const signed = channel.signAndEncrypt(sessionId, msg, keyPair.privateKey);

      const wrongPair = crypto.generateKeyPairSync('ec', {
        namedCurve: 'secp256k1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      expect(() => channel.verifyAndDecrypt(sessionId, signed, wrongPair.publicKey))
        .toThrow('Signature verification failed');
    });

    it('skips verification when no signature present', () => {
      const msg = { from: 'alice', to: 'bob', content: 'no sig', metadata: {} };
      const envelope = channel.encryptMessage(sessionId, msg);
      const result = channel.verifyAndDecrypt(sessionId, envelope, keyPair.publicKey);
      expect(result.content).toBe('no sig');
    });
  });

  describe('createAccessToken and validateAccessToken', () => {
    it('creates a token and validates it', () => {
      const token = channel.createAccessToken('agent1', { read: true, write: false }, 60000);
      expect(token.token).toBeDefined();
      expect(token.expiresAt).toBeGreaterThan(Date.now());

      const validation = channel.validateAccessToken(token.token);
      expect(validation.valid).toBe(true);
      expect(validation.token.agentId).toBe('agent1');
      expect(validation.token.permissions).toEqual({ read: true, write: false });
    });

    it('creates token with default permissions and TTL', () => {
      const token = channel.createAccessToken('agent1');
      const validation = channel.validateAccessToken(token.token);
      expect(validation.valid).toBe(true);
      expect(validation.token.permissions).toEqual({});
    });

    it('fails validation for garbage token', () => {
      const validation = channel.validateAccessToken('not-a-valid-token');
      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Invalid token');
    });

    it('fails validation for invalid base64', () => {
      const validation = channel.validateAccessToken('!!!invalid-base64!!!');
      expect(validation.valid).toBe(false);
    });

    it('fails validation for tampered encrypted payload', () => {
      const token = channel.createAccessToken('agent1');
      const parts = token.token.split('.');
      const tampered = parts.length > 1
        ? parts[0] + '.tampered.' + parts.slice(2).join('.')
        : token.token.slice(0, -5) + 'XXXXX';
      const validation = channel.validateAccessToken(tampered);
      expect(validation.valid).toBe(false);
    });

    it('fails validation for expired token', () => {
      const token = channel.createAccessToken('agent1', {}, -1);
      const validation = channel.validateAccessToken(token.token);
      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Token expired');
    });
  });

  describe('rotateSessionKey', () => {
    it('rotates the session key', () => {
      const sess = channel.createSession('a', 'b');
      const oldKey = channel.sessions.get(sess.sessionId).key;

      const result = channel.rotateSessionKey(sess.sessionId);
      expect(result.sessionId).toBe(sess.sessionId);
      expect(result.rotatedAt).toBeDefined();

      const newKey = channel.sessions.get(sess.sessionId).key;
      expect(newKey).not.toEqual(oldKey);
    });

    it('resets messageCount on rotation', () => {
      const sess = channel.createSession('a', 'b');
      channel.encryptMessage(sess.sessionId, { from: 'a', to: 'b', content: 'test' });
      expect(channel.sessions.get(sess.sessionId).messageCount).toBe(1);

      channel.rotateSessionKey(sess.sessionId);
      expect(channel.sessions.get(sess.sessionId).messageCount).toBe(0);
    });

    it('throws for invalid session', () => {
      expect(() => channel.rotateSessionKey('invalid'))
        .toThrow('Session not found');
    });
  });

  describe('closeSession', () => {
    it('closes an existing session', () => {
      const sess = channel.createSession('a', 'b');
      expect(channel.closeSession(sess.sessionId)).toBe(true);
      expect(channel.sessions.has(sess.sessionId)).toBe(false);
    });

    it('returns false for non-existing session', () => {
      expect(channel.closeSession('nonexistent')).toBe(false);
    });

    it('nullifies session key before deleting', () => {
      const sess = channel.createSession('a', 'b');
      const session = channel.sessions.get(sess.sessionId);
      channel.closeSession(sess.sessionId);
      expect(session.key).toBeNull();
    });
  });

  describe('getStats', () => {
    it('returns zeros for empty channel', () => {
      const stats = channel.getStats();
      expect(stats.agents).toBe(0);
      expect(stats.sessions).toBe(0);
      expect(stats.algorithm).toBe('aes-256-gcm');
    });

    it('reflects current state', () => {
      channel.generateKeyPair('a1');
      channel.generateKeyPair('a2');
      channel.createSession('a1', 'a2');

      const stats = channel.getStats();
      expect(stats.agents).toBe(2);
      expect(stats.sessions).toBe(1);
    });
  });

  describe('destroy', () => {
    it('clears all keys and sessions', () => {
      channel.generateKeyPair('a1');
      channel.createSession('a1', 'a2');
      expect(channel.keys.size).toBe(1);
      expect(channel.sessions.size).toBe(1);

      channel.destroy();
      expect(channel.keys.size).toBe(0);
      expect(channel.sessions.size).toBe(0);
    });

    it('nullifies session keys before clearing', () => {
      const sess = channel.createSession('a', 'b');
      const session = channel.sessions.get(sess.sessionId);
      channel.destroy();
      expect(session.key).toBeNull();
    });
  });
});
