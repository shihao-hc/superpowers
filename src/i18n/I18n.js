/**
 * Internationalization (i18n) System
 * Multi-language support for interface and skill descriptions
 */

class I18n {
  constructor(options = {}) {
    this.currentLocale = options.locale || 'zh-CN';
    this.fallbackLocale = options.fallbackLocale || 'en';
    this.translations = new Map();
    this.formatters = new Map();
    
    this._loadTranslations();
    this._initFormatters();
  }

  _loadTranslations() {
    // Chinese (Simplified)
    this.translations.set('zh-CN', {
      // Common
      'app.name': 'UltraWork AI',
      'app.tagline': '智能技能平台',
      
      // Navigation
      'nav.home': '首页',
      'nav.skills': '技能市场',
      'nav.domains': '行业领域',
      'nav.chat': '对话',
      'nav.monitoring': '监控',
      'nav.settings': '设置',
      'nav.profile': '个人中心',
      'nav.logout': '退出登录',
      
      // Skills
      'skills.title': '技能市场',
      'skills.search': '搜索技能...',
      'skills.categories': '分类',
      'skills.all': '全部',
      'skills.popular': '热门',
      'skills.new': '最新',
      'skills.execute': '执行',
      'skills.configure': '配置',
      'skills.favorite': '收藏',
      'skills.usage': '使用次数',
      'skills.rating': '评分',
      'skills.downloads': '下载量',
      
      // Domains
      'domain.finance': '金融',
      'domain.healthcare': '医疗健康',
      'domain.legal': '法律服务',
      'domain.manufacturing': '制造业',
      'domain.education': '教育',
      'domain.retail': '零售电商',
      
      // Chat
      'chat.placeholder': '输入消息...',
      'chat.send': '发送',
      'chat.skillSuggestion': '您可能需要这个技能',
      'chat.skillExecuted': '技能执行完成',
      'chat.error': '出错了',
      
      // Monitoring
      'monitoring.title': '监控仪表盘',
      'monitoring.successRate': '成功率',
      'monitoring.latency': '响应延迟',
      'monitoring.users': '活跃用户',
      'monitoring.alerts': '告警',
      
      // Compliance
      'compliance.gdpr': 'GDPR合规',
      'compliance.ccpa': 'CCPA合规',
      'compliance.hipaa': 'HIPAA合规',
      'compliance.privacy': '隐私政策',
      'compliance.consent': '同意管理',
      'compliance.dataRequest': '数据请求',
      'compliance.export': '导出数据',
      'compliance.delete': '删除数据',
      'compliance.rightAccess': '访问权',
      'compliance.rightRectification': '更正权',
      'compliance.rightErasure': '删除权',
      'compliance.rightRestriction': '限制处理权',
      'compliance.rightPortability': '数据可携权',
      'compliance.rightObject': '反对权',
      
      // Enterprise
      'enterprise.tenants': '租户管理',
      'enterprise.users': '用户管理',
      'enterprise.audit': '审计日志',
      'enterprise.sso': 'SSO配置',
      'enterprise.apiKeys': 'API密钥',
      'enterprise.branding': '品牌定制',
      
      // Actions
      'action.save': '保存',
      'action.cancel': '取消',
      'action.delete': '删除',
      'action.edit': '编辑',
      'action.view': '查看',
      'action.export': '导出',
      'action.import': '导入',
      'action.submit': '提交',
      'action.confirm': '确认',
      'action.close': '关闭',
      
      // Messages
      'msg.saved': '保存成功',
      'msg.deleted': '删除成功',
      'msg.error': '操作失败',
      'msg.loading': '加载中...',
      'msg.noData': '暂无数据',
      'msg.confirmDelete': '确定要删除吗？',
      
      // Time
      'time.now': '刚刚',
      'time.minutesAgo': '{n}分钟前',
      'time.hoursAgo': '{n}小时前',
      'time.daysAgo': '{n}天前',
      
      // Errors
      'error.required': '此项为必填',
      'error.invalid': '格式无效',
      'error.network': '网络错误',
      'error.unauthorized': '未授权',
      'error.forbidden': '禁止访问',
      'error.notFound': '未找到',
      
      // Privacy
      'privacy.title': '隐私设置',
      'privacy.cookies': 'Cookie设置',
      'privacy.analytics': '数据分析',
      'privacy.marketing': '营销通讯',
      'privacy.accept': '接受全部',
      'privacy.reject': '拒绝全部',
      'privacy.customize': '自定义设置',
      
      // Audit
      'audit.title': '审计日志',
      'audit.timestamp': '时间',
      'audit.user': '用户',
      'audit.action': '操作',
      'audit.resource': '资源',
      'audit.result': '结果',
      'audit.ip': 'IP地址',
      
      // Skills Descriptions (Finance)
      'skill.stock-analysis.desc': '基于技术指标进行股票走势分析和预测',
      'skill.risk-assessment.desc': '综合评估投资组合风险，提供VaR和CVaR分析',
      'skill.financial-report-gen.desc': '根据财务数据自动生成各类财务报表和分析报告',
      'skill.credit-scoring.desc': '基于机器学习的信用评分和风险定价',
      'skill.portfolio-opt.desc': '基于现代投资组合理论优化资产配置',
      
      // Skills Descriptions (Healthcare)
      'skill.medical-image-analysis.desc': 'X光、CT、MRI等医学影像的AI辅助分析',
      'skill.symptom-checker.desc': '基于症状提供初步健康建议和科室推荐',
      'skill.drug-interaction.desc': '检查药物间的相互作用和禁忌',
      'skill.health-record-summary.desc': '生成患者健康档案的智能摘要',
      'skill.insurance-claim.desc': '自动化保险理赔审核和欺诈检测',
      
      // Skills Descriptions (Legal)
      'skill.contract-review.desc': '基于AI自动审查合同条款，识别风险点并提供修改建议',
      'skill.legal-research.desc': '快速检索法律法规、司法解释和判例',
      'skill.compliance-check.desc': '自动检查企业运营是否符合各类法规要求',
      'skill.case-analysis.desc': '分析案件材料，预测案件走向并生成诉讼策略',
      'skill.document-drafting.desc': '自动生成各类法律文书，包括起诉状、答辩状、合同等',
      
      // Skills Descriptions (Manufacturing)
      'skill.quality-control.desc': '基于机器视觉自动检测产品缺陷，提高质检效率',
      'skill.predictive-maintenance.desc': '基于设备运行数据预测故障，减少非计划停机',
      'skill.supply-chain-optimization.desc': '优化供应链调度，降低库存成本，提高交付效率',
      'skill.process-optimization.desc': '基于历史数据优化生产工艺参数，提升良率',
      'skill.root-cause-analysis.desc': '运用5Why、鱼骨图等方法自动分析质量问题根因',
      
      // Skills Descriptions (Education)
      'skill.smart-lesson-planning.desc': '根据教学大纲和学情分析自动生成教案',
      'skill.smart-grading.desc': '自动批改客观题和主观题，提供详细反馈',
      'skill.learning-analytics.desc': '全面分析学生学习行为，提供个性化学习建议',
      'skill.course-recommendation.desc': '基于学生画像和学习历史推荐最适合的课程',
      'skill.exam-generator.desc': '根据知识点和难度自动生成多样化试题',
      
      // Skills Descriptions (Retail)
      'skill.product-recommendation.desc': '基于用户行为和偏好提供个性化商品推荐',
      'skill.demand-forecast.desc': 'AI驱动的商品需求预测，优化库存和采购',
      'skill.dynamic-pricing.desc': '基于市场供需和竞争分析实时调整价格',
      'skill.customer-segmentation.desc': '基于消费行为对客户进行分群，制定差异化策略',
      'skill.churn-prediction.desc': '预测客户流失风险，提前采取挽留措施'
    });

    // English
    this.translations.set('en', {
      'app.name': 'UltraWork AI',
      'app.tagline': 'Intelligent Skill Platform',
      
      'nav.home': 'Home',
      'nav.skills': 'Skills',
      'nav.domains': 'Domains',
      'nav.chat': 'Chat',
      'nav.monitoring': 'Monitoring',
      'nav.settings': 'Settings',
      'nav.profile': 'Profile',
      'nav.logout': 'Logout',
      
      'skills.title': 'Skill Marketplace',
      'skills.search': 'Search skills...',
      'skills.categories': 'Categories',
      'skills.all': 'All',
      'skills.popular': 'Popular',
      'skills.new': 'New',
      'skills.execute': 'Execute',
      'skills.configure': 'Configure',
      'skills.favorite': 'Favorite',
      'skills.usage': 'Usage',
      'skills.rating': 'Rating',
      'skills.downloads': 'Downloads',
      
      'domain.finance': 'Finance',
      'domain.healthcare': 'Healthcare',
      'domain.legal': 'Legal',
      'domain.manufacturing': 'Manufacturing',
      'domain.education': 'Education',
      'domain.retail': 'Retail',
      
      'chat.placeholder': 'Type a message...',
      'chat.send': 'Send',
      'chat.skillSuggestion': 'You might need this skill',
      'chat.skillExecuted': 'Skill executed successfully',
      'chat.error': 'An error occurred',
      
      'monitoring.title': 'Monitoring Dashboard',
      'monitoring.successRate': 'Success Rate',
      'monitoring.latency': 'Latency',
      'monitoring.users': 'Active Users',
      'monitoring.alerts': 'Alerts',
      
      'compliance.gdpr': 'GDPR Compliance',
      'compliance.ccpa': 'CCPA Compliance',
      'compliance.hipaa': 'HIPAA Compliance',
      'compliance.privacy': 'Privacy Policy',
      'compliance.consent': 'Consent Management',
      'compliance.dataRequest': 'Data Request',
      'compliance.export': 'Export Data',
      'compliance.delete': 'Delete Data',
      'compliance.rightAccess': 'Right to Access',
      'compliance.rightRectification': 'Right to Rectification',
      'compliance.rightErasure': 'Right to Erasure',
      'compliance.rightRestriction': 'Right to Restriction',
      'compliance.rightPortability': 'Right to Portability',
      'compliance.rightObject': 'Right to Object',
      
      'enterprise.tenants': 'Tenant Management',
      'enterprise.users': 'User Management',
      'enterprise.audit': 'Audit Log',
      'enterprise.sso': 'SSO Configuration',
      'enterprise.apiKeys': 'API Keys',
      'enterprise.branding': 'Branding',
      
      'action.save': 'Save',
      'action.cancel': 'Cancel',
      'action.delete': 'Delete',
      'action.edit': 'Edit',
      'action.view': 'View',
      'action.export': 'Export',
      'action.import': 'Import',
      'action.submit': 'Submit',
      'action.confirm': 'Confirm',
      'action.close': 'Close',
      
      'msg.saved': 'Saved successfully',
      'msg.deleted': 'Deleted successfully',
      'msg.error': 'Operation failed',
      'msg.loading': 'Loading...',
      'msg.noData': 'No data',
      'msg.confirmDelete': 'Are you sure you want to delete?',
      
      'time.now': 'Just now',
      'time.minutesAgo': '{n} minutes ago',
      'time.hoursAgo': '{n} hours ago',
      'time.daysAgo': '{n} days ago',
      
      'error.required': 'This field is required',
      'error.invalid': 'Invalid format',
      'error.network': 'Network error',
      'error.unauthorized': 'Unauthorized',
      'error.forbidden': 'Forbidden',
      'error.notFound': 'Not found',
      
      'privacy.title': 'Privacy Settings',
      'privacy.cookies': 'Cookie Settings',
      'privacy.analytics': 'Analytics',
      'privacy.marketing': 'Marketing',
      'privacy.accept': 'Accept All',
      'privacy.reject': 'Reject All',
      'privacy.customize': 'Customize',
      
      'audit.title': 'Audit Log',
      'audit.timestamp': 'Timestamp',
      'audit.user': 'User',
      'audit.action': 'Action',
      'audit.resource': 'Resource',
      'audit.result': 'Result',
      'audit.ip': 'IP Address'
    });

    // Japanese
    this.translations.set('ja', {
      'app.name': 'UltraWork AI',
      'app.tagline': 'インテリジェントスキルプラットフォーム',
      
      'nav.home': 'ホーム',
      'nav.skills': 'スキル',
      'nav.domains': 'ドメイン',
      'nav.chat': 'チャット',
      'nav.monitoring': '監視',
      'nav.settings': '設定',
      'nav.profile': 'プロフィール',
      'nav.logout': 'ログアウト',
      
      'skills.title': 'スキルマーケット',
      'skills.search': 'スキルを検索...',
      'skills.execute': '実行',
      
      'chat.placeholder': 'メッセージを入力...',
      'chat.send': '送信',
      
      'monitoring.title': '監視ダッシュボード',
      
      'compliance.gdpr': 'GDPRコンプライアンス',
      'compliance.ccpa': 'CCPAコンプライアンス',
      'compliance.hipaa': 'HIPAAコンプライアンス',
      
      'action.save': '保存',
      'action.cancel': 'キャンセル',
      'action.delete': '削除',
      
      'msg.saved': '保存しました',
      'msg.deleted': '削除しました',
      'msg.error': 'エラーが発生しました',
      'msg.loading': '読み込み中...'
    });

    // German
    this.translations.set('de', {
      'app.name': 'UltraWork AI',
      'app.tagline': 'Intelligente Skill-Plattform',
      
      'nav.home': 'Startseite',
      'nav.skills': 'Skills',
      'nav.domains': 'Bereiche',
      'nav.chat': 'Chat',
      'nav.monitoring': 'Monitoring',
      'nav.settings': 'Einstellungen',
      'nav.profile': 'Profil',
      'nav.logout': 'Abmelden',
      
      'skills.title': 'Skill-Marktplatz',
      'skills.search': 'Skills suchen...',
      'skills.execute': 'Ausführen',
      
      'chat.placeholder': 'Nachricht eingeben...',
      'chat.send': 'Senden',
      
      'monitoring.title': 'Monitoring-Dashboard',
      
      'compliance.gdpr': 'DSGVO-Konformität',
      'compliance.ccpa': 'CCPA-Konformität',
      'compliance.hipaa': 'HIPAA-Konformität',
      
      'action.save': 'Speichern',
      'action.cancel': 'Abbrechen',
      'action.delete': 'Löschen',
      
      'msg.saved': 'Erfolgreich gespeichert',
      'msg.deleted': 'Erfolgreich gelöscht',
      'msg.error': 'Operation fehlgeschlagen',
      'msg.loading': 'Wird geladen...'
    });

    // French
    this.translations.set('fr', {
      'app.name': 'UltraWork AI',
      'app.tagline': 'Plateforme de Skills Intelligents',
      
      'nav.home': 'Accueil',
      'nav.skills': 'Skills',
      'nav.domains': 'Domaines',
      'nav.chat': 'Discussion',
      'nav.monitoring': 'Surveillance',
      'nav.settings': 'Paramètres',
      'nav.profile': 'Profil',
      'nav.logout': 'Déconnexion',
      
      'skills.title': 'Marché des Skills',
      'skills.search': 'Rechercher des skills...',
      'skills.execute': 'Exécuter',
      
      'chat.placeholder': 'Tapez un message...',
      'chat.send': 'Envoyer',
      
      'monitoring.title': 'Tableau de Bord',
      
      'compliance.gdpr': 'Conformité RGPD',
      'compliance.ccpa': 'Conformité CCPA',
      'compliance.hipaa': 'Conformité HIPAA',
      
      'action.save': 'Enregistrer',
      'action.cancel': 'Annuler',
      'action.delete': 'Supprimer',
      
      'msg.saved': 'Enregistré avec succès',
      'msg.deleted': 'Supprimé avec succès',
      'msg.error': 'Opération échouée',
      'msg.loading': 'Chargement...'
    });

    // Spanish
    this.translations.set('es', {
      'app.name': 'UltraWork AI',
      'app.tagline': 'Plataforma de Skills Inteligentes',
      
      'nav.home': 'Inicio',
      'nav.skills': 'Skills',
      'nav.domains': 'Dominios',
      'nav.chat': 'Chat',
      'nav.monitoring': 'Monitoreo',
      'nav.settings': 'Configuración',
      'nav.profile': 'Perfil',
      'nav.logout': 'Cerrar Sesión',
      
      'skills.title': 'Mercado de Skills',
      'skills.search': 'Buscar skills...',
      'skills.execute': 'Ejecutar',
      
      'chat.placeholder': 'Escribe un mensaje...',
      'chat.send': 'Enviar',
      
      'monitoring.title': 'Panel de Monitoreo',
      
      'compliance.gdpr': 'Cumplimiento GDPR',
      'compliance.ccpa': 'Cumplimiento CCPA',
      'compliance.hipaa': 'Cumplimiento HIPAA',
      
      'action.save': 'Guardar',
      'action.cancel': 'Cancelar',
      'action.delete': 'Eliminar',
      
      'msg.saved': 'Guardado exitosamente',
      'msg.deleted': 'Eliminado exitosamente',
      'msg.error': 'Operación fallida',
      'msg.loading': 'Cargando...'
    });

    // Arabic (RTL)
    this.translations.set('ar', {
      'app.name': 'UltraWork AI',
      'app.tagline': 'منصة المهارات الذكية',
      'app.direction': 'rtl',
      
      'nav.home': 'الرئيسية',
      'nav.skills': 'المهارات',
      'nav.domains': 'المجالات',
      'nav.chat': 'الدردشة',
      'nav.monitoring': 'المراقبة',
      'nav.settings': 'الإعدادات',
      'nav.profile': 'الملف الشخصي',
      'nav.logout': 'تسجيل الخروج',
      
      'skills.title': 'سوق المهارات',
      'skills.search': 'البحث عن مهارات...',
      'skills.execute': 'تنفيذ',
      
      'chat.placeholder': 'اكتب رسالة...',
      'chat.send': 'إرسال',
      
      'monitoring.title': 'لوحة المراقبة',
      
      'compliance.gdpr': 'الامتثال لـ GDPR',
      'compliance.ccpa': 'الامتثال لـ CCPA',
      'compliance.hipaa': 'الامتثال لـ HIPAA',
      
      'action.save': 'حفظ',
      'action.cancel': 'إلغاء',
      'action.delete': 'حذف',
      
      'msg.saved': 'تم الحفظ بنجاح',
      'msg.deleted': 'تم الحذف بنجاح',
      'msg.error': 'فشلت العملية',
      'msg.loading': 'جارٍ التحميل...'
    });
  }

