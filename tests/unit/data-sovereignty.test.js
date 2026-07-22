const { DataSovereignty } = require('../../src/compliance/DataSovereignty');

describe('DataSovereignty', () => {
  let ds;

  beforeEach(() => {
    ds = new DataSovereignty();
  });

  describe('constructor', () => {
    it('initializes regions Map with 12 entries', () => {
      expect(ds.regions).toBeInstanceOf(Map);
      expect(ds.regions.size).toBe(12);
    });

    it('initializes dataMappings as empty Map', () => {
      expect(ds.dataMappings).toBeInstanceOf(Map);
      expect(ds.dataMappings.size).toBe(0);
    });

    it('initializes transferAgreements as empty Map', () => {
      expect(ds.transferAgreements).toBeInstanceOf(Map);
      expect(ds.transferAgreements.size).toBe(0);
    });

    it('initializes localizationRules Map with 5 entries', () => {
      expect(ds.localizationRules).toBeInstanceOf(Map);
      expect(ds.localizationRules.size).toBe(5);
    });

    it('calls _initRegions and _initLocalizationRules', () => {
      const initRegionsSpy = jest.spyOn(DataSovereignty.prototype, '_initRegions');
      const initLocSpy = jest.spyOn(DataSovereignty.prototype, '_initLocalizationRules');
      new DataSovereignty();
      expect(initRegionsSpy).toHaveBeenCalled();
      expect(initLocSpy).toHaveBeenCalled();
      initRegionsSpy.mockRestore();
      initLocSpy.mockRestore();
    });
  });

  describe('getRegions', () => {
    it('returns all 12 regions as an array', () => {
      const regions = ds.getRegions();
      expect(regions).toBeInstanceOf(Array);
      expect(regions).toHaveLength(12);
    });

    it('each region has required properties', () => {
      const regions = ds.getRegions();
      regions.forEach(r => {
        expect(r).toHaveProperty('id');
        expect(r).toHaveProperty('name');
        expect(r).toHaveProperty('location');
        expect(r).toHaveProperty('jurisdiction');
        expect(r).toHaveProperty('regulations');
        expect(r).toHaveProperty('dataCenter');
        expect(r).toHaveProperty('encryptionKeyRegion');
      });
    });

    it('returns region objects (not Map)', () => {
      const regions = ds.getRegions();
      expect(Array.isArray(regions)).toBe(true);
      expect(regions[0]).toEqual(expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String)
      }));
    });
  });

  describe('getRegion', () => {
    it('returns region for valid regionId', () => {
      const region = ds.getRegion('eu-west');
      expect(region).toBeDefined();
      expect(region.id).toBe('eu-west');
      expect(region.jurisdiction).toBe('EU');
      expect(region.regulations).toContain('GDPR');
      expect(region.gdprCompliant).toBe(true);
    });

    it('returns undefined for unknown regionId', () => {
      expect(ds.getRegion('nonexistent')).toBeUndefined();
    });

    it('returns region with CN jurisdiction for cn-north', () => {
      const region = ds.getRegion('cn-north');
      expect(region.jurisdiction).toBe('CN');
      expect(region.regulations).toContain('PIPL');
      expect(region.localCompliance).toBe(true);
    });

    it('returns correct regions for each jurisdiction', () => {
      expect(ds.getRegion('us-east').jurisdiction).toBe('US');
      expect(ds.getRegion('eu-central').jurisdiction).toBe('EU');
      expect(ds.getRegion('br-south').jurisdiction).toBe('BR');
      expect(ds.getRegion('jp-east').jurisdiction).toBe('JP');
    });
  });

  describe('setTenantRegion', () => {
    it('sets and returns success with region info', () => {
      const result = ds.setTenantRegion('tenant1', 'eu-west');
      expect(result.success).toBe(true);
      expect(result.tenantId).toBe('tenant1');
      expect(result.regionId).toBe('eu-west');
      expect(result.region.id).toBe('eu-west');
      expect(ds.dataMappings.has('tenant1')).toBe(true);
    });

    it('returns error for unknown region', () => {
      const result = ds.setTenantRegion('tenant1', 'nonexistent');
      expect(result.error).toBe('Region not found');
      expect(ds.dataMappings.has('tenant1')).toBe(false);
    });

    it('overwrites existing tenant configuration', () => {
      ds.setTenantRegion('tenant1', 'eu-west');
      ds.setTenantRegion('tenant1', 'us-east');
      expect(ds.dataMappings.get('tenant1').regionId).toBe('us-east');
    });
  });

  describe('getTenantRegion', () => {
    it('returns region after tenant is configured', () => {
      ds.setTenantRegion('tenant1', 'ap-south');
      const region = ds.getTenantRegion('tenant1');
      expect(region).toBeDefined();
      expect(region.id).toBe('ap-south');
    });

    it('returns null for unconfigured tenant', () => {
      expect(ds.getTenantRegion('unknown')).toBeNull();
    });

    it('returns null before any configuration', () => {
      expect(ds.getTenantRegion('tenant1')).toBeNull();
    });
  });

  describe('checkDataLocalization', () => {
    it('blocks CN personal data from being stored outside CN', () => {
      const result = ds.checkDataLocalization('personal', 'CN', 'us-east');
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/must be stored locally/);
      expect(result.requirement).toBe('local_storage_required');
    });

    it('allows CN personal data within CN region', () => {
      const result = ds.checkDataLocalization('personal', 'CN', 'cn-north');
      expect(result.allowed).toBe(true);
    });

    it('blocks RU personal data with local_storage_required (mustStore fires first)', () => {
      const result = ds.checkDataLocalization('personal', 'RU', 'us-east');
      expect(result.allowed).toBe(false);
      expect(result.requirement).toBe('local_storage_required');
    });

    it('allows data when source jurisdiction has no rules', () => {
      const result = ds.checkDataLocalization('personal', 'XX', 'us-east');
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('No specific localization rules');
    });

    it('allows data type not covered by jurisdiction rules', () => {
      const result = ds.checkDataLocalization('public', 'CN', 'us-east');
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('No localization requirement for this data type');
    });

    it('allows EU personal data in non-EU region (regulated but not blocked)', () => {
      const result = ds.checkDataLocalization('personal', 'EU', 'us-east');
      expect(result.allowed).toBe(true);
    });

    it('blocks CN sensitive data outside CN', () => {
      const result = ds.checkDataLocalization('sensitive', 'CN', 'eu-west');
      expect(result.allowed).toBe(false);
    });

    it('blocks CN important data outside CN', () => {
      const result = ds.checkDataLocalization('important', 'CN', 'eu-west');
      expect(result.allowed).toBe(false);
    });

    it('returns not allowed for unknown target region', () => {
      const result = ds.checkDataLocalization('personal', 'CN', 'nowhere');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Region not found');
    });

    it('allows BR personal data in non-BR region (regulated not restricted)', () => {
      const result = ds.checkDataLocalization('personal', 'BR', 'us-east');
      expect(result.allowed).toBe(true);
    });

    it('blocks transfer when crossBorderTransfer is prohibited via custom rule', () => {
      ds.localizationRules.set('TEST', {
        dataTypes: ['personal'],
        requirements: { mustStore: false, mustProcess: false, crossBorderTransfer: 'prohibited', conditions: [] },
        restrictions: []
      });
      const result = ds.checkDataLocalization('personal', 'TEST', 'us-east');
      expect(result.allowed).toBe(false);
      expect(result.requirement).toBe('transfer_prohibited');
    });
  });

  describe('registerTransferAgreement', () => {
    it('creates transfer with transfer_ prefix ID', () => {
      const agreement = {
        sourceRegion: 'eu-west',
        targetRegion: 'us-east',
        dataCategories: ['personal'],
        legalBasis: 'GDPR SCC',
        safeguards: ['encryption', 'audit']
      };
      const transfer = ds.registerTransferAgreement('tenant1', agreement);
      expect(transfer.id).toMatch(/^transfer_/);
      expect(transfer.tenantId).toBe('tenant1');
      expect(transfer.sourceRegion).toBe('eu-west');
      expect(transfer.targetRegion).toBe('us-east');
      expect(transfer.status).toBe('active');
    });

    it('stores transfer in transferAgreements Map', () => {
      const agreement = {
        sourceRegion: 'eu-west',
        targetRegion: 'us-east',
        dataCategories: ['personal'],
        legalBasis: 'GDPR SCC'
      };
      const transfer = ds.registerTransferAgreement('tenant1', agreement);
      expect(ds.transferAgreements.get(transfer.id)).toEqual(transfer);
    });

    it('sets default safeguards to empty array if not provided', () => {
      const agreement = {
        sourceRegion: 'eu-west',
        targetRegion: 'us-east',
        dataCategories: ['personal'],
        legalBasis: 'SCC'
      };
      const transfer = ds.registerTransferAgreement('tenant1', agreement);
      expect(transfer.safeguards).toEqual([]);
    });

    it('sets default expiry to 1 year from now', () => {
      const before = Date.now();
      const agreement = { sourceRegion: 'eu-west', targetRegion: 'us-east', dataCategories: ['personal'], legalBasis: 'SCC' };
      const transfer = ds.registerTransferAgreement('tenant1', agreement);
      expect(transfer.expiresAt).toBeGreaterThanOrEqual(before + 365 * 24 * 60 * 60 * 1000 - 100);
    });

    it('accepts custom expiresAt', () => {
      const future = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const agreement = { sourceRegion: 'eu-west', targetRegion: 'us-east', dataCategories: ['personal'], legalBasis: 'SCC', expiresAt: future };
      const transfer = ds.registerTransferAgreement('tenant1', agreement);
      expect(transfer.expiresAt).toBe(future);
    });
  });

  describe('getTransferAgreements', () => {
    it('returns active transfers for tenant', () => {
      jest.useFakeTimers();
      ds.registerTransferAgreement('tenant1', { sourceRegion: 'eu-west', targetRegion: 'us-east', dataCategories: ['personal'], legalBasis: 'GDPR SCC' });
      jest.advanceTimersByTime(5);
      ds.registerTransferAgreement('tenant1', { sourceRegion: 'eu-central', targetRegion: 'ap-south', dataCategories: ['sensitive'], legalBasis: 'BCR' });
      jest.useRealTimers();
      const transfers = ds.getTransferAgreements('tenant1');
      expect(transfers).toHaveLength(2);
    });

    it('returns empty array for tenant with no transfers', () => {
      const transfers = ds.getTransferAgreements('tenant1');
      expect(transfers).toEqual([]);
    });

    it('does not return transfers belonging to other tenants', () => {
      ds.registerTransferAgreement('tenant1', { sourceRegion: 'eu-west', targetRegion: 'us-east', dataCategories: ['personal'], legalBasis: 'SCC' });
      const transfers = ds.getTransferAgreements('tenant2');
      expect(transfers).toHaveLength(0);
    });

    it('only returns active transfers', () => {
      const transfer = ds.registerTransferAgreement('tenant1', { sourceRegion: 'eu-west', targetRegion: 'us-east', dataCategories: ['personal'], legalBasis: 'SCC' });
      ds.transferAgreements.get(transfer.id).status = 'inactive';
      const transfers = ds.getTransferAgreements('tenant1');
      expect(transfers).toHaveLength(0);
    });
  });

  describe('validateTransfer', () => {
    it('returns valid for active transfer', () => {
      const transfer = ds.registerTransferAgreement('tenant1', { sourceRegion: 'eu-west', targetRegion: 'us-east', dataCategories: ['personal'], legalBasis: 'SCC' });
      const result = ds.validateTransfer(transfer.id);
      expect(result.valid).toBe(true);
      expect(result.transfer).toBeDefined();
    });

    it('returns invalid for unknown transferId', () => {
      const result = ds.validateTransfer('transfer_nonexistent');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Transfer agreement not found');
    });

    it('returns invalid for non-active transfer', () => {
      const transfer = ds.registerTransferAgreement('tenant1', { sourceRegion: 'eu-west', targetRegion: 'us-east', dataCategories: ['personal'], legalBasis: 'SCC' });
      ds.transferAgreements.get(transfer.id).status = 'revoked';
      const result = ds.validateTransfer(transfer.id);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Transfer agreement is not active');
    });

    it('returns invalid for expired transfer', () => {
      const transfer = ds.registerTransferAgreement('tenant1', { sourceRegion: 'eu-west', targetRegion: 'us-east', dataCategories: ['personal'], legalBasis: 'SCC' });
      ds.transferAgreements.get(transfer.id).expiresAt = Date.now() - 1000;
      const result = ds.validateTransfer(transfer.id);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Transfer agreement has expired');
    });
  });

  describe('routeData', () => {
    it('returns error when tenant region not configured', () => {
      const result = ds.routeData('unknown', 'personal', 'read');
      expect(result.error).toBe('Tenant region not configured');
    });

    it('returns allowed response for configured tenant', () => {
      ds.setTenantRegion('tenant1', 'eu-west');
      const result = ds.routeData('tenant1', 'personal', 'read');
      expect(result.allowed).toBe(true);
      expect(result.tenantId).toBe('tenant1');
      expect(result.region).toBe('eu-west');
      expect(result.dataCenter).toBe('AWS EU-WEST-1');
      expect(result.operation).toBe('read');
      expect(result.dataType).toBe('personal');
      expect(result.complianceChecks).toEqual({
        encryption: true,
        accessControl: true,
        auditLogging: true,
        dataResidency: true
      });
    });

    it('returns error with requirement when localization check fails', () => {
      ds.setTenantRegion('tenant1', 'us-east');
      jest.spyOn(ds, 'checkDataLocalization').mockReturnValue({
        allowed: false, reason: 'Local storage required', requirement: 'local_storage_required',
        dataType: 'personal', sourceJurisdiction: 'CN', targetRegion: 'us-east'
      });
      const result = ds.routeData('tenant1', 'personal', 'read');
      expect(result.error).toBe('Local storage required');
      expect(result.requirement).toBe('local_storage_required');
      expect(result.targetRegion).toBe('us-east');
    });

    it('includes encryption key ID in response', () => {
      ds.setTenantRegion('tenant1', 'eu-west');
      const result = ds.routeData('tenant1', 'personal', 'write');
      expect(result.encryptionKeyId).toMatch(/^key_/);
    });
  });

  describe('_getRegionEncryptionKey', () => {
    it('returns key with key_ prefix', () => {
      const key = ds._getRegionEncryptionKey('tenant1', 'eu-west');
      expect(key.id).toMatch(/^key_/);
    });

    it('uses AES-256-GCM algorithm', () => {
      const key = ds._getRegionEncryptionKey('tenant1', 'eu-west');
      expect(key.algorithm).toBe('AES-256-GCM');
    });

    it('returns deterministic key for same tenantId and regionId', () => {
      const key1 = ds._getRegionEncryptionKey('tenant1', 'eu-west');
      const key2 = ds._getRegionEncryptionKey('tenant1', 'eu-west');
      expect(key1.id).toBe(key2.id);
    });

    it('returns different keys for different tenantId or regionId', () => {
      const key1 = ds._getRegionEncryptionKey('tenant1', 'eu-west');
      const key2 = ds._getRegionEncryptionKey('tenant2', 'eu-west');
      const key3 = ds._getRegionEncryptionKey('tenant1', 'us-east');
      expect(key1.id).not.toBe(key2.id);
      expect(key1.id).not.toBe(key3.id);
    });

    it('includes region in response', () => {
      const key = ds._getRegionEncryptionKey('tenant1', 'eu-west');
      expect(key.region).toBe('eu-west');
    });
  });

  describe('generateResidencyReport', () => {
    it('returns error for unconfigured tenant', () => {
      const report = ds.generateResidencyReport('unknown');
      expect(report.error).toBe('Tenant not configured');
    });

    it('returns report with region info for configured tenant', () => {
      ds.setTenantRegion('tenant1', 'eu-west');
      const report = ds.generateResidencyReport('tenant1');
      expect(report.tenantId).toBe('tenant1');
      expect(report.primaryRegion).toBeDefined();
      expect(report.primaryRegion.id).toBe('eu-west');
      expect(report.transfers).toBeInstanceOf(Array);
      expect(report.complianceSummary).toBeDefined();
      expect(report.complianceSummary).toHaveProperty('gdprTransfers');
      expect(report.complianceSummary).toHaveProperty('lgpdTransfers');
      expect(report.complianceSummary).toHaveProperty('pipedaTransfers');
    });

    it('includes transfers in report', () => {
      ds.setTenantRegion('tenant1', 'eu-west');
      ds.registerTransferAgreement('tenant1', { sourceRegion: 'eu-west', targetRegion: 'us-east', dataCategories: ['personal'], legalBasis: 'GDPR SCC' });
      const report = ds.generateResidencyReport('tenant1');
      expect(report.transfers).toHaveLength(1);
      expect(report.transfers[0].source).toBe('eu-west');
      expect(report.transfers[0].target).toBe('us-east');
    });

    it('counts GDPR transfers in compliance summary', () => {
      ds.setTenantRegion('tenant1', 'eu-west');
      ds.registerTransferAgreement('tenant1', { sourceRegion: 'eu-west', targetRegion: 'us-east', dataCategories: ['personal'], legalBasis: 'GDPR SCC' });
      const report = ds.generateResidencyReport('tenant1');
      expect(report.complianceSummary.gdprTransfers).toBe(1);
    });
  });

  describe('getRegionStatus', () => {
    it('returns healthy status for valid region', () => {
      const status = ds.getRegionStatus('eu-west');
      expect(status).not.toBeNull();
      expect(status.regionId).toBe('eu-west');
      expect(status.status).toBe('healthy');
      expect(status.uptime).toBe(99.9);
    });

    it('returns null for unknown region', () => {
      expect(ds.getRegionStatus('nowhere')).toBeNull();
    });

    it('includes latency and lastChecked timestamp', () => {
      const status = ds.getRegionStatus('us-east');
      expect(status.latency).toBeGreaterThanOrEqual(10);
      expect(status.latency).toBeLessThanOrEqual(60);
      expect(status.lastChecked).toBeGreaterThan(0);
    });
  });

  describe('getAllRegionStatuses', () => {
    it('returns statuses for all 12 regions', () => {
      const statuses = ds.getAllRegionStatuses();
      expect(statuses).toHaveLength(12);
    });

    it('all statuses are healthy', () => {
      const statuses = ds.getAllRegionStatuses();
      statuses.forEach(s => {
        expect(s.status).toBe('healthy');
      });
    });
  });

  describe('recommendRegion', () => {
    it('filters by jurisdiction', () => {
      const recommendations = ds.recommendRegion({ jurisdiction: 'EU' });
      expect(recommendations.length).toBeGreaterThan(0);
      recommendations.forEach(r => {
        expect(r.regionId).toMatch(/^eu-/);
      });
    });

    it('returns only EU regions when jurisdiction is EU', () => {
      const recommendations = ds.recommendRegion({ jurisdiction: 'EU' });
      expect(recommendations).toHaveLength(2);
      expect(recommendations.map(r => r.regionId)).toEqual(expect.arrayContaining(['eu-west', 'eu-central']));
    });

    it('filters by regulations', () => {
      const recommendations = ds.recommendRegion({ regulations: ['GDPR'] });
      expect(recommendations.length).toBeGreaterThan(0);
      recommendations.forEach(r => {
        expect(r.regulations).toContain('GDPR');
      });
    });

    it('filters by jurisdiction and regulations combined', () => {
      const recommendations = ds.recommendRegion({ jurisdiction: 'US', regulations: ['CCPA', 'SOX'] });
      expect(recommendations).toHaveLength(2);
      recommendations.forEach(r => {
        expect(r.jurisdiction).toBeUndefined();
        expect(r.regulations).toContain('CCPA');
        expect(r.regulations).toContain('SOX');
      });
    });

    it('returns all 12 regions when no filters', () => {
      const recommendations = ds.recommendRegion({});
      expect(recommendations).toHaveLength(12);
    });

    it('marks first candidate as recommended', () => {
      const recommendations = ds.recommendRegion({ jurisdiction: 'US' });
      expect(recommendations[0].recommendationScore).toBe('recommended');
      expect(recommendations[1].recommendationScore).toBe('alternative');
    });

    it('handles lowLatency parameter', () => {
      const recommendations = ds.recommendRegion({ jurisdiction: 'US', lowLatency: true });
      expect(recommendations).toHaveLength(2);
    });
  });
});
