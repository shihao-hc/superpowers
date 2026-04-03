/**
 * Vertical Domain Markets
 * Specialized skill markets for Finance, Healthcare, and other industries
 */

class VerticalDomainMarket {
  constructor(options = {}) {
    this.domains = new Map();
    this.categories = new Map();
    this.skills = new Map();
    this.templates = new Map();
    
    this._initializeDomains();
  }

  /**
   * Initialize domain structures
   */
  _initializeDomains() {
    // Finance Domain
    this._registerDomain({
      id: 'finance',
      name: '金融领域',
      nameEn: 'Finance',
      icon: '💰',
      description: '股票、基金、债券、风险管理、财务分析等金融服务',
      color: '#10a37f',
      categories: ['stocks', 'funds', 'bonds', 'risk-management', 'financial-analysis', 'crypto', 'banking'],
      compliance: ['SEC', 'FINRA', 'MiFID II', 'SOX'],
      certifications: ['CFA', 'CPA', 'FRM', 'CAIA']
    });

    // Healthcare Domain
    this._registerDomain({
      id: 'healthcare',
      name: '医疗健康',
      nameEn: 'Healthcare',
      icon: '🏥',
      description: '医学影像、诊断辅助、健康管理、药物研发等医疗健康服务',
      color: '#ef4444',
      categories: ['medical-imaging', 'diagnosis', 'health-management', 'drug-discovery', 'telemedicine', 'insurance'],
      compliance: ['HIPAA', 'GDPR', 'FDA', 'HL7'],
      certifications: ['RN', 'MD', 'PharmD', 'RHIT']
    });

    // Legal Domain
    this._registerDomain({
      id: 'legal',
      name: '法律服务',
      nameEn: 'Legal',
      icon: '⚖️',
      description: '合同审查、法律检索、案件分析、合规检查等法律服务',
      color: '#8b5cf6',
      categories: ['contract-review', 'legal-research', 'case-analysis', 'compliance', 'ip-protection'],
      compliance: ['GDPR', 'CCPA', 'SOX', 'AML'],
      certifications: ['JD', 'LLM', 'BAR']
    });

    // Manufacturing Domain
    this._registerDomain({
      id: 'manufacturing',
      name: '制造业',
      nameEn: 'Manufacturing',
      icon: '🏭',
      description: '质量控制、供应链管理、预测性维护、工艺优化等制造服务',
      color: '#f59e0b',
      categories: ['quality-control', 'supply-chain', 'predictive-maintenance', 'process-optimization', 'inventory'],
      compliance: ['ISO', 'FDA', 'EPA', 'OSHA'],
      certifications: ['Six Sigma', 'Lean', 'PMP', 'CQE']
    });

    // Education Domain
    this._registerDomain({
      id: 'education',
      name: '教育行业',
      nameEn: 'Education',
      icon: '📚',
      description: '智能备课、作业批改、学习分析、课程推荐等教育服务',
      color: '#3b82f6',
      categories: ['lesson-planning', 'grading', 'learning-analytics', 'course-recommendation', 'student-assessment'],
      compliance: ['FERPA', 'COPPA', 'GDPR'],
      certifications: ['TEFL', 'CELTA', 'EdD']
    });

    // Retail Domain
    this._registerDomain({
      id: 'retail',
      name: '零售电商',
      nameEn: 'Retail & E-commerce',
      icon: '🛒',
      description: '商品推荐、库存管理、价格优化、客户分析等零售服务',
      color: '#ec4899',
      categories: ['recommendation', 'inventory', 'pricing', 'customer-analytics', 'demand-forecast'],
      compliance: ['PCI-DSS', 'GDPR', 'CCPA'],
      certifications: ['NRF', 'CMP', 'CMDT']
    });

    // Initialize domain skills and templates
    this._initializeFinanceSkills();
    this._initializeHealthcareSkills();
  }

  /**
   * Register domain
   */
  _registerDomain(domain) {
    this.domains.set(domain.id, {
      ...domain,
      skills: [],
      templates: [],
      stats: {
        totalSkills: 0,
        totalDownloads: 0,
        averageRating: 0,
        activeUsers: 0
      },
      createdAt: Date.now()
    });
  }

