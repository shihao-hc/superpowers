const crypto = require('crypto');

class OnChainIdentity {
  constructor(options = {}) {
    this.chainId = options.chainId || 1;
    this.rpcUrl = options.rpcUrl || 'https://mainnet.infura.io/v3/YOUR_KEY';
    this.identityStore = new Map();
    this.reputationStore = new Map();
    this.serviceRegistry = new Map();
  }

  generateAgentId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(16).toString('hex');
    return `agent_${timestamp}_${random}`;
  }

  createIdentity(agentName, metadata = {}) {
    const agentId = this.generateAgentId();
    const keyPair = crypto.generateKeyPairSync('ec', {
      namedCurve: 'secp256k1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const identity = {
      agentId,
      name: agentName,
      publicKey: keyPair.publicKey,
      createdAt: Date.now(),
      metadata: {
        version: '1.0',
        capabilities: metadata.capabilities || [],
        owner: metadata.owner || null,
        description: metadata.description || '',
        ...metadata
      },
      reputation: {
        score: 0,
        interactions: 0,
        successfulTasks: 0,
        failedTasks: 0
      }
    };

    this.identityStore.set(agentId, {
      ...identity,
      privateKey: keyPair.privateKey
    });

    return {
      agentId,
      name: identity.name,
      publicKey: identity.publicKey,
      createdAt: identity.createdAt,
      metadata: identity.metadata
    };
  }

  getIdentity(agentId) {
    const identity = this.identityStore.get(agentId);
    if (!identity) return null;

    return {
      agentId: identity.agentId,
      name: identity.name,
      publicKey: identity.publicKey,
      createdAt: identity.createdAt,
      metadata: identity.metadata,
      reputation: identity.reputation
    };
  }

  signMessage(agentId, message) {
    const identity = this.identityStore.get(agentId);
    if (!identity) throw new Error('Identity not found');

    const sign = crypto.createSign('SHA256');
    sign.update(typeof message === 'string' ? message : JSON.stringify(message));
    return sign.sign(identity.privateKey, 'hex');
  }

  verifySignature(publicKey, message, signature) {
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(typeof message === 'string' ? message : JSON.stringify(message));
      return verify.verify(publicKey, signature, 'hex');
    } catch (e) {
      return false;
    }
  }

  updateReputation(agentId, success, taskType = 'general') {
    const identity = this.identityStore.get(agentId);
    if (!identity) throw new Error('Identity not found');

    identity.reputation.interactions++;

    if (success) {
      identity.reputation.successfulTasks++;
      identity.reputation.score += 10;
    } else {
      identity.reputation.failedTasks++;
      identity.reputation.score = Math.max(0, identity.reputation.score - 5);
    }

    return identity.reputation;
  }

  getReputation(agentId) {
    const identity = this.identityStore.get(agentId);
    if (!identity) return null;

    return {
      ...identity.reputation,
      successRate: identity.reputation.interactions > 0
        ? (identity.reputation.successfulTasks / identity.reputation.interactions * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  registerService(agentId, service) {
    if (!this.serviceRegistry.has(agentId)) {
      this.serviceRegistry.set(agentId, []);
    }

    const services = this.serviceRegistry.get(agentId);
    services.push({
      id: `svc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: service.name,
      description: service.description,
      price: service.price || 0,
      currency: service.currency || 'USDC',
      registeredAt: Date.now(),
      active: true
    });

    return services;
  }

  discoverServices(capability) {
    const results = [];

    for (const [agentId, services] of this.serviceRegistry) {
      const identity = this.getIdentity(agentId);
      if (!identity) continue;

      for (const svc of services) {
        if (svc.active && (!capability || svc.name.includes(capability))) {
          results.push({
            agentId,
            agentName: identity.name,
            reputation: this.getReputation(agentId),
            service: svc
          });
        }
      }
    }

    return results.sort((a, b) => {
      const scoreA = a.reputation?.score || 0;
      const scoreB = b.reputation?.score || 0;
      return scoreB - scoreA;
    });
  }

  createAttestation(issuerId, subjectId, claim) {
    const issuer = this.identityStore.get(issuerId);
    if (!issuer) throw new Error('Issuer not found');

    const attestation = {
      id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      issuer: issuerId,
      subject: subjectId,
      claim,
      issuedAt: Date.now(),
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
      signature: this.signMessage(issuerId, { subject: subjectId, claim })
    };

    return attestation;
  }

  verifyAttestation(attestation) {
    const issuer = this.getIdentity(attestation.issuer);
    if (!issuer) return false;

    if (Date.now() > attestation.expiresAt) return false;

    return this.verifySignature(
      issuer.publicKey,
      { subject: attestation.subject, claim: attestation.claim },
      attestation.signature
    );
  }

  exportIdentity(agentId, includePrivate = false) {
    const identity = this.identityStore.get(agentId);
    if (!identity) throw new Error('Identity not found');

    const exported = {
      agentId: identity.agentId,
      name: identity.name,
      publicKey: identity.publicKey,
      createdAt: identity.createdAt,
      metadata: identity.metadata,
      reputation: identity.reputation
    };

    if (includePrivate) {
      exported.privateKey = identity.privateKey;
    }

    return exported;
  }

  importIdentity(data) {
    if (!data.agentId || !data.publicKey) {
      throw new Error('Invalid identity data');
    }

    this.identityStore.set(data.agentId, {
      ...data,
      privateKey: data.privateKey || null,
      reputation: data.reputation || { score: 0, interactions: 0, successfulTasks: 0, failedTasks: 0 }
    });

    return this.getIdentity(data.agentId);
  }

  listIdentities() {
    const result = [];
    for (const [agentId] of this.identityStore) {
      result.push(this.getIdentity(agentId));
    }
    return result;
  }

  deleteIdentity(agentId) {
    this.identityStore.delete(agentId);
    this.serviceRegistry.delete(agentId);
    return { success: true, agentId };
  }

  generateDid(agentId) {
    const identity = this.getIdentity(agentId);
    if (!identity) throw new Error('Identity not found');

    const publicKeyHash = crypto
      .createHash('sha256')
      .update(identity.publicKey)
      .digest('hex')
      .substring(0, 32);

    return `did:ultrawork:${this.chainId}:${publicKeyHash}`;
  }
}

module.exports = { OnChainIdentity };
