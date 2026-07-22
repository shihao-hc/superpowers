const fs = require('fs');

jest.mock('fs');

const {
  LICENSE_TYPES,
  ALLOWED_LICENSES,
  parseVRMMeta,
  detectLicenseType,
  isCommercialAllowed,
  validateModel,
  validateModelFromUrl,
  generateLicenseReport,
  checkModelsDirectory
} = require('../../src/utils/modelLicenseChecker');

describe('modelLicenseChecker', () => {
  describe('LICENSE_TYPES', () => {
    it('should define all license types', () => {
      expect(LICENSE_TYPES.PERSONAL).toBe('personal');
      expect(LICENSE_TYPES.COMMERCIAL).toBe('commercial');
      expect(LICENSE_TYPES.CC0).toBe('cc0');
      expect(LICENSE_TYPES.UNKNOWN).toBe('unknown');
    });
  });

  describe('ALLOWED_LICENSES', () => {
    it('should include PERSONAL, COMMERCIAL, CC0, CC_BY, CC_BY_SA', () => {
      expect(ALLOWED_LICENSES).toContain(LICENSE_TYPES.PERSONAL);
      expect(ALLOWED_LICENSES).toContain(LICENSE_TYPES.COMMERCIAL);
      expect(ALLOWED_LICENSES).toContain(LICENSE_TYPES.CC0);
    });
  });

  describe('parseVRMMeta', () => {
    it('should parse VRM metadata from buffer', () => {
      const json = JSON.stringify({
        meta: {
          title: 'Test Model',
          author: 'TestAuthor',
          allowedUserName: 'everyone',
          allowCommercial: 'allow',
          license: 'CC0',
          version: '1.0'
        }
      });
      const buffer = Buffer.from(json);
      const meta = parseVRMMeta(buffer);
      expect(meta.title).toBe('Test Model');
      expect(meta.author).toBe('TestAuthor');
      expect(meta.license).toBe('CC0');
    });

    it('should return null when no meta found', () => {
      const buffer = Buffer.from('{}');
      expect(parseVRMMeta(buffer)).toBeNull();
    });

    it('should return null on error', () => {
      expect(parseVRMMeta(null)).toBeNull();
    });
  });

  describe('detectLicenseType', () => {
    it('should detect commercial license from keywords', () => {
      const meta = { license: 'Commercial License' };
      expect(detectLicenseType(meta)).toBe(LICENSE_TYPES.COMMERCIAL);
    });

    it('should detect CC0 license', () => {
      const meta = { license: 'CC0' };
      expect(detectLicenseType(meta)).toBe(LICENSE_TYPES.CC0);
    });

    it('should detect personal if onlyAuthor', () => {
      const meta = { allowedUserName: 'onlyAuthor' };
      expect(detectLicenseType(meta)).toBe(LICENSE_TYPES.PERSONAL);
    });

    it('should detect commercial if allowCommercial is allow', () => {
      const meta = { allowCommercial: 'allow' };
      expect(detectLicenseType(meta)).toBe(LICENSE_TYPES.COMMERCIAL);
    });

    it('should return UNKNOWN for unmatched', () => {
      expect(detectLicenseType(null)).toBe(LICENSE_TYPES.UNKNOWN);
    });

    it('should detect CC BY NC', () => {
      const meta = { license: 'CC BY-NC 4.0' };
      expect(detectLicenseType(meta)).toBe(LICENSE_TYPES.CC_BY_NC);
    });
  });

  describe('isCommercialAllowed', () => {
    it('should return true for allowed licenses', () => {
      expect(isCommercialAllowed(LICENSE_TYPES.COMMERCIAL)).toBe(true);
      expect(isCommercialAllowed(LICENSE_TYPES.CC0)).toBe(true);
    });

    it('should return false for restricted licenses', () => {
      expect(isCommercialAllowed(LICENSE_TYPES.CC_BY_NC)).toBe(false);
    });
  });

  describe('validateModel', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return error if file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const result = validateModel('/fake/model.vrm');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('模型文件不存在');
    });

    it('should return error for unsupported extension', () => {
      fs.existsSync.mockReturnValue(true);
      const result = validateModel('/fake/model.obj');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('不支持的文件格式');
    });

    it('should validate VRM file successfully', () => {
      fs.existsSync.mockReturnValue(true);
      const vrmJson = JSON.stringify({ meta: { license: 'CC0', author: 'test' } });
      fs.readFileSync.mockReturnValue(Buffer.from(vrmJson));

      const result = validateModel('/fake/model.vrm');
      expect(result.valid).toBe(true);
      expect(result.licenseType).toBe(LICENSE_TYPES.CC0);
      expect(result.commercialAllowed).toBe(true);
    });

    it('should warn for non-commercial license', () => {
      fs.existsSync.mockReturnValue(true);
      const vrmJson = JSON.stringify({ meta: { license: 'CC BY-NC 4.0' } });
      fs.readFileSync.mockReturnValue(Buffer.from(vrmJson));

      const result = validateModel('/fake/model.vrm', true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.commercialAllowed).toBe(false);
    });

    it('should warn about missing author', () => {
      fs.existsSync.mockReturnValue(true);
      const vrmJson = JSON.stringify({ meta: { license: 'CC0' } });
      fs.readFileSync.mockReturnValue(Buffer.from(vrmJson));

      const result = validateModel('/fake/model.vrm');
      expect(result.warnings).toContain('模型缺少作者信息');
    });

    it('should catch and return errors', () => {
      fs.existsSync.mockImplementation(() => { throw new Error('disk error'); });
      const result = validateModel('/fake/model.vrm');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('disk error');
    });
  });

  describe('validateModelFromUrl', () => {
    it('should return with remote warning', () => {
      const result = validateModelFromUrl('https://example.com/model.vrm');
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('远程模型无法自动验证许可证，请手动确认');
    });
  });

  describe('generateLicenseReport', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return empty report if dir does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const report = generateLicenseReport('/fake');
      expect(report.totalModels).toBe(0);
    });

    it('should aggregate models in directory', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['model1.vrm', 'model2.vrm', 'readme.txt']);
      fs.statSync.mockReturnValue({ isFile: () => true });
      const vrmJson = JSON.stringify({ meta: { license: 'CC0', author: 't' } });
      fs.readFileSync.mockReturnValue(Buffer.from(vrmJson));

      const report = generateLicenseReport('/fake');
      expect(report.totalModels).toBe(2);
      expect(report.validModels).toBe(2);
      expect(report.commercialModels).toBe(2);
    });
  });

  describe('detectLicenseType (additional branches)', () => {
    it('should return UNKNOWN for non-null meta without matching keywords', () => {
      expect(detectLicenseType({ license: 'proprietary' })).toBe(LICENSE_TYPES.UNKNOWN);
    });
  });

  describe('validateModel (additional branches)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should warn about unknown license for non-VRM model', () => {
      fs.existsSync.mockReturnValue(true);
      const result = validateModel('/fake/model.glb', false);
      expect(result.warnings).toContain('无法识别模型许可证，请手动确认');
    });

    it('should warn when model is onlyAuthor', () => {
      fs.existsSync.mockReturnValue(true);
      const vrmJson = JSON.stringify({ meta: { allowedUserName: 'onlyAuthor' } });
      fs.readFileSync.mockReturnValue(Buffer.from(vrmJson));
      const result = validateModel('/fake/model.vrm');
      expect(result.warnings).toContain('模型仅限作者使用');
    });
  });

  describe('checkModelsDirectory', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should log report for models without warnings', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['good.vrm']);
      fs.statSync.mockReturnValue({ isFile: () => true });
      fs.readFileSync.mockReturnValue(Buffer.from(JSON.stringify({ meta: { license: 'CC0', author: 't' } })));
      jest.spyOn(console, 'log').mockImplementation(() => {});

      const report = checkModelsDirectory('/fake');
      expect(report.totalModels).toBe(1);
      expect(report.validModels).toBe(1);
      expect(report.commercialModels).toBe(1);
    });

    it('should warn for models with issues', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['bad.vrm']);
      fs.statSync.mockReturnValue({ isFile: () => true });
      fs.readFileSync.mockReturnValue(Buffer.from(JSON.stringify({ meta: { license: 'CC BY-NC' } })));
      jest.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const report = checkModelsDirectory('/fake');
      expect(report.totalModels).toBe(1);
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('parseVRMMeta (additional branches)', () => {
    it('should parse contactInformation from meta', () => {
      const json = JSON.stringify({
        meta: { title: 'M', author: 'A', contactInformation: 'test@example.com', license: 'CC0' }
      });
      const meta = parseVRMMeta(Buffer.from(json));
      expect(meta.contactInformation).toBe('test@example.com');
    });
  });

  describe('generateLicenseReport (additional branches)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should handle invalid and unknown-license models', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['invalid.vrm', 'unknown.vrm']);
      fs.statSync.mockReturnValue({ isFile: () => true });
      let callCount = 0;
      fs.readFileSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error('read error');
        return Buffer.from(JSON.stringify({ meta: { license: 'proprietary' } }));
      });

      const report = generateLicenseReport('/fake');
      expect(report.totalModels).toBe(2);
      expect(report.validModels).toBe(1);
      expect(report.unknownLicense).toBe(2);
    });
  });
});