  /**
   * Initialize Finance domain skills
   */
  _initializeFinanceSkills() {
    const financeSkills = [
      {
        id: 'stock-analysis',
        name: '股票技术分析',
        nameEn: 'Stock Technical Analysis',
        category: 'stocks',
        description: '基于技术指标进行股票走势分析和预测',
        inputs: [
          { name: 'symbol', type: 'string', description: '股票代码', required: true },
          { name: 'indicators', type: 'array', description: '技术指标列表', required: false }
        ],
        outputs: [
          { name: 'analysis', type: 'object', description: '分析结果' },
          { name: 'chart', type: 'image', description: 'K线图' },
          { name: 'recommendation', type: 'string', description: '操作建议' }
        ],
        compliance: ['SEC', 'FINRA'],
        version: '1.0.0',
        author: 'system',
        rating: 4.8,
        downloads: 1250,
        tags: ['股票', '技术分析', 'K线', 'MACD', 'RSI']
      },
      {
        id: 'risk-assessment',
        name: '风险评估模型',
        nameEn: 'Risk Assessment Model',
        category: 'risk-management',
        description: '综合评估投资组合风险，提供VaR和CVaR分析',
        inputs: [
          { name: 'portfolio', type: 'object', description: '投资组合数据', required: true },
          { name: 'confidence', type: 'number', description: '置信水平', required: false }
        ],
        outputs: [
          { name: 'var', type: 'number', description: 'VaR值' },
          { name: 'cvar', type: 'number', description: 'CVaR值' },
          { name: 'report', type: 'pdf', description: '风险报告' }
        ],
        compliance: ['Basel III', 'SOLVENCY II'],
        version: '1.2.0',
        author: 'system',
        rating: 4.6,
        downloads: 890,
        tags: ['风险', 'VaR', 'CVaR', '投资组合']
      },
      {
        id: 'financial-report-gen',
        name: '财务报表生成',
        nameEn: 'Financial Report Generator',
        category: 'financial-analysis',
        description: '根据财务数据自动生成各类财务报表和分析报告',
        inputs: [
          { name: 'financials', type: 'object', description: '财务数据', required: true },
          { name: 'reportType', type: 'string', description: '报告类型', required: true }
        ],
        outputs: [
          { name: 'report', type: 'pdf', description: '财务报告' },
          { name: 'charts', type: 'array', description: '图表' }
        ],
        compliance: ['SOX', 'IFRS', 'GAAP'],
        version: '2.1.0',
        author: 'system',
        rating: 4.9,
        downloads: 2100,
        tags: ['财务', '报告', 'PDF', '分析']
      },
      {
        id: 'credit-scoring',
        name: '信用评分模型',
        nameEn: 'Credit Scoring Model',
        category: 'banking',
        description: '基于机器学习的信用评分和风险定价',
        inputs: [
          { name: 'applicantData', type: 'object', description: '申请人数据', required: true },
          { name: 'modelType', type: 'string', description: '模型类型', required: false }
        ],
        outputs: [
          { name: 'score', type: 'number', description: '信用评分' },
          { name: 'riskLevel', type: 'string', description: '风险等级' },
          { name: 'recommendation', type: 'string', description: '审批建议' }
        ],
        compliance: ['FCRA', 'ECOA', 'GDPR'],
        version: '1.5.0',
        author: 'system',
        rating: 4.7,
        downloads: 1560,
        tags: ['信用', '评分', '贷款', '风控']
      },
      {
        id: 'market-sentiment',
        name: '市场情绪分析',
        nameEn: 'Market Sentiment Analysis',
        category: 'stocks',
        description: '分析新闻、社交媒体和研报，评估市场情绪',
        inputs: [
          { name: 'symbols', type: 'array', description: '股票代码列表', required: true },
          { name: 'sources', type: 'array', description: '数据来源', required: false }
        ],
        outputs: [
          { name: 'sentiment', type: 'object', description: '情绪分析结果' },
          { name: 'trends', type: 'chart', description: '情绪趋势图' }
        ],
        compliance: ['SEC', 'MiFID II'],
        version: '1.1.0',
        author: 'system',
        rating: 4.5,
        downloads: 980,
        tags: ['情绪', 'NLP', '社交媒体', '新闻']
      },
      {
        id: 'portfolio-opt',
        name: '投资组合优化',
        nameEn: 'Portfolio Optimization',
        category: 'financial-analysis',
        description: '基于现代投资组合理论优化资产配置',
        inputs: [
          { name: 'assets', type: 'array', description: '资产列表', required: true },
          { name: 'constraints', type: 'object', description: '约束条件', required: false }
        ],
        outputs: [
          { name: 'weights', type: 'array', description: '最优权重' },
          { name: 'expectedReturn', type: 'number', description: '预期收益' },
          { name: 'risk', type: 'number', description: '风险值' }
        ],
        compliance: ['UCITS', 'SEC'],
        version: '2.0.0',
        author: 'system',
        rating: 4.8,
        downloads: 1750,
        tags: ['投资组合', '优化', 'MPT', '量化']
      }
    ];

    for (const skill of financeSkills) {
      this._registerSkill('finance', skill);
    }

    // Finance templates
    this._registerTemplate('finance', {
      id: 'quarterly-report',
      name: '季度财报分析',
      description: '生成完整的季度财务分析报告',
      steps: ['stock-analysis', 'risk-assessment', 'financial-report-gen'],
      duration: 30,
      outputFormat: 'pdf'
    });

    this._registerTemplate('finance', {
      id: 'loan-approval',
      name: '贷款审批流程',
      description: '完整的贷款审批工作流',
      steps: ['credit-scoring', 'risk-assessment'],
      duration: 15,
      outputFormat: 'document'
    });
  }

