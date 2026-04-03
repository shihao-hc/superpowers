const crypto = require('crypto');

class AttestationService {
  constructor(options = {}) {
    this.identity = options.identity || null;
    this.store = new Map();
    this.chainId = options.chainId || 1;
  }

  createAttestation(data, metadata = {}) {
    const attestationId = `att_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');

    const attestation = {
      id: attestationId,
      data,
      hash,
      metadata: {
        ...metadata,
        createdAt: Date.now(),
        chainId: this.chainId,
        version: '1.0'
      },
      signature: null,
      issuer: metadata.issuer || null
    };

    if (this.identity) {
      try {
        attestation.signature = this.identity.signMessage(
          metadata.issuer || 'system',
          { id: attestationId, hash, timestamp: attestation.metadata.createdAt }
        );
        attestation.issuer = metadata.issuer || 'system';
      } catch (e) {
        console.warn('[Attestation] Signing failed:', e.message);
      }
    }

    this.store.set(attestationId, attestation);

    return {
      id: attestationId,
      hash,
      metadata: attestation.metadata,
      signature: attestation.signature
    };
  }

  verifyAttestation(attestationId) {
    const attestation = this.store.get(attestationId);
    if (!attestation) {
      return { valid: false, error: 'Attestation not found' };
    }

    const currentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(attestation.data))
      .digest('hex');

    if (currentHash !== attestation.hash) {
      return { valid: false, error: 'Data integrity check failed' };
    }

    if (attestation.signature && this.identity) {
      const issuer = this.identity.getIdentity(attestation.issuer);
      if (issuer) {
        const sigValid = this.identity.verifySignature(
          issuer.publicKey,
          { id: attestation.id, hash: attestation.hash, timestamp: attestation.metadata.createdAt },
          attestation.signature
        );

        if (!sigValid) {
          return { valid: false, error: 'Signature verification failed' };
        }
      }
    }

    return {
      valid: true,
      attestation: {
        id: attestation.id,
        hash: attestation.hash,
        metadata: attestation.metadata,
        verifiedAt: Date.now()
      }
    };
  }

  getAttestation(attestationId) {
    return this.store.get(attestationId) || null;
  }

  queryAttestations(filter = {}) {
    const results = [];

    for (const [id, attestation] of this.store) {
      let match = true;

      if (filter.issuer && attestation.issuer !== filter.issuer) {
        match = false;
      }

      if (filter.after && attestation.metadata.createdAt < filter.after) {
        match = false;
      }

      if (filter.before && attestation.metadata.createdAt > filter.before) {
        match = false;
      }

      if (match) {
        results.push({
          id: attestation.id,
          hash: attestation.hash,
          metadata: attestation.metadata
        });
      }
    }

    return results.sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);
  }

  createTaskAttestation(taskResult) {
    return this.createAttestation({
      type: 'task_result',
      taskId: taskResult.id,
      status: taskResult.status,
      result: taskResult.result,
      duration: taskResult.duration,
      timestamp: Date.now()
    }, {
      issuer: 'task_executor',
      description: 'Agent task execution result'
    });
  }

  createDataAttestation(data, description) {
    return this.createAttestation({
      type: 'data_record',
      data,
      timestamp: Date.now()
    }, {
      description
    });
  }

  generateMerkleRoot(attestationIds) {
    if (attestationIds.length === 0) return null;

    const hashes = attestationIds.map(id => {
      const att = this.store.get(id);
      return att ? att.hash : null;
    }).filter(Boolean);

    if (hashes.length === 0) return null;

    let level = hashes;
    while (level.length > 1) {
      const nextLevel = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] || left;
        const combined = crypto
          .createHash('sha256')
          .update(left + right)
          .digest('hex');
        nextLevel.push(combined);
      }
      level = nextLevel;
    }

    return level[0];
  }

  exportAttestation(attestationId) {
    const attestation = this.store.get(attestationId);
    if (!attestation) return null;

    return JSON.stringify(attestation, null, 2);
  }

  importAttestation(jsonString) {
    try {
      const attestation = JSON.parse(jsonString);
      if (!attestation.id || !attestation.hash) {
        throw new Error('Invalid attestation format');
      }

      if (attestation.data) {
        const crypto = require('crypto');
        const computedHash = crypto
          .createHash('sha256')
          .update(JSON.stringify(attestation.data))
          .digest('hex');

        if (computedHash !== attestation.hash) {
          throw new Error('Hash verification failed - data integrity compromised');
        }
      }

      this.store.set(attestation.id, attestation);
      return attestation.id;
    } catch (e) {
      throw new Error('Failed to import attestation: ' + e.message);
    }
  }

  getStats() {
    return {
      total: this.store.size,
      signed: Array.from(this.store.values()).filter(a => a.signature).length,
      chainId: this.chainId
    };
  }
}

module.exports = { AttestationService };