  _initFormatters() {
    // Date formatter
    this.formatters.set('date', (value, options = {}) => {
      const date = new Date(value);
      const locale = this.currentLocale;
      
      const formats = {
        'zh-CN': { year: 'numeric', month: 'long', day: 'numeric' },
        'en': { year: 'numeric', month: 'short', day: 'numeric' },
        'ja': { year: 'numeric', month: 'long', day: 'numeric' }
      };
      
      return date.toLocaleDateString(locale, formats[locale] || formats['en']);
    });

    // DateTime formatter
    this.formatters.set('datetime', (value, options = {}) => {
      const date = new Date(value);
      const locale = this.currentLocale;
      return date.toLocaleString(locale);
    });

    // Relative time formatter
    this.formatters.set('relativeTime', (value, options = {}) => {
      const now = Date.now();
      const diff = now - new Date(value).getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (minutes < 1) return this.t('time.now');
      if (minutes < 60) return this.t('time.minutesAgo').replace('{n}', minutes);
      if (hours < 24) return this.t('time.hoursAgo').replace('{n}', hours);
      return this.t('time.daysAgo').replace('{n}', days);
    });

    // Number formatter
    this.formatters.set('number', (value, options = {}) => {
      return new Intl.NumberFormat(this.currentLocale, options).format(value);
    });

    // Currency formatter
    this.formatters.set('currency', (value, options = {}) => {
      return new Intl.NumberFormat(this.currentLocale, {
        style: 'currency',
        currency: options.currency || 'CNY',
        ...options
      }).format(value);
    });

    // Percentage formatter
    this.formatters.set('percent', (value, options = {}) => {
      return new Intl.NumberFormat(this.currentLocale, {
        style: 'percent',
        ...options
      }).format(value);
    });
  }