  /**
   * Initialize Healthcare domain skills
   */
  _initializeHealthcareSkills() {
    const healthcareSkills = [
      {
        id: 'medical-image-analysis',
        name: '医学影像分析',
        nameEn: 'Medical Image Analysis',
        category: 'medical-imaging',
        description: 'X光、CT、MRI等医学影像的AI辅助分析',
        inputs: [
          { name: 'image', type: 'file', description: '医学影像文件', required: true },
          { name: 'modality', type: 'string', description: '成像模态', required: true },
          { name: 'bodyPart', type: 'string', description: '检查部位', required: false }
        ],
        outputs: [
          { name: 'analysis', type: 'object', description: '分析结果' },
          { name: 'annotations', type: 'image', description: '标注图像' },
          { name: 'report', type: 'pdf', description: '诊断报告' }
        ],
        compliance: ['HIPAA', 'FDA 510(k)'],
        version: '2.0.0',
        author: 'system',
        rating: 4.9,
        downloads: 3200,
        tags: ['影像', 'AI诊断', 'X光', 'CT', 'MRI']
      },
      {
        id: 'symptom-checker',
        name: '症状自查助手',
        nameEn: 'Symptom Checker',
        category: 'diagnosis',
        description: '基于症状提供初步健康建议和科室推荐',
        inputs: [
          { name: 'symptoms', type: 'array', description: '症状列表', required: true },
          { name: 'demographics', type: 'object', description: '人口统计信息', required: false }
        ],
        outputs: [
          { name: 'possibleConditions', type: 'array', description: '可能疾病' },
          { name: 'recommendations', type: 'array', description: '建议' },
          { name: 'urgency', type: 'string', description: '紧急程度' }
        ],
        compliance: ['HIPAA', 'GDPR'],
        version: '1.5.0',
        author: 'system',
        rating: 4.4,
        downloads: 5600,
        tags: ['症状', '自查', '分诊', '健康']
      },
      {
        id: 'drug-interaction',
        name: '药物相互作用检查',
        nameEn: 'Drug Interaction Checker',
        category: 'diagnosis',
        description: '检查药物间的相互作用和禁忌',
        inputs: [
          { name: 'medications', type: 'array', description: '药物列表', required: true },
          { name: 'patientProfile', type: 'object', description: '患者信息', required: false }
        ],
        outputs: [
          { name: 'interactions', type: 'array', description: '相互作用' },
          { name: 'warnings', type: 'array', description: '警告' },
          { name: 'safetyScore', type: 'number', description: '安全评分' }
        ],
        compliance: ['FDA', 'EMA', 'HIPAA'],
        version: '1.3.0',
        author: 'system',
        rating: 4.8,
        downloads: 2800,
        tags: ['药物', '相互作用', '安全', '处方']
      },
      {
        id: 'health-record-summary',
        name: '健康档案摘要',
        nameEn: 'Health Record Summary',
        category: 'health-management',
        description: '生成患者健康档案的智能摘要',
        inputs: [
          { name: 'records', type: 'array', description: '健康记录', required: true },
          { name: 'summaryType', type: 'string', description: '摘要类型', required: false }
        ],
        outputs: [
          { name: 'summary', type: 'document', description: '摘要文档' },
          { name: 'keyFindings', type: 'array', description: '关键发现' },
          { name: 'timeline', type: 'chart', description: '健康时间线' }
        ],
        compliance: ['HIPAA', 'GDPR', 'HL7 FHIR'],
        version: '1.2.0',
        author: 'system',
        rating: 4.6,
        downloads: 1450,
        tags: ['健康档案', '摘要', 'EHR', 'FHIR']
      },
      {
        id: 'appointment-scheduler',
        name: '智能预约排班',
        nameEn: 'Smart Appointment Scheduler',
        category: 'telemedicine',
        description: '优化医疗预约时间和资源分配',
        inputs: [
          { name: 'availability', type: 'array', description: '可用时间', required: true },
          { name: 'preferences', type: 'object', description: '偏好设置', required: false }
        ],
        outputs: [
          { name: 'schedule', type: 'array', description: '预约安排' },
          { name: 'conflicts', type: 'array', description: '冲突提醒' },
          { name: 'optimization', type: 'object', description: '优化建议' }
        ],
        compliance: ['HIPAA', 'GDPR'],
        version: '1.0.0',
        author: 'system',
        rating: 4.5,
        downloads: 1100,
        tags: ['预约', '排班', '调度', '优化']
      },
      {
        id: 'insurance-claim',
        name: '保险理赔分析',
        nameEn: 'Insurance Claim Analysis',
        category: 'insurance',
        description: '自动化保险理赔审核和欺诈检测',
        inputs: [
          { name: 'claim', type: 'object', description: '理赔申请', required: true },
          { name: 'policy', type: 'object', description: '保单信息', required: true }
        ],
        outputs: [
          { name: 'decision', type: 'string', description: '审核决定' },
          { name: 'fraudScore', type: 'number', description: '欺诈风险评分' },
          { name: 'reasoning', type: 'array', description: '审核理由' }
        ],
        compliance: ['HIPAA', 'HI-TECH', 'State Insurance Laws'],
        version: '1.8.0',
        author: 'system',
        rating: 4.7,
        downloads: 1890,
        tags: ['保险', '理赔', '欺诈检测', '审核']
      }
    ];

    for (const skill of healthcareSkills) {
      this._registerSkill('healthcare', skill);
    }

    // Healthcare templates
    this._registerTemplate('healthcare', {
      id: 'patient-workup',
      name: '患者初诊工作流',
      description: '完整的患者初诊评估流程',
      steps: ['symptom-checker', 'medical-image-analysis', 'health-record-summary'],
      duration: 45,
      outputFormat: 'pdf'
    });

    this._registerTemplate('healthcare', {
      id: 'medication-review',
      name: '用药复查工作流',
      description: '定期药物复查和调整建议',
      steps: ['health-record-summary', 'drug-interaction', 'appointment-scheduler'],
      duration: 20,
      outputFormat: 'document'
    });

    // Initialize Legal domain skills
    this._initializeLegalSkills();
    
    // Initialize Manufacturing domain skills
    this._initializeManufacturingSkills();
    
    // Initialize Education domain skills
    this._initializeEducationSkills();
    
    // Initialize Retail domain skills
    this._initializeRetailSkills();
  }

