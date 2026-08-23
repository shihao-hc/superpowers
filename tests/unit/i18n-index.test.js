jest.mock('fs');

const fs = require('fs');

// Suppress module-load warning from the module-level loadAll() (i18n dir absent).
jest.spyOn(console, 'warn').mockImplementation(() => {});

const i18nModule = require('../../src/i18n/index');
const { I18n } = i18nModule;

afterAll(() => {
  jest.restoreAllMocks();
});

function makeI18n(options = {}) {
  const inst = new I18n(options);
  inst.load('zh', '/i18n/zh.json');
  inst.load('en', '/i18n/en.json');
  return inst;
}

function setupTranslations() {
  const zh = JSON.stringify({
    greeting: '你好',
    user: { name: '名字' },
    prompt: '你好 {name}，欢迎 {site}！',
    obj: { nested: { x: 1 } },
    list: ['a', 'b']
  });
  const en = JSON.stringify({
    greeting: 'Hello',
    user: { name: 'Name' }
  });
  fs.readFileSync.mockImplementation((p) => {
    if (String(p).includes('zh.json')) return zh;
    if (String(p).includes('en.json')) return en;
    return '{}';
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  fs.existsSync.mockReturnValue(false);
  fs.readdirSync.mockReturnValue([]);
  fs.readFileSync.mockReturnValue('{}');
  setupTranslations();
});

describe('module exports', () => {
  it('default export is a singleton I18n instance', () => {
    expect(typeof i18nModule.setLocale).toBe('function');
    expect(typeof i18nModule.getLocale).toBe('function');
    expect(typeof i18nModule.t).toBe('function');
  });

  it('I18n class is attached to the default export', () => {
    expect(i18nModule.I18n).toBe(I18n);
    expect(I18n.name).toBe('I18n');
  });

  it('singleton has zh as default locale and empty translations', () => {
    expect(i18nModule.defaultLocale).toBe('zh');
    expect(i18nModule.locale).toBe('zh');
    expect(i18nModule.translations).toEqual({});
  });
});

describe('constructor', () => {
  it('uses default locale zh when no options provided', () => {
    const inst = new I18n();
    expect(inst.defaultLocale).toBe('zh');
    expect(inst.locale).toBe('zh');
    expect(inst.translations).toEqual({});
    expect(inst.fallbacks).toEqual({});
  });

  it('accepts a custom defaultLocale option', () => {
    const inst = new I18n({ defaultLocale: 'en' });
    expect(inst.defaultLocale).toBe('en');
    expect(inst.locale).toBe('en');
  });

  it('falls back to zh when defaultLocale option is falsy', () => {
    const inst = new I18n({ defaultLocale: '' });
    expect(inst.defaultLocale).toBe('zh');
  });
});

describe('load', () => {
  it('parses JSON file into translations for the locale', () => {
    fs.readFileSync.mockReturnValue('{"greeting":"Bonjour"}');
    const inst = new I18n();
    inst.load('fr', '/i18n/fr.json');
    expect(inst.translations.fr).toEqual({ greeting: 'Bonjour' });
  });

  it('warns and keeps translations empty when file is missing', () => {
    fs.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });
    const inst = new I18n();
    inst.load('fr', '/i18n/missing.json');
    expect(inst.translations.fr).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      '[I18n] Failed to load fr:',
      'ENOENT: no such file'
    );
  });

  it('warns and keeps translations empty when JSON is invalid', () => {
    fs.readFileSync.mockReturnValue('{not valid json');
    const inst = new I18n();
    inst.load('fr', '/i18n/bad.json');
    expect(inst.translations.fr).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      '[I18n] Failed to load fr:',
      expect.any(String)
    );
  });
});

describe('loadAll', () => {
  it('warns and returns early when i18n directory does not exist', () => {
    fs.existsSync.mockReturnValue(false);
    const inst = new I18n();
    inst.loadAll('/nonexistent');
    expect(console.warn).toHaveBeenCalledWith('[I18n] i18n directory not found');
    expect(fs.readdirSync).not.toHaveBeenCalled();
    expect(inst.translations).toEqual({});
  });

  it('loads every .json file and skips other files', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['en.json', 'zh.json', 'README.md']);
    fs.readFileSync.mockImplementation((p) => {
      if (String(p).endsWith('en.json')) return '{"a":"A"}';
      if (String(p).endsWith('zh.json')) return '{"b":"B"}';
      return '{}';
    });
    const inst = new I18n();
    inst.loadAll('/i18n');
    expect(inst.translations.en).toEqual({ a: 'A' });
    expect(inst.translations.zh).toEqual({ b: 'B' });
    expect(inst.translations['README.md']).toBeUndefined();
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });

  it('loads nothing when directory contains only non-json files', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['notes.txt', 'data.md']);
    const inst = new I18n();
    inst.loadAll('/i18n');
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(inst.translations).toEqual({});
  });
});

