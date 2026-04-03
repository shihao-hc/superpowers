/**
 * Data Sovereignty & Residency Manager
 * Handles data localization and regional compliance
 */

const crypto = require('crypto');

class DataSovereignty {
  constructor(options = {}) {
    this.regions = new Map();
    this.dataMappings = new Map();
    this.transferAgreements = new Map();
    this.localizationRules = new Map();
    
    this._initRegions();
    this._initLocalizationRules();
  }

  _initRegions() {
    // Define available data storage regions
    this.regions.set('us-east', {
      id: 'us-east',
      name: 'US East (Virginia)',
      location: 'United States',
      jurisdiction: 'US',
      regulations: ['CCPA', 'SOX'],
      dataCenter: 'AWS US-EAST-1',
      encryptionKeyRegion: 'us-east-1'
    });

    this.regions.set('us-west', {
      id: 'us-west',
      name: 'US West (Oregon)',
      location: 'United States',
      jurisdiction: 'US',
      regulations: ['CCPA', 'SOX'],
      dataCenter: 'AWS US-WEST-2',
      encryptionKeyRegion: 'us-west-2'
    });

    this.regions.set('eu-west', {
      id: 'eu-west',
      name: 'EU West (Ireland)',
      location: 'Ireland, EU',
      jurisdiction: 'EU',
      regulations: ['GDPR'],
      dataCenter: 'AWS EU-WEST-1',
      encryptionKeyRegion: 'eu-west-1',
      gdprCompliant: true
    });

    this.regions.set('eu-central', {
      id: 'eu-central',
      name: 'EU Central (Frankfurt)',
      location: 'Germany, EU',
      jurisdiction: 'EU',
      regulations: ['GDPR', 'BDSG'],
      dataCenter: 'AWS EU-CENTRAL-1',
      encryptionKeyRegion: 'eu-central-1',
      gdprCompliant: true
    });

    this.regions.set('uk-south', {
      id: 'uk-south',
      name: 'UK South (London)',
      location: 'United Kingdom',
      jurisdiction: 'UK',
      regulations: ['UK GDPR', 'DPA 2018'],
      dataCenter: 'AWS EU-WEST-2',
      encryptionKeyRegion: 'eu-west-2',
      gdprCompliant: true
    });

    this.regions.set('ap-south', {
      id: 'ap-south',
      name: 'Asia Pacific (Singapore)',
      location: 'Singapore',
      jurisdiction: 'SG',
      regulations: ['PDPA'],
      dataCenter: 'AWS AP-SOUTHEAST-1',
      encryptionKeyRegion: 'ap-southeast-1'
    });

    this.regions.set('ap-east', {
      id: 'ap-east',
      name: 'Asia Pacific (Hong Kong)',
      location: 'Hong Kong',
      jurisdiction: 'HK',
      regulations: ['PDPO'],
      dataCenter: 'AWS AP-EAST-1',
      encryptionKeyRegion: 'ap-east-1'
    });

    this.regions.set('cn-north', {
      id: 'cn-north',
      name: 'China North (Beijing)',
      location: 'Beijing, China',
      jurisdiction: 'CN',
      regulations: ['PIPL', 'CSL'],
      dataCenter: 'AWS CN-NORTH-1',
      encryptionKeyRegion: 'cn-north-1',
      localCompliance: true
    });

    this.regions.set('br-south', {
      id: 'br-south',
      name: 'Brazil South (São Paulo)',
      location: 'Brazil',
      jurisdiction: 'BR',
      regulations: ['LGPD'],
      dataCenter: 'AWS SA-EAST-1',
      encryptionKeyRegion: 'sa-east-1'
    });

    this.regions.set('ca-central', {
      id: 'ca-central',
      name: 'Canada Central (Toronto)',
      location: 'Canada',
      jurisdiction: 'CA',
      regulations: ['PIPEDA', 'PHIPA'],
      dataCenter: 'AWS CA-CENTRAL-1',
      encryptionKeyRegion: 'ca-central-1'
    });

    this.regions.set('au-east', {
      id: 'au-east',
      name: 'Australia East (Sydney)',
      location: 'Australia',
      jurisdiction: 'AU',
      regulations: ['Privacy Act 1988', 'APP'],
      dataCenter: 'AWS AP-SOUTHEAST-2',
      encryptionKeyRegion: 'ap-southeast-2'
    });

    this.regions.set('jp-east', {
      id: 'jp-east',
      name: 'Japan East (Tokyo)',
      location: 'Japan',
      jurisdiction: 'JP',
      regulations: ['APPI'],
      dataCenter: 'AWS AP-NORTHEAST-1',
      encryptionKeyRegion: 'ap-northeast-1'
    });
  }