  /**
   * Initialize Legal domain skills
   */
  _initializeLegalSkills() {
    const legalSkills = [
      {
        id: 'contract-review',
        name: '合同智能审查',
        nameEn: 'Contract Intelligence Review',
        category: 'contract-review',
        description: '基于AI自动审查合同条款，识别风险点并提供修改建议',
        inputs: [
          { name: 'contract', type: 'file', description: '合同文件(PDF/Word)', required: true },
          { name: 'contractType', type: 'string', description: '合同类型', required: true },
          { name: 'riskLevel', type: 'string', description: '风险偏好', required: false }
        ],
        outputs: [
          { name: 'riskReport', type: 'pdf', description: '风险评估报告' },
          { name: 'clauseAnalysis', type: 'array', description: '条款分析结果' },
          { name: 'suggestions', type: 'array', description: '修改建议' }
        ],
        compliance: ['GDPR', 'CCPA', 'SOX'],
        version: '2.1.0',
        author: 'system',
        rating: 4.8,
        downloads: 2100,
        tags: ['合同', '审查', '风险', '法务']
      },
      {
        id: 'legal-research',
        name: '法律智能检索',
        nameEn: 'Legal Research Assistant',
        category: 'legal-research',
        description: '快速检索法律法规、司法解释和判例',
        inputs: [
          { name: 'query', type: 'string', description: '法律问题', required: true },
          { name: 'jurisdiction', type: 'string', description: '管辖区域', required: false },
          { name: 'caseTypes', type: 'array', description: '案例类型', required: false }
        ],
        outputs: [
          { name: 'laws', type: 'array', description: '相关法律条文' },
          { name: 'cases', type: 'array', description: '相关判例' },
          { name: 'analysis', type: 'document', description: '法律分析' }
        ],
        compliance: ['GDPR', 'Attorney-Client Privilege'],
        version: '1.5.0',
        author: 'system',
        rating: 4.7,
        downloads: 1850,
        tags: ['法律', '检索', '判例', '法规']
      },
      {
        id: 'compliance-check',
        name: '合规自动检查',
        nameEn: 'Automated Compliance Check',
        category: 'compliance',
        description: '自动检查企业运营是否符合各类法规要求',
        inputs: [
          { name: 'companyData', type: 'object', description: '企业数据', required: true },
          { name: 'regulations', type: 'array', description: '目标法规', required: true }
        ],
        outputs: [
          { name: 'complianceReport', type: 'pdf', description: '合规报告' },
          { name: 'violations', type: 'array', description: '违规项' },
          { name: 'recommendations', type: 'array', description: '整改建议' }
        ],
        compliance: ['GDPR', 'SOX', 'AML', 'FCPA', 'PCI-DSS'],
        version: '1.8.0',
        author: 'system',
        rating: 4.9,
        downloads: 3200,
        tags: ['合规', '检查', '审计', '监管']
      },
      {
        id: 'ip-protection',
        name: '知识产权保护',
        nameEn: 'IP Protection Analysis',
        category: 'ip-protection',
        description: '分析商标、专利、版权侵权风险并提供保护策略',
        inputs: [
          { name: 'ipType', type: 'string', description: '知识产权类型', required: true },
          { name: 'content', type: 'file', description: '待分析内容', required: true }
        ],
        outputs: [
          { name: 'riskAssessment', type: 'object', description: '风险评估' },
          { name: 'protectionPlan', type: 'document', description: '保护方案' },
          { name: 'infringementReport', type: 'pdf', description: '侵权分析报告' }
        ],
        compliance: ['DMCA', 'TRIPS', 'Local IP Laws'],
        version: '1.3.0',
        author: 'system',
        rating: 4.6,
        downloads: 1450,
        tags: ['知识产权', '商标', '专利', '版权']
      },
      {
        id: 'case-analysis',
        name: '案件智能分析',
        nameEn: 'Case Intelligence Analysis',
        category: 'case-analysis',
        description: '分析案件材料，预测案件走向并生成诉讼策略',
        inputs: [
          { name: 'caseMaterials', type: 'array', description: '案件材料', required: true },
          { name: 'caseType', type: 'string', description: '案件类型', required: true }
        ],
        outputs: [
          { name: 'analysis', type: 'document', description: '案件分析报告' },
          { name: 'strategy', type: 'array', description: '诉讼策略' },
          { name: 'outcomePrediction', type: 'object', description: '结果预测' }
        ],
        compliance: ['Attorney-Client Privilege', 'Work Product Doctrine'],
        version: '2.0.0',
        author: 'system',
        rating: 4.5,
        downloads: 980,
        tags: ['案件', '诉讼', '策略', '分析']
      },
      {
        id: 'document-drafting',
        name: '法律文书起草',
        nameEn: 'Legal Document Drafting',
        category: 'contract-review',
        description: '自动生成各类法律文书，包括起诉状、答辩状、合同等',
        inputs: [
          { name: 'documentType', type: 'string', description: '文书类型', required: true },
          { name: 'caseFacts', type: 'object', description: '案件事实', required: true },
          { name: 'template', type: 'string', description: '模板选择', required: false }
        ],
        outputs: [
          { name: 'document', type: 'document', description: '法律文书' },
          { name: 'citations', type: 'array', description: '引用法条' },
          { name: 'formatCheck', type: 'object', description: '格式检查' }
        ],
        compliance: ['Court Filing Standards', 'Local Rules'],
        version: '1.6.0',
        author: 'system',
        rating: 4.7,
        downloads: 1680,
        tags: ['文书', '起草', '合同', '起诉状']
      }
    ];

    for (const skill of legalSkills) {
      this._registerSkill('legal', skill);
    }

    // Legal templates
    this._registerTemplate('legal', {
      id: 'm-and-a-review',
      name: '并购尽职调查',
      description: '完整的并购交易尽职调查流程',
      steps: ['contract-review', 'compliance-check', 'ip-protection'],
      duration: 60,
      outputFormat: 'pdf'
    });

    this._registerTemplate('legal', {
      id: 'litigation-workflow',
      name: '诉讼工作流',
      description: '从立案到判决的完整诉讼支持',
      steps: ['case-analysis', 'legal-research', 'document-drafting'],
      duration: 45,
      outputFormat: 'document'
    });
  }

