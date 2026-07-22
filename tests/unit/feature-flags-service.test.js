const { FeatureFlagsService, featureFlag, featureMiddleware } = require('../../src/agent/FeatureFlagsService');

describe('FeatureFlagsService', () => {
  let service;

  beforeEach(() => {
    jest.restoreAllMocks();
    service = new FeatureFlagsService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should register 24 default features', () => {
      expect(service.features.size).toBe(28);
      expect(service.isEnabled('CONTEXT_COLLAPSE')).toBe(true);
      expect(service.isEnabled('HISTORY_SNIP')).toBe(true);
      expect(service.isEnabled('KAIROS')).toBe(false);
      expect(service.isEnabled('TRANSCRIPT_CLASSIFIER')).toBe(false);
      expect(service.isEnabled('VOICE_MODE')).toBe(false);
      expect(service.isEnabled('NONEXISTENT')).toBe(false);
    });

    test('should have dynamic features set', () => {
      expect(service.dynamicFeatures.has('DEBUG_MODE')).toBe(true);
      expect(service.dynamicFeatures.has('TEST_MODE')).toBe(true);
      expect(service.dynamicFeatures.has('DEMO_MODE')).toBe(true);
    });

    test('should accept custom features in options', () => {
      const custom = new FeatureFlagsService({
        features: {
          MY_FEATURE: { enabled: true, description: 'Custom feature' }
        }
      });
      expect(custom.features.size).toBe(29);
      expect(custom.isEnabled('MY_FEATURE')).toBe(true);
      expect(custom.get('MY_FEATURE').description).toBe('Custom feature');
    });
  });

  describe('register', () => {
    test('should add a feature and emit event', () => {
      const handler = jest.fn();
      service.on('featureRegistered', handler);
      const feature = service.register('NEW_FEATURE', { enabled: true, description: 'New' });
      expect(feature.name).toBe('NEW_FEATURE');
      expect(feature.enabled).toBe(true);
      expect(feature.description).toBe('New');
      expect(feature.metadata).toEqual({});
      expect(feature.registeredAt).toBeDefined();
      expect(service.features.has('NEW_FEATURE')).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].name).toBe('NEW_FEATURE');
    });

    test('should use defaults for minimal config', () => {
      const feature = service.register('MINIMAL', {});
      expect(feature.enabled).toBe(false);
      expect(feature.description).toBe('');
      expect(feature.metadata).toEqual({});
    });

    test('should accept metadata in config', () => {
      const feature = service.register('WITH_META', {
        enabled: true,
        description: 'Has metadata',
        metadata: { version: 2, owner: 'team' }
      });
      expect(feature.metadata.version).toBe(2);
    });
  });

  describe('registerMany', () => {
    test('should batch register features', () => {
      const features = {
        F1: { enabled: true, description: 'Feature one' },
        F2: { enabled: false, description: 'Feature two' }
      };
      const results = service.registerMany(features);
      expect(results).toHaveLength(2);
      expect(service.features.has('F1')).toBe(true);
      expect(service.features.has('F2')).toBe(true);
      expect(service.isEnabled('F1')).toBe(true);
      expect(service.isEnabled('F2')).toBe(false);
    });
  });

  describe('get', () => {
    test('should return undefined for unregistered feature', () => {
      expect(service.get('NONEXISTENT')).toBeUndefined();
    });

    test('should return feature object for registered feature', () => {
      const feature = service.get('KAIROS');
      expect(feature).toBeDefined();
      expect(feature.name).toBe('KAIROS');
    });
  });

  describe('enable and isEnabled', () => {
    test('should enable a feature and emit event', () => {
      const handler = jest.fn();
      service.on('featureEnabled', handler);
      service.enable('KAIROS');
      expect(service.isEnabled('KAIROS')).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].name).toBe('KAIROS');
    });

    test('should auto-register unknown feature on enable', () => {
      service.enable('UNKNOWN_FEATURE');
      expect(service.isEnabled('UNKNOWN_FEATURE')).toBe(true);
      expect(service.features.has('UNKNOWN_FEATURE')).toBe(true);
    });

    test('should not emit event if already enabled', () => {
      const handler = jest.fn();
      service.on('featureEnabled', handler);
      service.enable('CONTEXT_COLLAPSE');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('disable', () => {
    test('should disable a feature and emit event', () => {
      const handler = jest.fn();
      service.on('featureDisabled', handler);
      service.enable('KAIROS');
      const result = service.disable('KAIROS');
      expect(result).toBe(true);
      expect(service.isEnabled('KAIROS')).toBe(false);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('should return false for unregistered feature', () => {
      expect(service.disable('NONEXISTENT')).toBe(false);
    });

    test('should not emit event if already disabled', () => {
      const handler = jest.fn();
      service.on('featureDisabled', handler);
      service.disable('KAIROS');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('toggle', () => {
    test('should toggle feature state', () => {
      expect(service.isEnabled('KAIROS')).toBe(false);
      const state1 = service.toggle('KAIROS');
      expect(state1).toBe(true);
      expect(service.isEnabled('KAIROS')).toBe(true);
      const state2 = service.toggle('KAIROS');
      expect(state2).toBe(false);
    });

    test('should return false for unknown feature', () => {
      expect(service.toggle('NONEXISTENT')).toBe(false);
    });
  });

  describe('check', () => {
    test('should be an alias for isEnabled', () => {
      expect(service.check('KAIROS')).toBe(false);
      service.enable('KAIROS');
      expect(service.check('KAIROS')).toBe(true);
    });
  });

  describe('getAll', () => {
    test('should return all features', () => {
      const all = service.getAll();
      expect(all).toBeInstanceOf(Array);
      expect(all).toHaveLength(28);
    });
  });

  describe('getEnabled', () => {
    test('should return only enabled features', () => {
      const enabled = service.getEnabled();
      expect(enabled.every(function (f) { return f.enabled; })).toBe(true);
      expect(enabled.some(function (f) { return f.name === 'CONTEXT_COLLAPSE'; })).toBe(true);
      expect(enabled.some(function (f) { return f.name === 'KAIROS'; })).toBe(false);
    });
  });

  describe('getFeatureNames', () => {
    test('should return all feature names', () => {
      const names = service.getFeatureNames();
      expect(names).toContain('KAIROS');
      expect(names).toContain('VOICE_MODE');
      expect(names).toHaveLength(28);
    });
  });

  describe('ifEnabled', () => {
    test('should call callback when feature is enabled', () => {
      const callback = jest.fn().mockReturnValue('result');
      const result = service.ifEnabled('CONTEXT_COLLAPSE', callback);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(result).toBe('result');
    });

    test('should not call callback when feature is disabled', () => {
      const callback = jest.fn();
      const result = service.ifEnabled('KAIROS', callback);
      expect(callback).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe('ifEnabledThen', () => {
    test('should return enabled module when feature on', () => {
      const enabledMod = { value: 'enabled' };
      const disabledMod = { value: 'disabled' };
      const result = service.ifEnabledThen('CONTEXT_COLLAPSE', enabledMod, disabledMod);
      expect(result).toBe(enabledMod);
    });

    test('should return disabled module when feature off', () => {
      const enabledMod = { value: 'enabled' };
      const disabledMod = { value: 'disabled' };
      const result = service.ifEnabledThen('KAIROS', enabledMod, disabledMod);
      expect(result).toBe(disabledMod);
    });

    test('should default to null when feature off and no disabled module', () => {
      const result = service.ifEnabledThen('KAIROS', 'enabled');
      expect(result).toBeNull();
    });
  });

  describe('export and import', () => {
    test('export should return snapshot of all features', () => {
      const exported = service.export();
      expect(exported.features).toBeDefined();
      expect(exported.exportedAt).toBeDefined();
      expect(exported.features.CONTEXT_COLLAPSE.enabled).toBe(true);
      expect(exported.features.KAIROS.enabled).toBe(false);
    });

    test('import should apply feature overrides', () => {
      service.import({
        features: {
          KAIROS: { enabled: true },
          CONTEXT_COLLAPSE: { enabled: false }
        }
      });
      expect(service.isEnabled('KAIROS')).toBe(true);
      expect(service.isEnabled('CONTEXT_COLLAPSE')).toBe(false);
    });

    test('import should skip features without enabled field', () => {
      service.import({
        features: {
          KAIROS: { description: 'no enabled field' }
        }
      });
      expect(service.isEnabled('KAIROS')).toBe(false);
    });

    test('import should handle config without features', () => {
      service.enable('KAIROS');
      service.import({});
      expect(service.isEnabled('KAIROS')).toBe(true);
    });
  });

  describe('getStats', () => {
    test('should return stats with categories', () => {
      service.enable('KAIROS');
      service.enable('ULTRAPLAN');
      service.enable('POWERSHELL_AUTO_MODE');
      const stats = service.getStats();
      expect(stats.total).toBe(28);
      expect(stats.enabled).toBe(5);
      expect(stats.disabled).toBe(23);
      expect(typeof stats.percentage).toBe('number');
      expect(stats.byCategory.core).toContain('KAIROS');
      expect(stats.byCategory.command).toContain('ULTRAPLAN');
      expect(stats.byCategory.permission).toContain('POWERSHELL_AUTO_MODE');
      expect(stats.byCategory.runtime).toEqual([]);
    });

    test('should group unknown features into other', () => {
      service.register('MY_CUSTOM_THING', { enabled: true });
      const stats = service.getStats();
      expect(stats.byCategory.other).toContain('MY_CUSTOM_THING');
    });
  });

  describe('reset', () => {
    test('should re-register defaults and emit event', () => {
      const handler = jest.fn();
      service.on('reset', handler);
      service.enable('KAIROS');
      service.reset();
      expect(service.isEnabled('KAIROS')).toBe(false);
      expect(service.isEnabled('CONTEXT_COLLAPSE')).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('featureFlag decorator', () => {
    test('should skip method when feature disabled', () => {
      const obj = { features: service };
      const method = jest.fn().mockReturnValue('executed');
      const descriptor = { value: method };
      featureFlag('KAIROS')(obj, 'method', descriptor);
      const result = descriptor.value.call(obj);
      expect(result).toBeUndefined();
      expect(method).not.toHaveBeenCalled();
    });

    test('should execute method when feature enabled', () => {
      service.enable('KAIROS');
      const obj = { features: service };
      const method = jest.fn().mockReturnValue('executed');
      const descriptor = { value: method };
      featureFlag('KAIROS')(obj, 'method', descriptor);
      const result = descriptor.value.call(obj);
      expect(result).toBe('executed');
      expect(method).toHaveBeenCalledTimes(1);
    });

    test('should fallback to global features', () => {
      global.features = service;
      service.enable('KAIROS');
      const obj = {};
      const method = jest.fn().mockReturnValue('executed');
      const descriptor = { value: method };
      featureFlag('KAIROS')(obj, 'method', descriptor);
      const result = descriptor.value.call(obj);
      expect(result).toBe('executed');
      delete global.features;
    });
  });

  describe('featureMiddleware', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
      req = { app: {} };
      res = {
        redirect: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      next = jest.fn();
    });

    test('should call next when feature is enabled', async () => {
      req.app.features = service;
      service.enable('KAIROS');
      const middleware = featureMiddleware('KAIROS');
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('should return 404 when feature is disabled', async () => {
      req.app.features = service;
      const middleware = featureMiddleware('KAIROS');
      await middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Feature not available',
        feature: 'KAIROS'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should redirect when option provided', async () => {
      req.app.features = service;
      const middleware = featureMiddleware('KAIROS', { redirect: '/upgrade' });
      await middleware(req, res, next);
      expect(res.redirect).toHaveBeenCalledWith('/upgrade');
    });

    test('should fallback to global features', async () => {
      global.features = service;
      service.enable('KAIROS');
      delete req.app.features;
      const middleware = featureMiddleware('KAIROS');
      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      delete global.features;
    });
  });
});