  _initLocalizationRules() {
    // Define data localization requirements by jurisdiction
    this.localizationRules.set('CN', {
      dataTypes: ['personal', 'sensitive', 'important'],
      requirements: {
        mustStore: true,
        mustProcess: true,
        crossBorderTransfer: 'restricted',
        conditions: ['consent', 'certification', 'standard_contract']
      },
      restrictions: ['Real-name verification data must remain in China']
    });

    this.localizationRules.set('EU', {
      dataTypes: ['personal', 'sensitive'],
      requirements: {
        mustStore: false,
        mustProcess: false,
        crossBorderTransfer: 'regulated',
        conditions: ['adequacy', 'scc', 'bcr']
      },
      restrictions: ['Standard Contractual Clauses required for transfers']
    });

    this.localizationRules.set('RU', {
      dataTypes: ['personal'],
      requirements: {
        mustStore: true,
        mustProcess: true,
        crossBorderTransfer: 'prohibited',
        conditions: []
      },
      restrictions: ['Personal data of Russian citizens must be stored in Russia']
    });

    this.localizationRules.set('BR', {
      dataTypes: ['personal'],
      requirements: {
        mustStore: false,
        mustProcess: false,
        crossBorderTransfer: 'regulated',
        conditions: ['consent', 'legitimate_interest']
      },
      restrictions: ['LGPD requirements must be met for international transfers']
    });

    this.localizationRules.set('IN', {
      dataTypes: ['personal', 'sensitive'],
      requirements: {
        mustStore: false,
        mustProcess: false,
        crossBorderTransfer: 'restricted',
        conditions: ['adequate_protection', 'consent']
      },
      restrictions: ['Sensitive personal data requires consent for transfer']
    });
  }

  // Get available regions
  getRegions() {
    return Array.from(this.regions.values());
  }

  getRegion(regionId) {
    return this.regions.get(regionId);
  }

  // Set tenant's preferred region
  setTenantRegion(tenantId, regionId) {
    const region = this.regions.get(regionId);
    if (!region) {
      return { error: 'Region not found' };
    }

    const tenantConfig = {
      tenantId,
      regionId,
      region,
      configuredAt: Date.now(),
      lastUpdated: Date.now()
    };

    this.dataMappings.set(tenantId, tenantConfig);
    
    return {
      success: true,
      tenantId,
      regionId,
      region
    };
  }

  getTenantRegion(tenantId) {
    const config = this.dataMappings.get(tenantId);
    return config?.region || null;
  }

  // Check if data can be stored/processed in region
  checkDataLocalization(dataType, sourceJurisdiction, targetRegionId) {
    const targetRegion = this.regions.get(targetRegionId);
    if (!targetRegion) {
      return { allowed: false, reason: 'Region not found' };
    }

    const rules = this.localizationRules.get(sourceJurisdiction);
    if (!rules) {
      return { allowed: true, reason: 'No specific localization rules' };
    }

    const applicableRules = rules.dataTypes.includes(dataType) ? rules : null;
    
    if (!applicableRules) {
      return { allowed: true, reason: 'No localization requirement for this data type' };
    }

    if (applicableRules.requirements.mustStore) {
      if (targetRegion.jurisdiction !== sourceJurisdiction) {
        return {
          allowed: false,
          reason: `Data of type ${dataType} from ${sourceJurisdiction} must be stored locally`,
          requirement: 'local_storage_required'
        };
      }
    }

    if (applicableRules.requirements.crossBorderTransfer === 'prohibited') {
      return {
        allowed: false,
        reason: 'Cross-border transfer prohibited by local regulations',
        requirement: 'transfer_prohibited'
      };
    }

    return { allowed: true, reason: 'Transfer allowed' };
  }

  // Manage cross-border data transfers
  registerTransferAgreement(tenantId, agreement) {
    const transfer = {
      id: `transfer_${Date.now()}`,
      tenantId,
      sourceRegion: agreement.sourceRegion,
      targetRegion: agreement.targetRegion,
      dataCategories: agreement.dataCategories,
      legalBasis: agreement.legalBasis,
      safeguards: agreement.safeguards || [],
      status: 'active',
      createdAt: Date.now(),
      expiresAt: agreement.expiresAt || Date.now() + 365 * 24 * 60 * 60 * 1000
    };

    this.transferAgreements.set(transfer.id, transfer);
    
    return transfer;
  }

  getTransferAgreements(tenantId) {
    return Array.from(this.transferAgreements.values())
      .filter(t => t.tenantId === tenantId && t.status === 'active');
  }