  /**
   * Initialize Manufacturing domain skills
   */
  _initializeManufacturingSkills() {
    const manufacturingSkills = [
      {
        id: 'quality-control',
        name: '质量缺陷检测',
        nameEn: 'Quality Defect Detection',
        category: 'quality-control',
        description: '基于机器视觉自动检测产品缺陷，提高质检效率',
        inputs: [
          { name: 'image', type: 'file', description: '产品图像', required: true },
          { name: 'productType', type: 'string', description: '产品类型', required: true },
          { name: 'defectTypes', type: 'array', description: '缺陷类型', required: false }
        ],
        outputs: [
          { name: 'defectReport', type: 'pdf', description: '缺陷检测报告' },
          { name: 'annotations', type: 'image', description: '标注图像' },
          { name: 'classification', type: 'object', description: '缺陷分类' }
        ],
        compliance: ['ISO 9001', 'IATF 16949', 'FDA'],
        version: '2.2.0',
        author: 'system',
        rating: 4.9,
        downloads: 4500,
        tags: ['质检', '缺陷', '机器视觉', 'AI']
      },
      {
        id: 'predictive-maintenance',
        name: '预测性维护',
        nameEn: 'Predictive Maintenance',
        category: 'predictive-maintenance',
        description: '基于设备运行数据预测故障，减少非计划停机',
        inputs: [
          { name: 'sensorData', type: 'array', description: '传感器数据', required: true },
          { name: 'equipmentId', type: 'string', description: '设备ID', required: true },
          { name: 'historyData', type: 'array', description: '历史数据', required: false }
        ],
        outputs: [
          { name: 'healthScore', type: 'number', description: '健康评分' },
          { name: 'failurePrediction', type: 'object', description: '故障预测' },
          { name: 'maintenancePlan', type: 'document', description: '维护计划' }
        ],
        compliance: ['ISO 55000', 'IEC 61850'],
        version: '1.9.0',
        author: 'system',
        rating: 4.8,
        downloads: 3800,
        tags: ['维护', '预测', '设备', 'IoT']
      },
      {
        id: 'supply-chain-optimization',
        name: '供应链优化',
        nameEn: 'Supply Chain Optimization',
        category: 'supply-chain',
        description: '优化供应链调度，降低库存成本，提高交付效率',
        inputs: [
          { name: 'orders', type: 'array', description: '订单数据', required: true },
          { name: 'inventory', type: 'object', description: '库存数据', required: true },
          { name: 'constraints', type: 'object', description: '约束条件', required: false }
        ],
        outputs: [
          { name: 'schedule', type: 'spreadsheet', description: '调度计划' },
          { name: 'costAnalysis', type: 'pdf', description: '成本分析' },
          { name: 'optimizationReport', type: 'document', description: '优化报告' }
        ],
        compliance: ['ISO 28000', 'C-TPAT'],
        version: '2.0.0',
        author: 'system',
        rating: 4.7,
        downloads: 2900,
        tags: ['供应链', '优化', '调度', '物流']
      },
      {
        id: 'process-optimization',
        name: '工艺参数优化',
        nameEn: 'Process Parameter Optimization',
        category: 'process-optimization',
        description: '基于历史数据优化生产工艺参数，提升良率',
        inputs: [
          { name: 'processData', type: 'array', description: '工艺数据', required: true },
          { name: 'targetMetrics', type: 'object', description: '目标指标', required: true }
        ],
        outputs: [
          { name: 'optimalParams', type: 'object', description: '最优参数' },
          { name: 'simulation', type: 'document', description: '仿真结果' },
          { name: 'improvementPlan', type: 'pdf', description: '改进方案' }
        ],
        compliance: ['ISO 9001', 'Lean Manufacturing'],
        version: '1.7.0',
        author: 'system',
        rating: 4.6,
        downloads: 2100,
        tags: ['工艺', '优化', '良率', '参数']
      },
      {
        id: 'inventory-forecast',
        name: '智能库存预测',
        nameEn: 'Smart Inventory Forecasting',
        category: 'inventory',
        description: 'AI驱动的库存需求预测，优化库存水平',
        inputs: [
          { name: 'historicalSales', type: 'array', description: '历史销售', required: true },
          { name: 'currentStock', type: 'object', description: '当前库存', required: true },
          { name: 'seasonality', type: 'object', description: '季节性因素', required: false }
        ],
        outputs: [
          { name: 'forecast', type: 'spreadsheet', description: '需求预测' },
          { name: 'reorderAlerts', type: 'array', description: '补货提醒' },
          { name: 'optimization', type: 'pdf', description: '优化建议' }
        ],
        compliance: ['ISO 22716', 'GMP'],
        version: '1.5.0',
        author: 'system',
        rating: 4.5,
        downloads: 1850,
        tags: ['库存', '预测', '需求', '补货']
      },
      {
        id: 'root-cause-analysis',
        name: '根因分析',
        nameEn: 'Root Cause Analysis',
        category: 'quality-control',
        description: '运用5Why、鱼骨图等方法自动分析质量问题根因',
        inputs: [
          { name: 'problemDescription', type: 'string', description: '问题描述', required: true },
          { name: 'relatedData', type: 'array', description: '相关数据', required: true }
        ],
        outputs: [
          { name: 'causeAnalysis', type: 'document', description: '原因分析' },
          { name: 'fishboneDiagram', type: 'image', description: '鱼骨图' },
          { name: 'solutions', type: 'array', description: '解决方案' }
        ],
        compliance: ['ISO 9001', 'Six Sigma'],
        version: '1.4.0',
        author: 'system',
        rating: 4.8,
        downloads: 2400,
        tags: ['根因', '分析', '质量', '改进']
      }
    ];

    for (const skill of manufacturingSkills) {
      this._registerSkill('manufacturing', skill);
    }

    // Manufacturing templates
    this._registerTemplate('manufacturing', {
      id: 'quality-inspection',
      name: '智能质检流程',
      description: '从图像采集到缺陷分析的完整质检流程',
      steps: ['quality-control', 'root-cause-analysis'],
      duration: 30,
      outputFormat: 'pdf'
    });

    this._registerTemplate('manufacturing', {
      id: 'maintenance-workflow',
      name: '预测性维护工作流',
      description: '从设备监测到维护计划的全流程',
      steps: ['predictive-maintenance', 'inventory-forecast'],
      duration: 40,
      outputFormat: 'document'
    });
  }