  // Allowed locales whitelist for security
  static ALLOWED_LOCALES = ['zh-CN', 'en', 'ja', 'de', 'fr', 'es', 'ar'];

  setLocale(locale) {
    // Validate locale is a string and matches whitelist
    if (typeof locale !== 'string') return false;
    
    // Sanitize: only allow alphanumeric and hyphen/underscore
    const sanitized = locale.substring(0, 10).replace(/[^a-zA-Z0-9_\-]/g, '');
    
    // Check against whitelist and available translations
    if (I18n.ALLOWED_LOCALES.includes(sanitized) && this.translations.has(sanitized)) {
      this.currentLocale = sanitized;
      return true;
    }
    return false;
  }

  getLocale() {
    return this.currentLocale;
  }

  getAvailableLocales() {
    // Only return whitelisted locales
    return Array.from(this.translations.keys())
      .filter(code => I18n.ALLOWED_LOCALES.includes(code))
      .map(code => ({
      code,
      name: this._getLocaleName(code),
      nativeName: this._getNativeLocaleName(code)
    }));
  }

  _getLocaleName(code) {
    const names = {
      'zh-CN': 'Chinese (Simplified)',
      'en': 'English',
      'ja': 'Japanese',
      'de': 'German',
      'fr': 'French',
      'es': 'Spanish',
      'ar': 'Arabic'
    };
    return names[code] || code;
  }