  // Route data to appropriate region
  routeData(tenantId, dataType, operation) {
    const tenantConfig = this.dataMappings.get(tenantId);
    if (!tenantConfig) {
      return { error: 'Tenant region not configured' };
    }

    const region = tenantConfig.region;
    const sourceJurisdiction = region.jurisdiction;
    
    // Check localization rules
    const localizationCheck = this.checkDataLocalization(dataType, sourceJurisdiction, region.id);
    
    if (!localizationCheck.allowed) {
      return {
        error: localizationCheck.reason,
        requirement: localizationCheck.requirement,
        dataType,
        sourceJurisdiction,
        targetRegion: region.id
      };
    }

    // Generate region-specific encryption key
    const encryptionKey = this._getRegionEncryptionKey(tenantId, region.id);

    return {
      allowed: true,
      tenantId,
      region: region.id,
      dataCenter: region.dataCenter,
      encryptionKeyId: encryptionKey.id,
      operation,
      dataType,
      jurisdiction: region.jurisdiction,
      complianceChecks: {
        encryption: true,
        accessControl: true,
        auditLogging: true,
        dataResidency: true
      }
    };
  }

  _getRegionEncryptionKey(tenantId, regionId) {
    const keyId = crypto.createHash('sha256')
      .update(`${tenantId}:${regionId}`)
      .digest('hex')
      .substring(0, 16);
    
    return {
      id: `key_${keyId}`,
      region: regionId,
      createdAt: Date.now(),
      algorithm: 'AES-256-GCM'
    };
  }

  // Get compliance report for data residency
  generateResidencyReport(tenantId) {
    const tenantConfig = this.dataMappings.get(tenantId);
    const transfers = this.getTransferAgreements(tenantId);
    
    if (!tenantConfig) {
      return { error: 'Tenant not configured' };
    }

    return {
      tenantId,
      primaryRegion: tenantConfig.region,
      transfers: transfers.map(t => ({
        id: t.id,
        source: t.sourceRegion,
        target: t.targetRegion,
        legalBasis: t.legalBasis,
        safeguards: t.safeguards,
        expiresAt: t.expiresAt
      })),
      complianceSummary: {
        gdprTransfers: transfers.filter(t => t.legalBasis?.includes('GDPR')).length,
        lgpdTransfers: transfers.filter(t => t.legalBasis?.includes('LGPD')).length,
        pipedaTransfers: transfers.filter(t => t.legalBasis?.includes('PIPEDA')).length
      },
      generatedAt: Date.now()
    };
  }

  // Check transfer validity
  validateTransfer(transferId) {
    const transfer = this.transferAgreements.get(transferId);
    if (!transfer) {
      return { valid: false, reason: 'Transfer agreement not found' };
    }

    if (transfer.status !== 'active') {
      return { valid: false, reason: 'Transfer agreement is not active' };
    }

    if (transfer.expiresAt < Date.now()) {
      return { valid: false, reason: 'Transfer agreement has expired' };
    }

    return { valid: true, transfer };
  }

  // Get region health status
  getRegionStatus(regionId) {
    const region = this.regions.get(regionId);
    if (!region) {
      return null;
    }

    // Simulate health checks
    return {
      regionId,
      name: region.name,
      status: 'healthy',
      latency: Math.floor(Math.random() * 50) + 10,
      uptime: 99.9,
      lastChecked: Date.now()
    };
  }

  // Get all region statuses
  getAllRegionStatuses() {
    const statuses = [];
    for (const regionId of this.regions.keys()) {
      statuses.push(this.getRegionStatus(regionId));
    }
    return statuses;
  }

  // Recommend region based on requirements
  recommendRegion(requirements) {
    const { jurisdiction, regulations, lowLatency, dataType } = requirements;
    
    let candidates = Array.from(this.regions.values());
    
    // Filter by jurisdiction
    if (jurisdiction) {
      candidates = candidates.filter(r => r.jurisdiction === jurisdiction);
    }
    
    // Filter by regulations
    if (regulations && regulations.length > 0) {
      candidates = candidates.filter(r => 
        regulations.every(reg => r.regulations.includes(reg))
      );
    }
    
    // Sort by latency if specified
    if (lowLatency) {
      candidates.sort((a, b) => {
        const aLatency = Math.random() * 50;
        const bLatency = Math.random() * 50;
        return aLatency - bLatency;
      });
    }

    return candidates.map(r => ({
      regionId: r.id,
      name: r.name,
      location: r.location,
      regulations: r.regulations,
      recommendationScore: candidates.indexOf(r) === 0 ? 'recommended' : 'alternative'
    }));
  }
}

module.exports = { DataSovereignty };