  /**
   * Initialize Education domain skills
   */
  _initializeEducationSkills() {
    const educationSkills = [
      {
        id: 'smart-lesson-planning',
        name: '智能备课助手',
        nameEn: 'Smart Lesson Planning Assistant',
        category: 'lesson-planning',
        description: '根据教学大纲和学情分析自动生成教案',
        inputs: [
          { name: 'topic', type: 'string', description: '教学主题', required: true },
          { name: 'gradeLevel', type: 'string', description: '年级', required: true },
          { name: 'learningObjectives', type: 'array', description: '学习目标', required: false }
        ],
        outputs: [
          { name: 'lessonPlan', type: 'document', description: '教案文档' },
          { name: 'slides', type: 'presentation', description: '教学PPT' },
          { name: 'resources', type: 'array', description: '教学资源' }
        ],
        compliance: ['FERPA', 'COPPA', 'GDPR'],
        version: '2.0.0',
        author: 'system',
        rating: 4.8,
        downloads: 5200,
        tags: ['备课', '教案', '教学', '课件']
      },
      {
        id: 'smart-grading',
        name: '智能作业批改',
        nameEn: 'AI-Powered Assignment Grading',
        category: 'grading',
        description: '自动批改客观题和主观题，提供详细反馈',
        inputs: [
          { name: 'answers', type: 'array', description: '学生答案', required: true },
          { name: 'rubric', type: 'object', description: '评分标准', required: true },
          { name: 'questionTypes', type: 'array', description: '题目类型', required: false }
        ],
        outputs: [
          { name: 'grades', type: 'spreadsheet', description: '成绩单' },
          { name: 'feedback', type: 'array', description: '个性化反馈' },
          { name: 'analysis', type: 'pdf', description: '答题分析' }
        ],
        compliance: ['FERPA', 'GDPR'],
        version: '1.8.0',
        author: 'system',
        rating: 4.9,
        downloads: 6800,
        tags: ['批改', '作业', '评分', '反馈']
      },
      {
        id: 'learning-analytics',
        name: '学习分析仪表盘',
        nameEn: 'Learning Analytics Dashboard',
        category: 'learning-analytics',
        description: '全面分析学生学习行为，提供个性化学习建议',
        inputs: [
          { name: 'studentData', type: 'object', description: '学生学习数据', required: true },
          { name: 'metrics', type: 'array', description: '分析指标', required: false }
        ],
        outputs: [
          { name: 'dashboard', type: 'pdf', description: '分析仪表盘' },
          { name: 'insights', type: 'array', description: '学习洞察' },
          { name: 'interventions', type: 'array', description: '干预建议' }
        ],
        compliance: ['FERPA', 'GDPR', 'COPPA'],
        version: '2.1.0',
        author: 'system',
        rating: 4.7,
        downloads: 4100,
        tags: ['学习', '分析', '数据', '洞察']
      },
      {
        id: 'course-recommendation',
        name: '课程智能推荐',
        nameEn: 'Course Recommendation Engine',
        category: 'course-recommendation',
        description: '基于学生画像和学习历史推荐最适合的课程',
        inputs: [
          { name: 'studentProfile', type: 'object', description: '学生画像', required: true },
          { name: 'availableCourses', type: 'array', description: '可选课程', required: true }
        ],
        outputs: [
          { name: 'recommendations', type: 'array', description: '课程推荐' },
          { name: 'reasoning', type: 'array', description: '推荐理由' },
          { name: 'pathway', type: 'document', description: '学习路径' }
        ],
        compliance: ['FERPA', 'GDPR'],
        version: '1.6.0',
        author: 'system',
        rating: 4.6,
        downloads: 3500,
        tags: ['推荐', '课程', '个性化', '学习路径']
      },
      {
        id: 'student-assessment',
        name: '学生综合评估',
        nameEn: 'Comprehensive Student Assessment',
        category: 'student-assessment',
        description: '多维度评估学生能力，生成综合素质报告',
        inputs: [
          { name: 'assessmentData', type: 'object', description: '评估数据', required: true },
          { name: 'assessmentType', type: 'string', description: '评估类型', required: true }
        ],
        outputs: [
          { name: 'assessmentReport', type: 'pdf', description: '评估报告' },
          { name: 'strengths', type: 'array', description: '优势领域' },
          { name: 'developmentPlan', type: 'document', description: '发展计划' }
        ],
        compliance: ['FERPA', 'GDPR', 'State Education Standards'],
        version: '1.5.0',
        author: 'system',
        rating: 4.5,
        downloads: 2800,
        tags: ['评估', '学生', '报告', '综合素质']
      },
      {
        id: 'exam-generator',
        name: '智能出题系统',
        nameEn: 'AI Exam Generator',
        category: 'grading',
        description: '根据知识点和难度自动生成多样化试题',
        inputs: [
          { name: 'topics', type: 'array', description: '知识点', required: true },
          { name: 'difficulty', type: 'string', description: '难度等级', required: true },
          { name: 'questionCount', type: 'number', description: '题目数量', required: true }
        ],
        outputs: [
          { name: 'exam', type: 'document', description: '试卷文档' },
          { name: 'answerKey', type: 'document', description: '答案解析' },
          { name: 'rubric', type: 'document', description: '评分细则' }
        ],
        compliance: ['FERPA', 'Academic Integrity Standards'],
        version: '1.7.0',
        author: 'system',
        rating: 4.8,
        downloads: 4200,
        tags: ['出题', '试卷', '考试', '题库']
      }
    ];

    for (const skill of educationSkills) {
      this._registerSkill('education', skill);
    }

    // Education templates
    this._registerTemplate('education', {
      id: 'personalized-learning',
      name: '个性化学习方案',
      description: '从学情分析到学习路径的完整方案',
      steps: ['learning-analytics', 'course-recommendation', 'student-assessment'],
      duration: 35,
      outputFormat: 'pdf'
    });

    this._registerTemplate('education', {
      id: 'exam-workflow',
      name: '考试全流程',
      description: '从出题到成绩分析的完整考试流程',
      steps: ['exam-generator', 'smart-grading', 'learning-analytics'],
      duration: 50,
      outputFormat: 'document'
    });
  }