  _getNativeLocaleName(code) {
    const names = {
      'zh-CN': '简体中文',
      'en': 'English',
      'ja': '日本語',
      'de': 'Deutsch',
      'fr': 'Français',
      'es': 'Español',
      'ar': 'العربية'
    };
    return names[code] || code;
  }

  isRTL(locale = this.currentLocale) {
    const rtlLocales = ['ar', 'he', 'fa', 'ur'];
    return rtlLocales.includes(locale);
  }

  getLocaleConfig(locale = this.currentLocale) {
    return {
      code: locale,
      name: this._getLocaleName(locale),
      nativeName: this._getNativeLocaleName(locale),
      rtl: this.isRTL(locale),
      dateFormat: this._getDateFormat(locale),
      numberFormat: this._getNumberFormat(locale)
    };
  }

  _getDateFormat(locale) {
    const formats = {
      'zh-CN': 'YYYY-MM-DD',
      'en': 'MM/DD/YYYY',
      'ja': 'YYYY/MM/DD',
      'de': 'DD.MM.YYYY',
      'fr': 'DD/MM/YYYY',
      'es': 'DD/MM/YYYY',
      'ar': 'DD/MM/YYYY'
    };
    return formats[locale] || formats['en'];
  }

  _getNumberFormat(locale) {
    const formats = {
      'zh-CN': { decimal: '.', thousand: ',' },
      'en': { decimal: '.', thousand: ',' },
      'ja': { decimal: '.', thousand: ',' },
      'de': { decimal: ',', thousand: '.' },
      'fr': { decimal: ',', thousand: ' ' },
      'es': { decimal: ',', thousand: '.' },
      'ar': { decimal: '٫', thousand: '٬' }
    };
    return formats[locale] || formats['en'];
  }

