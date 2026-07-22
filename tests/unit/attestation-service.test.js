'use strict';

const { AttestationService } = require('../../src/agent/AttestationService');

describe('AttestationService', () => {
  let service;

  beforeEach(() => {
    service = new AttestationService();
  });

  describe('constructor', () => {
    it('initializes with empty store', () => {
      expect(service.store).toBeInstanceOf(Map);
      expect(service.store.size).toBe(0);
    });

    it('defaults identity to null', () => {
      expect(service.identity).toBeNull();
    });

    it('defaults chainId to 1', () => {
      expect(service.chainId).toBe(1);
    });

    it('accepts custom chainId', () => {
      const s = new AttestationService({ chainId: 56 });
      expect(s.chainId).toBe(56);
    });

    it('accepts custom identity', () => {
      const identity = { signMessage: jest.fn() };
      const s = new AttestationService({ identity });
      expect(s.identity).toBe(identity);
    });
  });

  describe('createAttestation', () => {
    it('creates an attestation with id and hash', () => {
      const result = service.createAttestation({ message: 'hello' });
      expect(result.id).toContain('att_');
      expect(result.hash).toBeDefined();
      expect(result.hash.length).toBe(64);
    });

    it('stores attestation in the store', () => {
      const result = service.createAttestation({ message: 'hello' });
      const stored = service.store.get(result.id);
      expect(stored).toBeDefined();
      expect(stored.data).toEqual({ message: 'hello' });
    });

    it('includes metadata with chainId and version', () => {
      const result = service.createAttestation({ x: 1 }, { issuer: 'test_user' });
      expect(result.metadata.chainId).toBe(1);
      expect(result.metadata.version).toBe('1.0');
      expect(result.metadata.createdAt).toBeDefined();
      expect(result.metadata.issuer).toBe('test_user');
    });

    it('stores issuer in attestation', () => {
      const result = service.createAttestation({ x: 1 }, { issuer: 'test_user' });
      const stored = service.store.get(result.id);
      expect(stored.issuer).toBe('test_user');
    });

    it('signs attestation when identity is provided', () => {
      const mockIdentity = {
        signMessage: jest.fn().mockReturnValue('mock_sig')
      };
      const s = new AttestationService({ identity: mockIdentity });
      const result = s.createAttestation({ data: 'test' }, { issuer: 'alice' });
      expect(result.signature).toBe('mock_sig');
      expect(mockIdentity.signMessage).toHaveBeenCalledWith(
        'alice',
        expect.objectContaining({ id: result.id, hash: result.hash })
      );
    });

    it('handles signing failure gracefully', () => {
      const mockIdentity = {
        signMessage: jest.fn().mockImplementation(() => { throw new Error('sign fail'); })
      };
      const s = new AttestationService({ identity: mockIdentity });
      const result = s.createAttestation({ data: 'test' }, { issuer: 'bob' });
      expect(result.signature).toBeNull();
    });

    it('sets signature to null when no identity', () => {
      const result = service.createAttestation({ data: 'test' });
      expect(result.signature).toBeNull();
    });
  });

  describe('verifyAttestation', () => {
    it('returns valid for existing attestation with matching hash', () => {
      const att = service.createAttestation({ foo: 'bar' });
      const result = service.verifyAttestation(att.id);
      expect(result.valid).toBe(true);
      expect(result.attestation.id).toBe(att.id);
      expect(result.attestation.hash).toBe(att.hash);
    });

    it('returns not found for non-existing attestation', () => {
      const result = service.verifyAttestation('nonexistent');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Attestation not found');
    });

    it('detects data tampering', () => {
      const att = service.createAttestation({ original: 'data' });
      const stored = service.store.get(att.id);
      stored.data = { tampered: 'data' };
      const result = service.verifyAttestation(att.id);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Data integrity check failed');
    });

    it('verifies signature when identity and signature present', () => {
      const mockIdentity = {
        signMessage: jest.fn().mockReturnValue('sig'),
        getIdentity: jest.fn().mockReturnValue({ publicKey: 'pk' }),
        verifySignature: jest.fn().mockReturnValue(true)
      };
      const s = new AttestationService({ identity: mockIdentity });
      const att = s.createAttestation({ data: 'test' }, { issuer: 'alice' });
      const result = s.verifyAttestation(att.id);
      expect(result.valid).toBe(true);
    });

    it('fails verification when signature is invalid', () => {
      const mockIdentity = {
        signMessage: jest.fn().mockReturnValue('sig'),
        getIdentity: jest.fn().mockReturnValue({ publicKey: 'pk' }),
        verifySignature: jest.fn().mockReturnValue(false)
      };
      const s = new AttestationService({ identity: mockIdentity });
      const att = s.createAttestation({ data: 'test' }, { issuer: 'alice' });
      const result = s.verifyAttestation(att.id);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Signature verification failed');
    });

    it('skips signature verification when issuer not found', () => {
      const mockIdentity = {
        signMessage: jest.fn().mockReturnValue('sig'),
        getIdentity: jest.fn().mockReturnValue(null),
        verifySignature: jest.fn()
      };
      const s = new AttestationService({ identity: mockIdentity });
      const att = s.createAttestation({ data: 'test' }, { issuer: 'unknown' });
      const result = s.verifyAttestation(att.id);
      expect(result.valid).toBe(true);
      expect(mockIdentity.verifySignature).not.toHaveBeenCalled();
    });

    it('skips signature verification when no identity', () => {
      const att = service.createAttestation({ data: 'test' });
      const result = service.verifyAttestation(att.id);
      expect(result.valid).toBe(true);
    });

    it('includes verifiedAt in result', () => {
      const att = service.createAttestation({ data: 'test' });
      const result = service.verifyAttestation(att.id);
      expect(result.attestation.verifiedAt).toBeDefined();
      expect(typeof result.attestation.verifiedAt).toBe('number');
    });
  });

  describe('getAttestation', () => {
    it('returns stored attestation', () => {
      const att = service.createAttestation({ x: 1 });
      const stored = service.getAttestation(att.id);
      expect(stored.id).toBe(att.id);
      expect(stored.data).toEqual({ x: 1 });
    });

    it('returns null for non-existing', () => {
      expect(service.getAttestation('nonexistent')).toBeNull();
    });
  });

  describe('queryAttestations', () => {
    beforeEach(() => {
      service.createAttestation({ num: 1 }, { issuer: 'alice' });
      service.createAttestation({ num: 2 }, { issuer: 'bob' });
      service.createAttestation({ num: 3 }, { issuer: 'alice' });
    });

    it('returns all attestations with empty filter', () => {
      const results = service.queryAttestations({});
      expect(results.length).toBe(3);
    });

    it('returns all attestations without filter argument', () => {
      const results = service.queryAttestations();
      expect(results.length).toBe(3);
    });

    it('filters by issuer', () => {
      const results = service.queryAttestations({ issuer: 'alice' });
      expect(results.length).toBe(2);
    });

    it('filters by issuer with no matches', () => {
      const results = service.queryAttestations({ issuer: 'nonexistent' });
      expect(results.length).toBe(0);
    });

    it('returns results sorted by createdAt descending', () => {
      const results = service.queryAttestations({});
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].metadata.createdAt).toBeGreaterThanOrEqual(
          results[i].metadata.createdAt
        );
      }
    });

    it('filters by after date excluding older entries', () => {
      const future = Date.now() + 3600000;
      const results = service.queryAttestations({ after: future });
      expect(results.length).toBe(0);
    });

    it('filters by before date excluding newer entries', () => {
      const past = Date.now() - 3600000;
      const results = service.queryAttestations({ before: past });
      expect(results.length).toBe(0);
    });
  });

  describe('createTaskAttestation', () => {
    it('creates attestation with task data', () => {
      const task = { id: 'task1', status: 'completed', result: 'ok', duration: 100 };
      const result = service.createTaskAttestation(task);
      expect(result.hash).toBeDefined();
      expect(result.metadata.issuer).toBe('task_executor');
      expect(result.metadata.description).toBe('Agent task execution result');
    });
  });

  describe('createDataAttestation', () => {
    it('creates attestation with data and description', () => {
      const result = service.createDataAttestation({ value: 42 }, 'test data');
      expect(result.hash).toBeDefined();
      expect(result.metadata.description).toBe('test data');
    });
  });

  describe('generateMerkleRoot', () => {
    it('returns null for empty array', () => {
      expect(service.generateMerkleRoot([])).toBeNull();
    });

    it('returns null when no attestations found', () => {
      expect(service.generateMerkleRoot(['nonexistent1', 'nonexistent2'])).toBeNull();
    });

    it('returns hash for single attestation', () => {
      const att = service.createAttestation({ data: 1 });
      const root = service.generateMerkleRoot([att.id]);
      expect(root.length).toBe(64);
      expect(root).toBe(att.hash);
    });

    it('returns combined hash for multiple attestations', () => {
      const a1 = service.createAttestation({ data: 1 });
      const a2 = service.createAttestation({ data: 2 });
      const a3 = service.createAttestation({ data: 3 });
      const root = service.generateMerkleRoot([a1.id, a2.id, a3.id]);
      expect(root.length).toBe(64);
      expect(root).not.toBe(a1.hash);
    });

    it('filters out null hashes for missing attestations', () => {
      const att = service.createAttestation({ data: 1 });
      const root = service.generateMerkleRoot([att.id, 'missing']);
      expect(root).toBe(att.hash);
    });

    it('produces deterministic result for same set', () => {
      const a1 = service.createAttestation({ data: 1 });
      const a2 = service.createAttestation({ data: 2 });
      const r1 = service.generateMerkleRoot([a1.id, a2.id]);
      const r2 = service.generateMerkleRoot([a1.id, a2.id]);
      expect(r1).toBe(r2);
    });
  });

  describe('exportAttestation and importAttestation', () => {
    it('exports to JSON string and imports back', () => {
      const att = service.createAttestation({ hello: 'world' });
      const json = service.exportAttestation(att.id);
      expect(json).toContain('hello');
      expect(json).toContain('world');

      const s2 = new AttestationService();
      const importedId = s2.importAttestation(json);
      expect(importedId).toBe(att.id);
      expect(s2.store.has(importedId)).toBe(true);
    });

    it('returns null when exporting non-existing attestation', () => {
      expect(service.exportAttestation('nonexistent')).toBeNull();
    });

    it('fails importing invalid JSON', () => {
      expect(() => service.importAttestation('not json'))
        .toThrow('Failed to import attestation');
    });

    it('fails importing attestation without id', () => {
      expect(() => service.importAttestation(JSON.stringify({ hash: 'abc' })))
        .toThrow('Invalid attestation format');
    });

    it('fails importing attestation without hash', () => {
      expect(() => service.importAttestation(JSON.stringify({ id: 'abc' })))
        .toThrow('Invalid attestation format');
    });

    it('fails importing attestation with tampered data', () => {
      const att = service.createAttestation({ original: 'data' });
      const json = service.exportAttestation(att.id);
      const parsed = JSON.parse(json);
      parsed.data.original = 'tampered';
      const tamperedJson = JSON.stringify(parsed);

      expect(() => service.importAttestation(tamperedJson))
        .toThrow('Hash verification failed');
    });

    it('imports attestation without data field', () => {
      const json = JSON.stringify({ id: 'nodata', hash: 'abc' });
      const id = service.importAttestation(json);
      expect(id).toBe('nodata');
      expect(service.store.has('nodata')).toBe(true);
    });
  });

  describe('getStats', () => {
    it('returns zeros for empty service', () => {
      const stats = service.getStats();
      expect(stats.total).toBe(0);
      expect(stats.signed).toBe(0);
      expect(stats.chainId).toBe(1);
    });

    it('counts signed attestations', () => {
      const mockIdentity = {
        signMessage: jest.fn().mockReturnValue('sig'),
        getIdentity: jest.fn().mockReturnValue({ publicKey: 'pk' }),
        verifySignature: jest.fn().mockReturnValue(true)
      };
      const s = new AttestationService({ identity: mockIdentity });
      s.createAttestation({ a: 1 }, { issuer: 'x' });
      s.createAttestation({ b: 2 });
      const stats = s.getStats();
      expect(stats.total).toBe(2);
      expect(stats.signed).toBe(2);
    });
  });
});
