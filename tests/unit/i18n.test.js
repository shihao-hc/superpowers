const { I18n } = require('../../src/i18n/I18n');

describe('I18n', () => {
  let i18n;

  beforeEach(() => {
    i18n = new I18n();
  });

  describe('constructor', () => {
    it('should set default locale to zh-CN', () => {
      expect(i18n.currentLocale).toBe('zh-CN');
    });

    it('should set fallback locale to en', () => {
      expect(i18n.fallbackLocale).toBe('en');
    });

    it('should initialize translations as a Map with all locales', () => {
      expect(i18n.translations).toBeInstanceOf(Map);
      expect(i18n.translations.size).toBe(7);
      expect(i18n.translations.has('zh-CN')).toBe(true);
      expect(i18n.translations.has('en')).toBe(true);
      expect(i18n.translations.has('ja')).toBe(true);
      expect(i18n.translations.has('de')).toBe(true);
      expect(i18n.translations.has('fr')).toBe(true);
      expect(i18n.translations.has('es')).toBe(true);
      expect(i18n.translations.has('ar')).toBe(true);
    });

    it('should initialize formatters as a Map', () => {
      expect(i18n.formatters).toBeInstanceOf(Map);
      expect(i18n.formatters.has('date')).toBe(true);
      expect(i18n.formatters.has('datetime')).toBe(true);
      expect(i18n.formatters.has('relativeTime')).toBe(true);
      expect(i18n.formatters.has('number')).toBe(true);
      expect(i18n.formatters.has('currency')).toBe(true);
      expect(i18n.formatters.has('percent')).toBe(true);
    });

    it('should accept custom options', () => {
      const custom = new I18n({ locale: 'ja', fallbackLocale: 'zh-CN' });
      expect(custom.currentLocale).toBe('ja');
      expect(custom.fallbackLocale).toBe('zh-CN');
    });
  });

  describe('setLocale', () => {
    it('should set valid locale and return true', () => {
      expect(i18n.setLocale('en')).toBe(true);
      expect(i18n.currentLocale).toBe('en');
    });

    it('should return false for non-string input', () => {
      expect(i18n.setLocale(123)).toBe(false);
      expect(i18n.setLocale(null)).toBe(false);
      expect(i18n.setLocale(undefined)).toBe(false);
      expect(i18n.setLocale({})).toBe(false);
      expect(i18n.setLocale([])).toBe(false);
      expect(i18n.currentLocale).toBe('zh-CN');
    });

    it('should return false for invalid locale not in whitelist', () => {
      expect(i18n.setLocale('ko')).toBe(false);
      expect(i18n.setLocale('xx')).toBe(false);
      expect(i18n.currentLocale).toBe('zh-CN');
    });

    it('should sanitize locale string by removing special chars', () => {
      expect(i18n.setLocale('en!')).toBe(true);
      expect(i18n.currentLocale).toBe('en');
    });

    it('should truncate to first 10 characters', () => {
      expect(i18n.setLocale('abcdefghijklmnop')).toBe(false);
      expect(i18n.currentLocale).toBe('zh-CN');
    });

    it('should handle locale change multiple times', () => {
      expect(i18n.setLocale('en')).toBe(true);
      expect(i18n.setLocale('zh-CN')).toBe(true);
      expect(i18n.setLocale('ar')).toBe(true);
      expect(i18n.currentLocale).toBe('ar');
    });
  });

  describe('getLocale', () => {
    it('should return current locale', () => {
      expect(i18n.getLocale()).toBe('zh-CN');
      i18n.setLocale('en');
      expect(i18n.getLocale()).toBe('en');
    });
  });

  describe('getAvailableLocales', () => {
    it('should return all whitelisted locales', () => {
      const locales = i18n.getAvailableLocales();
      expect(locales).toBeInstanceOf(Array);
      expect(locales).toHaveLength(7);
    });

    it('should return objects with code, name, and nativeName', () => {
      const locales = i18n.getAvailableLocales();
      locales.forEach((locale) => {
        expect(locale).toHaveProperty('code');
        expect(locale).toHaveProperty('name');
        expect(locale).toHaveProperty('nativeName');
      });
    });

    it('should contain Chinese (Simplified)', () => {
      const locales = i18n.getAvailableLocales();
      const zhCN = locales.find((l) => l.code === 'zh-CN');
      expect(zhCN).toBeDefined();
      expect(zhCN.name).toBe('Chinese (Simplified)');
      expect(zhCN.nativeName).toBe('简体中文');
    });

    it('should contain Arabic', () => {
      const locales = i18n.getAvailableLocales();
      const ar = locales.find((l) => l.code === 'ar');
      expect(ar).toBeDefined();
      expect(ar.name).toBe('Arabic');
      expect(ar.nativeName).toBe('العربية');
    });
  });

  describe('t', () => {
    it('should return translation for existing key in current locale', () => {
      expect(i18n.t('app.name')).toBe('UltraWork AI');
    });

    it('should return Chinese translation by default', () => {
      expect(i18n.t('nav.home')).toBe('首页');
      expect(i18n.t('skills.title')).toBe('技能市场');
    });

    it('should return English translation after switching locale', () => {
      i18n.setLocale('en');
      expect(i18n.t('nav.home')).toBe('Home');
      expect(i18n.t('skills.title')).toBe('Skill Marketplace');
    });

    it('should fall back to fallbackLocale when key missing in current locale', () => {
      i18n.setLocale('ja');
      expect(i18n.t('skills.categories')).toBe('Categories');
    });

    it('should return key and warn when key missing in all locales', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const result = i18n.t('nonexistent.key');
      expect(result).toBe('nonexistent.key');
      expect(warnSpy).toHaveBeenCalledWith('[i18n] Missing translation: nonexistent.key');
      warnSpy.mockRestore();
    });

    it('should substitute params with {n} placeholder', () => {
      expect(i18n.t('time.minutesAgo', { n: 5 })).toBe('5分钟前');
    });

    it('should substitute params in English', () => {
      i18n.setLocale('en');
      expect(i18n.t('time.minutesAgo', { n: 3 })).toBe('3 minutes ago');
    });

    it('should handle multiple param substitutions', () => {
      i18n.setLocale('en');
      const result = i18n.t('time.hoursAgo', { n: 2 });
      expect(result).toBe('2 hours ago');
    });

    it('should return translation unchanged when no params needed', () => {
      expect(i18n.t('action.save')).toBe('保存');
    });

    it('should handle empty params object', () => {
      expect(i18n.t('msg.saved', {})).toBe('保存成功');
    });

    it('should work with Arabic locale', () => {
      i18n.setLocale('ar');
      expect(i18n.t('nav.home')).toBe('الرئيسية');
      expect(i18n.t('app.tagline')).toBe('منصة المهارات الذكية');
    });

    it('should fall back through multiple locale changes', () => {
      i18n.setLocale('fr');
      expect(i18n.t('enterprise.tenants')).toBe('Tenant Management');
    });
  });

  describe('format', () => {
    it('should format date', () => {
      const result = i18n.format('date', '2024-03-15');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format datetime', () => {
      const result = i18n.format('datetime', '2024-03-15T10:30:00');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format relativeTime as "just now"', () => {
      const now = Date.now();
      const result = i18n.format('relativeTime', now);
      expect(result).toBe('刚刚');
    });

    it('should format relativeTime in minutes', () => {
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      const result = i18n.format('relativeTime', fiveMinAgo);
      expect(result).toBe('5分钟前');
    });

    it('should format relativeTime in hours', () => {
      const threeHoursAgo = Date.now() - 3 * 3600 * 1000;
      const result = i18n.format('relativeTime', threeHoursAgo);
      expect(result).toBe('3小时前');
    });

    it('should format relativeTime in days', () => {
      const twoDaysAgo = Date.now() - 2 * 86400 * 1000;
      const result = i18n.format('relativeTime', twoDaysAgo);
      expect(result).toBe('2天前');
    });

    it('should format relativeTime in English locale', () => {
      i18n.setLocale('en');
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      const result = i18n.format('relativeTime', fiveMinAgo);
      expect(result).toBe('5 minutes ago');
    });

    it('should format number', () => {
      const result = i18n.format('number', 1234567.89);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format currency with default CNY', () => {
      const result = i18n.format('currency', 1234.56);
      expect(result).toMatch(/[\d,.\s]/);
      expect(typeof result).toBe('string');
    });

    it('should format currency with custom currency', () => {
      const result = i18n.format('currency', 100, { currency: 'USD' });
      expect(typeof result).toBe('string');
    });

    it('should format percent', () => {
      const result = i18n.format('percent', 0.25);
      expect(typeof result).toBe('string');
    });

    it('should return value as-is for unknown format type', () => {
      const result = i18n.format('unknown', 'test-value');
      expect(result).toBe('test-value');
    });
  });

  describe('translateSkill', () => {
    it('should translate skill description when translation exists', () => {
      const skill = { name: 'stock-analysis', description: 'Stock analysis' };
      const translated = i18n.translateSkill(skill);
      expect(translated.description).toBe('基于技术指标进行股票走势分析和预测');
    });

    it('should return translation key when no key-specific translation exists', () => {
      const skill = { name: 'unknown-skill', description: 'Custom skill' };
      const translated = i18n.translateSkill(skill);
      expect(translated.name).toBe('skill.unknown-skill.name');
      expect(translated.description).toBe('skill.unknown-skill.desc');
    });

    it('should preserve additional skill properties', () => {
      const skill = { name: 'stock-analysis', description: 'test', category: 'finance', version: '1.0' };
      const translated = i18n.translateSkill(skill);
      expect(translated.category).toBe('finance');
      expect(translated.version).toBe('1.0');
    });

    it('should fallback to translated desc key for locale without skill desc', () => {
      const skill = { name: 'stock-analysis', description: 'Stock analysis' };
      i18n.setLocale('en');
      const translated = i18n.translateSkill(skill);
      expect(translated.description).toBe('skill.stock-analysis.desc');
    });
  });

  describe('translateSkills', () => {
    it('should translate an array of skills', () => {
      const skills = [
        { name: 'stock-analysis', description: 'desc1' },
        { name: 'risk-assessment', description: 'desc2' }
      ];
      const translated = i18n.translateSkills(skills);
      expect(translated).toHaveLength(2);
      expect(translated[0].description).toBe('基于技术指标进行股票走势分析和预测');
      expect(translated[1].description).toBe('综合评估投资组合风险，提供VaR和CVaR分析');
    });

    it('should return empty array for empty input', () => {
      expect(i18n.translateSkills([])).toEqual([]);
    });
  });

  describe('translateDomain', () => {
    it('should translate domain name when translation exists', () => {
      const domain = { id: 'finance', name: 'Finance' };
      const translated = i18n.translateDomain(domain);
      expect(translated.name).toBe('金融');
    });

    it('should return translation key when no domain translation exists', () => {
      const domain = { id: 'unknown-domain', name: 'Unknown' };
      const translated = i18n.translateDomain(domain);
      expect(translated.name).toBe('domain.unknown-domain');
    });

    it('should translate domain differently per locale', () => {
      const domain = { id: 'finance', name: 'Finance' };
      i18n.setLocale('en');
      const translated = i18n.translateDomain(domain);
      expect(translated.name).toBe('Finance');
    });

    it('should preserve additional domain properties', () => {
      const domain = { id: 'healthcare', name: 'Healthcare', icon: '🏥' };
      const translated = i18n.translateDomain(domain);
      expect(translated.icon).toBe('🏥');
    });
  });

  describe('getUITranslations', () => {
    it('should return categorized translations', () => {
      const ui = i18n.getUITranslations();
      expect(ui).toHaveProperty('navigation');
      expect(ui).toHaveProperty('skills');
      expect(ui).toHaveProperty('chat');
      expect(ui).toHaveProperty('monitoring');
      expect(ui).toHaveProperty('compliance');
      expect(ui).toHaveProperty('enterprise');
      expect(ui).toHaveProperty('actions');
      expect(ui).toHaveProperty('messages');
      expect(ui).toHaveProperty('errors');
      expect(ui).toHaveProperty('privacy');
      expect(ui).toHaveProperty('audit');
    });

    it('should return Chinese translations by default', () => {
      const ui = i18n.getUITranslations();
      expect(ui.navigation.home).toBe('首页');
      expect(ui.navigation.skills).toBe('技能市场');
      expect(ui.actions.save).toBe('保存');
    });

    it('should return English translations after switching locale', () => {
      i18n.setLocale('en');
      const ui = i18n.getUITranslations();
      expect(ui.navigation.home).toBe('Home');
      expect(ui.actions.save).toBe('Save');
    });

    it('should strip prefixes from keys', () => {
      const ui = i18n.getUITranslations();
      expect(ui.navigation).not.toHaveProperty('nav.home');
      expect(ui.navigation).toHaveProperty('home');
    });

    it('should return partial translations for locale with fewer keys', () => {
      i18n.setLocale('ja');
      const ui = i18n.getUITranslations();
      expect(ui.navigation.home).toBe('ホーム');
      expect(ui.skills.title).toBe('スキルマーケット');
    });
  });

  describe('isRTL', () => {
    it('should return true for Arabic', () => {
      expect(i18n.isRTL('ar')).toBe(true);
    });

    it('should return true for Hebrew', () => {
      expect(i18n.isRTL('he')).toBe(true);
    });

    it('should return true for Farsi', () => {
      expect(i18n.isRTL('fa')).toBe(true);
    });

    it('should return true for Urdu', () => {
      expect(i18n.isRTL('ur')).toBe(true);
    });

    it('should return false for English', () => {
      expect(i18n.isRTL('en')).toBe(false);
    });

    it('should return false for Chinese', () => {
      expect(i18n.isRTL('zh-CN')).toBe(false);
    });

    it('should use current locale when no argument provided', () => {
      expect(i18n.isRTL()).toBe(false);
      i18n.setLocale('ar');
      expect(i18n.isRTL()).toBe(true);
    });
  });

  describe('getLocaleConfig', () => {
    it('should return full config for current locale', () => {
      const config = i18n.getLocaleConfig();
      expect(config).toEqual({
        code: 'zh-CN',
        name: 'Chinese (Simplified)',
        nativeName: '简体中文',
        rtl: false,
        dateFormat: 'YYYY-MM-DD',
        numberFormat: { decimal: '.', thousand: ',' }
      });
    });

    it('should return config for specified locale', () => {
      const config = i18n.getLocaleConfig('ar');
      expect(config.code).toBe('ar');
      expect(config.name).toBe('Arabic');
      expect(config.nativeName).toBe('العربية');
      expect(config.rtl).toBe(true);
      expect(config.dateFormat).toBe('DD/MM/YYYY');
      expect(config.numberFormat).toEqual({ decimal: '٫', thousand: '٬' });
    });

    it('should return config for German locale', () => {
      const config = i18n.getLocaleConfig('de');
      expect(config.code).toBe('de');
      expect(config.rtl).toBe(false);
      expect(config.dateFormat).toBe('DD.MM.YYYY');
      expect(config.numberFormat).toEqual({ decimal: ',', thousand: '.' });
    });

    it('should fallback gracefully for unknown locale', () => {
      const config = i18n.getLocaleConfig('xx');
      expect(config.code).toBe('xx');
      expect(config.name).toBe('xx');
      expect(config.nativeName).toBe('xx');
      expect(config.rtl).toBe(false);
      expect(config.dateFormat).toBe('MM/DD/YYYY');
      expect(config.numberFormat).toEqual({ decimal: '.', thousand: ',' });
    });
  });

  describe('format edge cases', () => {
    it('should format date with fallback format for locale not in format map', () => {
      i18n.setLocale('de');
      const result = i18n.format('date', '2024-06-15');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format percent with default options', () => {
      const result = i18n.format('percent', 0.5, { maximumFractionDigits: 0 });
      expect(result).toMatch(/50%/);
    });
  });

  describe('t edge cases', () => {
    it('should not substitute params that are not in translation', () => {
      const result = i18n.t('app.name', { unknown: 'value' });
      expect(result).toBe('UltraWork AI');
    });
  });

  describe('getUITranslations edge cases', () => {
    it('should fallback to fallbackLocale when currentLocale has no translations', () => {
      i18n.currentLocale = 'ko';
      const ui = i18n.getUITranslations();
      expect(ui.navigation.home).toBe('Home');
      expect(ui.actions.save).toBe('Save');
    });

    it('should return empty categories when neither locale has translations', () => {
      i18n.currentLocale = 'ko';
      i18n.fallbackLocale = 'xx';
      const ui = i18n.getUITranslations();
      expect(ui.navigation).toEqual({});
      expect(ui.skills).toEqual({});
      expect(ui.actions).toEqual({});
    });
  });

  describe('static ALLOWED_LOCALES', () => {
    it('should be defined', () => {
      expect(I18n.ALLOWED_LOCALES).toBeDefined();
      expect(I18n.ALLOWED_LOCALES).toBeInstanceOf(Array);
      expect(I18n.ALLOWED_LOCALES).toContain('zh-CN');
      expect(I18n.ALLOWED_LOCALES).toContain('en');
      expect(I18n.ALLOWED_LOCALES).toContain('ar');
    });
  });

  describe('formatter default options', () => {
    it('should use default options when calling date formatter without options', () => {
      const formatter = i18n.formatters.get('date');
      const ts = new Date('2024-01-15').getTime();
      const result = formatter(ts);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should use default options when calling datetime formatter without options', () => {
      const formatter = i18n.formatters.get('datetime');
      const ts = new Date('2024-01-15T12:30:00').getTime();
      const result = formatter(ts);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should use default options when calling relativeTime formatter without options', () => {
      const formatter = i18n.formatters.get('relativeTime');
      const result = formatter(Date.now());
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should use default options when calling number formatter without options', () => {
      const formatter = i18n.formatters.get('number');
      const result = formatter(12345.67);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should use default options when calling currency formatter without options', () => {
      const formatter = i18n.formatters.get('currency');
      const result = formatter(99.99);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should use default options when calling percent formatter without options', () => {
      const formatter = i18n.formatters.get('percent');
      const result = formatter(0.25);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });
});