describe('setLocale', () => {
  it('returns true and updates locale when translations exist', () => {
    const inst = makeI18n();
    expect(inst.setLocale('en')).toBe(true);
    expect(inst.locale).toBe('en');
  });

  it('returns false and keeps locale when translations missing', () => {
    const inst = makeI18n();
    expect(inst.setLocale('fr')).toBe(false);
    expect(inst.locale).toBe('zh');
  });

  it('accepts a locale that was loaded after construction', () => {
    const inst = new I18n();
    expect(inst.setLocale('en')).toBe(false);
    inst.load('en', '/i18n/en.json');
    expect(inst.setLocale('en')).toBe(true);
  });
});

describe('getLocale', () => {
  it('returns the current locale', () => {
    const inst = makeI18n();
    expect(inst.getLocale()).toBe('zh');
    inst.setLocale('en');
    expect(inst.getLocale()).toBe('en');
  });
});

describe('t', () => {
  it('returns translation for an existing key in current locale', () => {
    const inst = makeI18n();
    expect(inst.t('greeting')).toBe('你好');
  });

  it('traverses nested keys', () => {
    const inst = makeI18n();
    expect(inst.t('user.name')).toBe('名字');
  });

  it('falls back to defaultLocale when key missing in current locale', () => {
    const inst = makeI18n();
    inst.setLocale('en');
    expect(inst.t('prompt')).toBe('你好 {name}，欢迎 {site}！');
  });

  it('returns the key when missing in both locales', () => {
    const inst = makeI18n();
    expect(inst.t('nope')).toBe('nope');
  });

  it('returns the key when nested key is missing in both locales', () => {
    const inst = makeI18n();
    expect(inst.t('user.xyz')).toBe('user.xyz');
  });

  it('returns the key when key path extends past a string leaf', () => {
    const inst = makeI18n();
    expect(inst.t('greeting.extra')).toBe('greeting.extra');
  });

  it('substitutes all provided params', () => {
    const inst = makeI18n();
    expect(inst.t('prompt', { name: 'Alice', site: 'example.com' })).toBe(
      '你好 Alice，欢迎 example.com！'
    );
  });

  it('keeps placeholder when a param is not provided', () => {
    const inst = makeI18n();
    expect(inst.t('prompt', { name: 'Bob' })).toBe('你好 Bob，欢迎 {site}！');
  });

  it('works with an empty params object', () => {
    const inst = makeI18n();
    expect(inst.t('greeting', {})).toBe('你好');
  });

  it('works with no params argument at all', () => {
    const inst = makeI18n();
    expect(inst.t('greeting')).toBe('你好');
  });

  it('returns the key when resolved value is an object', () => {
    const inst = makeI18n();
    expect(inst.t('user')).toBe('user');
    expect(inst.t('obj')).toBe('obj');
  });

  it('returns the key when resolved value is an array', () => {
    const inst = makeI18n();
    expect(inst.t('list')).toBe('list');
  });
});

describe('getAllLocales', () => {
  it('returns empty array when no translations loaded', () => {
    const inst = new I18n();
    expect(inst.getAllLocales()).toEqual([]);
  });

  it('returns all loaded locale keys', () => {
    const inst = makeI18n();
    expect(inst.getAllLocales().sort()).toEqual(['en', 'zh']);
  });
});

describe('getTranslations', () => {
  it('returns translations for the requested locale when loaded', () => {
    const inst = makeI18n();
    expect(inst.getTranslations('en')).toEqual({ greeting: 'Hello', user: { name: 'Name' } });
  });

  it('falls back to defaultLocale translations', () => {
    const inst = makeI18n();
    expect(inst.getTranslations('fr').greeting).toBe('你好');
  });

  it('returns empty object when neither locale is loaded', () => {
    const inst = new I18n();
    expect(inst.getTranslations('fr')).toEqual({});
  });
});