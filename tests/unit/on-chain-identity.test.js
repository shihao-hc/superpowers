const { OnChainIdentity } = require('../../src/agent/OnChainIdentity');

describe('OnChainIdentity', () => {
  let identity;

  beforeEach(() => {
    identity = new OnChainIdentity();
  });

  describe('constructor', () => {
    it('sets default values', () => {
      expect(identity.chainId).toBe(1);
      expect(identity.rpcUrl).toBe('https://mainnet.infura.io/v3/YOUR_KEY');
      expect(identity.identityStore).toBeInstanceOf(Map);
      expect(identity.reputationStore).toBeInstanceOf(Map);
      expect(identity.serviceRegistry).toBeInstanceOf(Map);
    });

    it('accepts custom options', () => {
      const custom = new OnChainIdentity({ chainId: 137, rpcUrl: 'https://polygon-rpc.com' });
      expect(custom.chainId).toBe(137);
      expect(custom.rpcUrl).toBe('https://polygon-rpc.com');
    });
  });

  describe('generateAgentId', () => {
    it('generates an agent ID with expected format', () => {
      const id = identity.generateAgentId();
      expect(id).toMatch(/^agent_[a-z0-9]+_[a-f0-9]{32}$/);
    });

    it('generates unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(identity.generateAgentId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('createIdentity', () => {
    it('creates identity and returns public info', () => {
      const result = identity.createIdentity('TestAgent', { capabilities: ['chat'] });
      expect(result.agentId).toMatch(/^agent_/);
      expect(result.name).toBe('TestAgent');
      expect(result.publicKey).toMatch(/^-----BEGIN PUBLIC KEY-----/);
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.metadata.capabilities).toEqual(['chat']);
      expect(result.metadata.version).toBe('1.0');
      expect(result.metadata.description).toBe('');
      expect(result.metadata.owner).toBeNull();
    });

    it('stores private key internally', () => {
      const result = identity.createIdentity('TestAgent');
      const stored = identity.identityStore.get(result.agentId);
      expect(stored.privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    });

    it('does not expose private key in result', () => {
      const result = identity.createIdentity('TestAgent');
      expect(result.privateKey).toBeUndefined();
    });

    it('initializes reputation to zero', () => {
      const result = identity.createIdentity('TestAgent');
      const stored = identity.identityStore.get(result.agentId);
      expect(stored.reputation).toEqual({
        score: 0,
        interactions: 0,
        successfulTasks: 0,
        failedTasks: 0
      });
    });

    it('merges metadata with defaults', () => {
      const result = identity.createIdentity('Agent', {
        capabilities: ['trade'],
        owner: 'alice',
        description: 'trading agent',
        customField: 'extra'
      });
      expect(result.metadata.capabilities).toEqual(['trade']);
      expect(result.metadata.owner).toBe('alice');
      expect(result.metadata.description).toBe('trading agent');
      expect(result.metadata.customField).toBe('extra');
    });
  });

  describe('getIdentity', () => {
    it('returns identity without private key', () => {
      const created = identity.createIdentity('TestAgent');
      const retrieved = identity.getIdentity(created.agentId);
      expect(retrieved.agentId).toBe(created.agentId);
      expect(retrieved.name).toBe('TestAgent');
      expect(retrieved.publicKey).toBeTruthy();
      expect(retrieved.privateKey).toBeUndefined();
      expect(retrieved.reputation).toBeDefined();
    });

    it('returns null for unknown agent', () => {
      expect(identity.getIdentity('nonexistent')).toBeNull();
    });
  });

  describe('signMessage', () => {
    it('signs a string message', () => {
      const created = identity.createIdentity('TestAgent');
      const signature = identity.signMessage(created.agentId, 'hello');
      expect(signature).toMatch(/^[a-f0-9]+$/);
      expect(signature.length).toBeGreaterThan(0);
    });

    it('signs an object message', () => {
      const created = identity.createIdentity('TestAgent');
      const signature = identity.signMessage(created.agentId, { action: 'test' });
      expect(signature).toMatch(/^[a-f0-9]+$/);
    });

    it('throws for unknown agent', () => {
      expect(() => identity.signMessage('nonexistent', 'hello')).toThrow('Identity not found');
    });
  });

  describe('verifySignature', () => {
    it('verifies a valid signature', () => {
      const created = identity.createIdentity('TestAgent');
      const signature = identity.signMessage(created.agentId, 'hello');
      const verified = identity.verifySignature(created.publicKey, 'hello', signature);
      expect(verified).toBe(true);
    });

    it('rejects signature for different message', () => {
      const created = identity.createIdentity('TestAgent');
      const signature = identity.signMessage(created.agentId, 'hello');
      const verified = identity.verifySignature(created.publicKey, 'world', signature);
      expect(verified).toBe(false);
    });

    it('verifies object message', () => {
      const created = identity.createIdentity('TestAgent');
      const msg = { data: 'test' };
      const signature = identity.signMessage(created.agentId, msg);
      const verified = identity.verifySignature(created.publicKey, msg, signature);
      expect(verified).toBe(true);
    });

    it('returns false for invalid signature hex', () => {
      const created = identity.createIdentity('TestAgent');
      const verified = identity.verifySignature(created.publicKey, 'hello', 'invalidhex');
      expect(verified).toBe(false);
    });

    it('returns false for malformed public key', () => {
      const verified = identity.verifySignature('bad-key', 'hello', 'deadbeef');
      expect(verified).toBe(false);
    });
  });

  describe('updateReputation', () => {
    it('increases score on success', () => {
      const created = identity.createIdentity('TestAgent');
      const rep = identity.updateReputation(created.agentId, true);
      expect(rep.score).toBe(10);
      expect(rep.interactions).toBe(1);
      expect(rep.successfulTasks).toBe(1);
      expect(rep.failedTasks).toBe(0);
    });

    it('decreases score on failure (min 0)', () => {
      const created = identity.createIdentity('TestAgent');
      const rep = identity.updateReputation(created.agentId, false);
      expect(rep.score).toBe(0);
      expect(rep.interactions).toBe(1);
      expect(rep.failedTasks).toBe(1);
      expect(rep.successfulTasks).toBe(0);
    });

    it('prevents reputation from going below zero', () => {
      const created = identity.createIdentity('TestAgent');
      identity.updateReputation(created.agentId, false);
      identity.updateReputation(created.agentId, false);
      identity.updateReputation(created.agentId, false);
      const rep = identity.getReputation(created.agentId);
      expect(rep.score).toBe(0);
    });

    it('accumulates multiple successes', () => {
      const created = identity.createIdentity('TestAgent');
      identity.updateReputation(created.agentId, true);
      identity.updateReputation(created.agentId, true);
      identity.updateReputation(created.agentId, true);
      const rep = identity.getReputation(created.agentId);
      expect(rep.score).toBe(30);
      expect(rep.interactions).toBe(3);
    });

    it('throws for unknown agent', () => {
      expect(() => identity.updateReputation('nonexistent', true)).toThrow('Identity not found');
    });
  });

  describe('getReputation', () => {
    it('returns reputation with success rate', () => {
      const created = identity.createIdentity('TestAgent');
      identity.updateReputation(created.agentId, true);
      identity.updateReputation(created.agentId, true);
      identity.updateReputation(created.agentId, false);
      const rep = identity.getReputation(created.agentId);
      expect(rep.score).toBe(15);
      expect(rep.interactions).toBe(3);
      expect(rep.successRate).toBe('66.67%');
    });

    it('returns 0% rate when no interactions', () => {
      const created = identity.createIdentity('TestAgent');
      const rep = identity.getReputation(created.agentId);
      expect(rep.successRate).toBe('0%');
    });

    it('returns null for unknown agent', () => {
      expect(identity.getReputation('nonexistent')).toBeNull();
    });
  });

  describe('registerService', () => {
    it('registers a service for an agent', () => {
      const created = identity.createIdentity('TestAgent');
      const services = identity.registerService(created.agentId, {
        name: 'Data Analysis',
        description: 'Analyze data',
        price: 100,
        currency: 'USDC'
      });
      expect(services).toHaveLength(1);
      expect(services[0].name).toBe('Data Analysis');
      expect(services[0].price).toBe(100);
      expect(services[0].currency).toBe('USDC');
      expect(services[0].active).toBe(true);
      expect(services[0].id).toMatch(/^svc_/);
    });

    it('registers service with default values', () => {
      const created = identity.createIdentity('TestAgent');
      const services = identity.registerService(created.agentId, { name: 'Free Service' });
      expect(services[0].price).toBe(0);
      expect(services[0].currency).toBe('USDC');
    });

    it('appends to existing services array', () => {
      const created = identity.createIdentity('TestAgent');
      identity.registerService(created.agentId, { name: 'Svc1' });
      identity.registerService(created.agentId, { name: 'Svc2' });
      const services = identity.registerService(created.agentId, { name: 'Svc3' });
      expect(services).toHaveLength(3);
    });
  });

  describe('discoverServices', () => {
    it('discovers all services without filter', () => {
      const a1 = identity.createIdentity('Agent1');
      const a2 = identity.createIdentity('Agent2');
      identity.registerService(a1.agentId, { name: 'Data Analysis' });
      identity.registerService(a2.agentId, { name: 'Web Scraping' });
      const results = identity.discoverServices();
      expect(results).toHaveLength(2);
    });

    it('filters by capability', () => {
      const a1 = identity.createIdentity('Agent1');
      identity.registerService(a1.agentId, { name: 'Data Analysis' });
      identity.registerService(a1.agentId, { name: 'Web Scraping' });
      const results = identity.discoverServices('Data');
      expect(results).toHaveLength(1);
      expect(results[0].service.name).toBe('Data Analysis');
    });

    it('sorts by reputation score descending', () => {
      const a1 = identity.createIdentity('Agent1');
      const a2 = identity.createIdentity('Agent2');
      identity.registerService(a1.agentId, { name: 'Service' });
      identity.registerService(a2.agentId, { name: 'Service' });
      identity.updateReputation(a1.agentId, true);
      identity.updateReputation(a1.agentId, true);
      const results = identity.discoverServices();
      expect(results[0].reputation.score).toBe(20);
      expect(results[1].reputation.score).toBe(0);
    });

    it('skips agents without identity', () => {
      identity.registerService('nonexistent_agent', { name: 'Test' });
      const results = identity.discoverServices();
      expect(results).toHaveLength(0);
    });

    it('skips inactive services', () => {
      const a1 = identity.createIdentity('Agent1');
      identity.registerService(a1.agentId, { name: 'Active Service' });
      identity.serviceRegistry.get(a1.agentId)[0].active = false;
      const results = identity.discoverServices();
      expect(results).toHaveLength(0);
    });
  });

  describe('createAttestation', () => {
    it('creates a signed attestation', () => {
      const issuer = identity.createIdentity('Issuer');
      const result = identity.createAttestation(issuer.agentId, 'subject_123', { role: 'validator' });
      expect(result.id).toMatch(/^att_/);
      expect(result.issuer).toBe(issuer.agentId);
      expect(result.subject).toBe('subject_123');
      expect(result.claim).toEqual({ role: 'validator' });
      expect(result.signature).toMatch(/^[a-f0-9]+$/);
      expect(result.expiresAt).toBeGreaterThan(result.issuedAt);
    });

    it('throws if issuer not found', () => {
      expect(() => identity.createAttestation('nonexistent', 'subject_123', {})).toThrow('Issuer not found');
    });
  });

  describe('verifyAttestation', () => {
    it('verifies a valid attestation', () => {
      const issuer = identity.createIdentity('Issuer');
      const attestation = identity.createAttestation(issuer.agentId, 'subject_123', { role: 'validator' });
      const isValid = identity.verifyAttestation(attestation);
      expect(isValid).toBe(true);
    });

    it('returns false if issuer not found', () => {
      const attestation = {
        id: 'att_1',
        issuer: 'nonexistent',
        subject: 'sub',
        claim: {},
        issuedAt: Date.now(),
        expiresAt: Date.now() + 100000,
        signature: 'deadbeef'
      };
      expect(identity.verifyAttestation(attestation)).toBe(false);
    });

    it('returns false if expired', () => {
      const issuer = identity.createIdentity('Issuer');
      const attestation = identity.createAttestation(issuer.agentId, 'sub', {});
      attestation.expiresAt = Date.now() - 1000;
      expect(identity.verifyAttestation(attestation)).toBe(false);
    });
  });

  describe('exportIdentity', () => {
    it('exports without private key by default', () => {
      const created = identity.createIdentity('TestAgent');
      const exported = identity.exportIdentity(created.agentId);
      expect(exported.agentId).toBe(created.agentId);
      expect(exported.name).toBe('TestAgent');
      expect(exported.privateKey).toBeUndefined();
      expect(exported.reputation).toBeDefined();
    });

    it('exports with private key when requested', () => {
      const created = identity.createIdentity('TestAgent');
      const exported = identity.exportIdentity(created.agentId, true);
      expect(exported.privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    });

    it('throws for unknown agent', () => {
      expect(() => identity.exportIdentity('nonexistent')).toThrow('Identity not found');
    });
  });

  describe('importIdentity', () => {
    it('imports identity data', () => {
      const created = identity.createIdentity('Original');
      const exported = identity.exportIdentity(created.agentId, false);
      const imported = identity.importIdentity(exported);
      expect(imported.agentId).toBe(exported.agentId);
      expect(imported.name).toBe('Original');
    });

    it('initializes reputation when missing', () => {
      const imported = identity.importIdentity({
        agentId: 'new_agent',
        publicKey: 'key',
        name: 'New'
      });
      expect(imported.reputation).toEqual({
        score: 0,
        interactions: 0,
        successfulTasks: 0,
        failedTasks: 0
      });
    });

    it('stores private key as null when not provided', () => {
      identity.importIdentity({
        agentId: 'new_agent',
        publicKey: 'key',
        name: 'New'
      });
      const stored = identity.identityStore.get('new_agent');
      expect(stored.privateKey).toBeNull();
    });

    it('throws when agentId is missing', () => {
      expect(() => identity.importIdentity({ publicKey: 'key' })).toThrow('Invalid identity data');
    });

    it('throws when publicKey is missing', () => {
      expect(() => identity.importIdentity({ agentId: 'id' })).toThrow('Invalid identity data');
    });
  });

  describe('listIdentities', () => {
    it('returns empty array when no identities', () => {
      expect(identity.listIdentities()).toEqual([]);
    });

    it('returns all identities without private keys', () => {
      identity.createIdentity('Agent1');
      identity.createIdentity('Agent2');
      const list = identity.listIdentities();
      expect(list).toHaveLength(2);
      list.forEach((item) => {
        expect(item.privateKey).toBeUndefined();
        expect(item.agentId).toBeTruthy();
      });
    });
  });

  describe('deleteIdentity', () => {
    it('deletes identity and service registry entries', () => {
      const created = identity.createIdentity('TestAgent');
      identity.registerService(created.agentId, { name: 'Svc' });
      const result = identity.deleteIdentity(created.agentId);
      expect(result).toEqual({ success: true, agentId: created.agentId });
      expect(identity.identityStore.has(created.agentId)).toBe(false);
      expect(identity.serviceRegistry.has(created.agentId)).toBe(false);
    });

    it('handles deleting non-existent identity', () => {
      const result = identity.deleteIdentity('nonexistent');
      expect(result.success).toBe(true);
    });
  });

  describe('generateDid', () => {
    it('generates DID from public key hash', () => {
      const created = identity.createIdentity('TestAgent');
      const did = identity.generateDid(created.agentId);
      expect(did).toMatch(/^did:ultrawork:1:[a-f0-9]{32}$/);
    });

    it('uses configured chainId', () => {
      const custom = new OnChainIdentity({ chainId: 137 });
      const created = custom.createIdentity('TestAgent');
      const did = custom.generateDid(created.agentId);
      expect(did).toMatch(/^did:ultrawork:137:/);
    });

    it('throws for unknown agent', () => {
      expect(() => identity.generateDid('nonexistent')).toThrow('Identity not found');
    });
  });
});