  /**
   * Initialize Retail domain skills
   */
  _initializeRetailSkills() {
    const retailSkills = [
      {
        id: 'product-recommendation',
        name: '智能商品推荐',
        nameEn: 'Smart Product Recommendation',
        category: 'recommendation',
        description: '基于用户行为和偏好提供个性化商品推荐',
        inputs: [
          { name: 'userId', type: 'string', description: '用户ID', required: true },
          { name: 'context', type: 'object', description: '上下文信息', required: false }
        ],
        outputs: [
          { name: 'recommendations', type: 'array', description: '商品推荐列表' },
          { name: 'scores', type: 'array', description: '推荐分数' },
          { name: 'explainability', type: 'array', description: '推荐理由' }
        ],
        compliance: ['PCI-DSS', 'GDPR', 'CCPA'],
        version: '2.2.0',
        author: 'system',
        rating: 4.9,
        downloads: 8500,
        tags: ['推荐', '商品', '个性化', '用户']
      },
      {
        id: 'demand-forecast',
        name: '需求预测系统',
        nameEn: 'Demand Forecasting System',
        category: 'demand-forecast',
        description: 'AI驱动的商品需求预测，优化库存和采购',
        inputs: [
          { name: 'historicalSales', type: 'array', description: '历史销售数据', required: true },
          { name: 'externalFactors', type: 'object', description: '外部因素', required: false }
        ],
        outputs: [
          { name: 'forecast', type: 'spreadsheet', description: '需求预测' },
          { name: 'confidence', type: 'array', description: '置信区间' },
          { name: 'recommendations', type: 'array', description: '运营建议' }
        ],
        compliance: ['PCI-DSS', 'SOX'],
        version: '1.9.0',
        author: 'system',
        rating: 4.7,
        downloads: 5200,
        tags: ['预测', '需求', '库存', '采购']
      },
      {
        id: 'dynamic-pricing',
        name: '动态定价引擎',
        nameEn: 'Dynamic Pricing Engine',
        category: 'pricing',
        description: '基于市场供需和竞争分析实时调整价格',
        inputs: [
          { name: 'productId', type: 'string', description: '商品ID', required: true },
          { name: 'marketData', type: 'object', description: '市场数据', required: true }
        ],
        outputs: [
          { name: 'optimalPrice', type: 'number', description: '最优价格' },
          { name: 'priceRange', type: 'object', description: '价格区间' },
          { name: 'competitorAnalysis', type: 'document', description: '竞争分析' }
        ],
        compliance: ['Price Discrimination Laws', 'FTC Regulations'],
        version: '2.1.0',
        author: 'system',
        rating: 4.8,
        downloads: 4100,
        tags: ['定价', '动态', '价格', '竞争']
      },
      {
        id: 'customer-segmentation',
        name: '客户分群分析',
        nameEn: 'Customer Segmentation Analysis',
        category: 'customer-analytics',
        description: '基于消费行为对客户进行分群，制定差异化策略',
        inputs: [
          { name: 'customerData', type: 'array', description: '客户数据', required: true },
          { name: 'segmentCriteria', type: 'object', description: '分群标准', required: false }
        ],
        outputs: [
          { name: 'segments', type: 'array', description: '客户分群' },
          { name: 'profiles', type: 'array', description: '群体画像' },
          { name: 'strategies', type: 'array', description: '营销策略' }
        ],
        compliance: ['GDPR', 'CCPA', 'PCI-DSS'],
        version: '1.6.0',
        author: 'system',
        rating: 4.6,
        downloads: 3800,
        tags: ['客户', '分群', '画像', '营销']
      },
      {
        id: 'inventory-optimization',
        name: '库存智能优化',
        nameEn: 'Smart Inventory Optimization',
        category: 'inventory',
        description: '优化库存水平，减少积压和缺货',
        inputs: [
          { name: 'inventoryData', type: 'object', description: '库存数据', required: true },
          { name: 'salesForecast', type: 'array', description: '销售预测', required: true }
        ],
        outputs: [
          { name: 'optimization', type: 'spreadsheet', description: '优化方案' },
          { name: 'reorderPlan', type: 'array', description: '补货计划' },
          { name: 'costSaving', type: 'object', description: '成本节约' }
        ],
        compliance: ['SOX', 'Inventory Accounting Standards'],
        version: '1.8.0',
        author: 'system',
        rating: 4.5,
        downloads: 3200,
        tags: ['库存', '优化', '补货', '成本']
      },
      {
        id: 'churn-prediction',
        name: '客户流失预测',
        nameEn: 'Customer Churn Prediction',
        category: 'customer-analytics',
        description: '预测客户流失风险，提前采取挽留措施',
        inputs: [
          { name: 'customerBehavior', type: 'array', description: '客户行为数据', required: true },
          { name: 'subscriptionData', type: 'object', description: '订阅数据', required: true }
        ],
        outputs: [
          { name: 'churnRisk', type: 'array', description: '流失风险评分' },
          { name: 'riskFactors', type: 'array', description: '风险因素' },
          { name: 'retentionPlans', type: 'array', description: '挽留方案' }
        ],
        compliance: ['GDPR', 'CCPA'],
        version: '1.5.0',
        author: 'system',
        rating: 4.7,
        downloads: 4500,
        tags: ['流失', '预测', '挽留', '客户']
      }
    ];

    for (const skill of retailSkills) {
      this._registerSkill('retail', skill);
    }

    // Retail templates
    this._registerTemplate('retail', {
      id: 'personalized-marketing',
      name: '个性化营销方案',
      description: '从客户分析到精准营销的完整流程',
      steps: ['customer-segmentation', 'product-recommendation', 'churn-prediction'],
      duration: 40,
      outputFormat: 'pdf'
    });

    this._registerTemplate('retail', {
      id: 'inventory-management',
      name: '智能库存管理',
      description: '从需求预测到库存优化的完整流程',
      steps: ['demand-forecast', 'inventory-optimization', 'dynamic-pricing'],
      duration: 35,
      outputFormat: 'spreadsheet'
    });
  }

  /**
   * Register skill to domain
   */
  _registerSkill(domainId, skill) {
    skill.id = `${domainId}-${skill.id}`;
    
    this.skills.set(skill.id, {
      ...skill,
      domainId,
      registeredAt: Date.now(),
      lastUpdated: Date.now(),
      status: 'active',
      metrics: {
        successRate: 0,
        avgResponseTime: 0,
        usageCount: 0,
        satisfactionScore: 0
      }
    });

    const domain = this.domains.get(domainId);
    if (domain) {
      domain.skills.push(skill.id);
      domain.stats.totalSkills = domain.skills.length;
    }
  }

  /**
   * Register template to domain
   */
  _registerTemplate(domainId, template) {
    template.id = `${domainId}-${template.id}`;
    
    this.templates.set(template.id, {
      ...template,
      domainId,
      registeredAt: Date.now(),
      usageCount: 0,
      rating: 0
    });

    const domain = this.domains.get(domainId);
    if (domain) {
      domain.templates.push(template.id);
    }
  }

  /**
   * Get all domains
   */
  getDomains() {
    return Array.from(this.domains.values()).map(domain => ({
      ...domain,
      skills: undefined,
      templates: undefined,
      skillsCount: domain.skills.length,
      templatesCount: domain.templates.length
    }));
  }

  /**
   * Get domain by ID
   */
  getDomain(domainId) {
    return this.domains.get(domainId);
  }

