const fs = require('fs');
const path = require('path');

class I18n {
  constructor(options = {}) {
    this.defaultLocale = options.defaultLocale || 'zh';
    this.locale = this.defaultLocale;
    this.translations = {};
    this.fallbacks = {};
  }

  load(locale, filePath) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      this.translations[locale] = JSON.parse(raw);
    } catch (e) {
      console.warn(`[I18n] Failed to load ${locale}:`, e.message);
    }
  }

  loadAll(i18nPath) {
    if (!fs.existsSync(i18nPath)) {
      console.warn('[I18n] i18n directory not found');
      return;
    }

    const files = fs.readdirSync(i18nPath);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const locale = file.replace('.json', '');
        this.load(locale, path.join(i18nPath, file));
      }
    }
  }

  setLocale(locale) {
    if (this.translations[locale]) {
      this.locale = locale;
      return true;
    }
    return false;
  }

  getLocale() {
    return this.locale;
  }

  t(key, params = {}) {
    const keys = key.split('.');
    let value = this.translations[this.locale];

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        value = this.translations[this.defaultLocale];
        for (const k2 of keys) {
          if (value && typeof value === 'object' && k2 in value) {
            value = value[k2];
          } else {
            return key;
          }
        }
        break;
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    return value.replace(/\{(\w+)\}/g, (match, param) => {
      return params[param] !== undefined ? params[param] : match;
    });
  }

  getAllLocales() {
    return Object.keys(this.translations);
  }

  getTranslations(locale) {
    return this.translations[locale] || this.translations[this.defaultLocale] || {};
  }
}

const i18n = new I18n();
i18n.loadAll(path.resolve(process.cwd(), 'i18n'));

module.exports = i18n;
module.exports.I18n = I18n;