  t(key, params = {}) {
    let translation = this.translations.get(this.currentLocale)?.get(key);
    
    if (!translation) {
      translation = this.translations.get(this.fallbackLocale)?.get(key);
    }
    
    if (!translation) {
      console.warn(`[i18n] Missing translation: ${key}`);
      return key;
    }
    
    // Replace parameters
    if (Object.keys(params).length > 0) {
      Object.entries(params).forEach(([k, v]) => {
        translation = translation.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      });
    }
    
    return translation;
  }

  format(type, value, options = {}) {
    const formatter = this.formatters.get(type);
    if (formatter) {
      return formatter(value, options);
    }
    return value;
  }

  translateSkill(skill) {
    const prefix = `skill.${skill.name}`;
    
    return {
      ...skill,
      name: this.t(`${prefix}.name`) || skill.name,
      description: this.t(`${prefix}.desc`) || skill.description
    };
  }

  translateSkills(skills) {
    return skills.map(skill => this.translateSkill(skill));
  }

  translateDomain(domain) {
    return {
      ...domain,
      name: this.t(`domain.${domain.id}`) || domain.name
    };
  }

  getUITranslations() {
    const translations = this.translations.get(this.currentLocale) || 
                         this.translations.get(this.fallbackLocale) || 
                         {};
    
    // Group by category
    return {
      navigation: this._filterKeys(translations, 'nav.'),
      skills: this._filterKeys(translations, 'skills.'),
      chat: this._filterKeys(translations, 'chat.'),
      monitoring: this._filterKeys(translations, 'monitoring.'),
      compliance: this._filterKeys(translations, 'compliance.'),
      enterprise: this._filterKeys(translations, 'enterprise.'),
      actions: this._filterKeys(translations, 'action.'),
      messages: this._filterKeys(translations, 'msg.'),
      errors: this._filterKeys(translations, 'error.'),
      privacy: this._filterKeys(translations, 'privacy.'),
      audit: this._filterKeys(translations, 'audit.')
    };
  }

  _filterKeys(obj, prefix) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith(prefix)) {
        result[key.replace(prefix, '')] = value;
      }
    }
    return result;
  }
}

module.exports = { I18n };