  /**
   * Get skills by domain
   */
  getDomainSkills(domainId, options = {}) {
    const domain = this.domains.get(domainId);
    if (!domain) return [];

    const { category, search, sort = 'rating', limit = 50 } = options;
    
    let skills = domain.skills
      .map(id => this.skills.get(id))
      .filter(s => s && s.status === 'active');

    if (category) {
      skills = skills.filter(s => s.category === category);
    }

    if (search) {
      const lowerSearch = search.toLowerCase();
      skills = skills.filter(s => 
        s.name.toLowerCase().includes(lowerSearch) ||
        s.description.toLowerCase().includes(lowerSearch) ||
        s.tags.some(t => t.toLowerCase().includes(lowerSearch))
      );
    }

    // Sort
    switch (sort) {
      case 'rating':
        skills.sort((a, b) => b.rating - a.rating);
        break;
      case 'downloads':
        skills.sort((a, b) => b.downloads - a.downloads);
        break;
      case 'newest':
        skills.sort((a, b) => b.registeredAt - a.registeredAt);
        break;
      case 'name':
        skills.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return skills.slice(0, limit);
  }

  /**
   * Get skill by ID
   */
  getSkill(skillId) {
    return this.skills.get(skillId);
  }

  /**
   * Get templates by domain
   */
  getDomainTemplates(domainId) {
    const domain = this.domains.get(domainId);
    if (!domain) return [];

    return domain.templates
      .map(id => this.templates.get(id))
      .filter(t => t);
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId) {
    return this.templates.get(templateId);
  }

  /**
   * Search across all domains
   */
  search(query, options = {}) {
    const { domains, limit = 20 } = options;
    
    let allSkills = [];
    
    for (const [skillId, skill] of this.skills) {
      if (domains && !domains.includes(skill.domainId)) continue;
      
      const lowerQuery = query.toLowerCase();
      const matchScore = this._calculateMatchScore(skill, query);
      
      if (matchScore > 0) {
        allSkills.push({
          ...skill,
          matchScore
        });
      }
    }

    allSkills.sort((a, b) => b.matchScore - a.matchScore);
    return allSkills.slice(0, limit);
  }

  /**
   * Calculate match score for search
   */
  _calculateMatchScore(skill, query) {
    const lowerQuery = query.toLowerCase();
    let score = 0;

    if (skill.name.toLowerCase().includes(lowerQuery)) score += 0.5;
    if (skill.nameEn.toLowerCase().includes(lowerQuery)) score += 0.4;
    if (skill.description.toLowerCase().includes(lowerQuery)) score += 0.3;
    if (skill.tags.some(t => t.toLowerCase().includes(lowerQuery))) score += 0.2;

    return score;
  }

  /**
   * Update skill metrics
   */
  updateSkillMetrics(skillId, metrics) {
    const skill = this.skills.get(skillId);
    if (!skill) return;

    if (metrics.successRate !== undefined) {
      skill.metrics.successRate = metrics.successRate;
    }
    if (metrics.avgResponseTime !== undefined) {
      skill.metrics.avgResponseTime = metrics.avgResponseTime;
    }
    if (metrics.usageCount !== undefined) {
      skill.metrics.usageCount = metrics.usageCount;
    }
    if (metrics.satisfactionScore !== undefined) {
      skill.metrics.satisfactionScore = metrics.satisfactionScore;
    }

    skill.lastUpdated = Date.now();
  }

  /**
   * Record skill usage
   */
  recordUsage(skillId, usageData) {
    const skill = this.skills.get(skillId);
    if (!skill) return;

    skill.metrics.usageCount++;
    
    if (usageData.success !== undefined) {
      const total = skill.metrics.usageCount;
      const currentSuccess = skill.metrics.successRate * (total - 1);
      skill.metrics.successRate = (currentSuccess + (usageData.success ? 1 : 0)) / total;
    }

    if (usageData.responseTime !== undefined) {
      const total = skill.metrics.usageCount;
      const currentTotal = skill.metrics.avgResponseTime * (total - 1);
      skill.metrics.avgResponseTime = (currentTotal + usageData.responseTime) / total;
    }

    // Update domain stats
    const domain = this.domains.get(skill.domainId);
    if (domain) {
      domain.stats.totalDownloads++;
    }
  }

  /**
   * Get domain statistics
   */
  getDomainStats(domainId) {
    const domain = this.domains.get(domainId);
    if (!domain) return null;

    const skills = domain.skills.map(id => this.skills.get(id)).filter(s => s);
    
    return {
      domain: {
        id: domain.id,
        name: domain.name,
        nameEn: domain.nameEn,
        icon: domain.icon
      },
      skillsCount: skills.length,
      totalDownloads: skills.reduce((sum, s) => sum + s.downloads, 0),
      totalUsage: skills.reduce((sum, s) => sum + s.metrics.usageCount, 0),
      averageRating: skills.length > 0 
        ? skills.reduce((sum, s) => sum + s.rating, 0) / skills.length 
        : 0,
      averageSuccessRate: skills.length > 0
        ? skills.reduce((sum, s) => sum + s.metrics.successRate, 0) / skills.length
        : 0,
      averageResponseTime: skills.length > 0
        ? skills.reduce((sum, s) => sum + s.metrics.avgResponseTime, 0) / skills.length
        : 0,
      topSkills: skills
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 5)
        .map(s => ({ id: s.id, name: s.name, rating: s.rating, downloads: s.downloads }))
    };
  }

  /**
   * Get compliance info for domain
   */
  getComplianceInfo(domainId) {
    const domain = this.domains.get(domainId);
    if (!domain) return null;

    return {
      regulations: domain.compliance,
      certifications: domain.certifications,
      requirements: this._getComplianceRequirements(domainId)
    };
  }

  /**
   * Get compliance requirements (placeholder)
   */
  _getComplianceRequirements(domainId) {
    const requirements = {
      finance: [
        { regulation: 'SEC', description: '证券交易委员会规定', penalty: '民事/刑事处罚' },
        { regulation: 'FINRA', description: '金融业监管局规定', penalty: '罚款/吊销执照' },
        { regulation: 'SOX', description: '萨班斯-奥克斯利法案', penalty: '重大罚款' }
      ],
      healthcare: [
        { regulation: 'HIPAA', description: '健康保险流通与责任法案', penalty: '最高150万美元/违规' },
        { regulation: 'FDA', description: '食品药品监督管理局规定', penalty: '产品召回/罚款' },
        { regulation: 'GDPR', description: '通用数据保护条例', penalty: '最高2000万欧元或4%营业额' }
      ]
    };

    return requirements[domainId] || [];
  }
}

module.exports = { VerticalDomainMarket };