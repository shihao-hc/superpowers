/**
 * Industry Solutions Package
 * Pre-configured skill bundles for specific industry verticals
 */

class IndustrySolutions {
  constructor() {
    this.solutions = new Map();
    this._initializeSolutions();
  }

  _initializeSolutions() {
    // Bank Smart Compliance Assistant
    this.solutions.set('bank-compliance', {
      id: 'bank-compliance',
      name: '银行智能合规助手',
      nameEn: 'Bank Smart Compliance Assistant',
      description: '一站式银行合规解决方案，覆盖反洗钱、KYC、交易监控、监管报告',
      icon: '🏦',
      color: '#1e40af',
      category: 'banking',
      targetCustomers: ['商业银行', '投资银行', '保险机构'],
      skills: [
        'aml-transaction-monitor',
        'kyc-customer-verification',
        'regulatory-report-generator',
        'risk-assessment',
        'compliance-check',
        'audit-log-analyzer'
      ],
      workflows: [
        {
          id: 'new-customer-onboarding',
          name: '新客户开户流程',
          steps: ['kyc-customer-verification', 'aml-transaction-monitor', 'risk-assessment'],
          estimatedTime: 15
        },
        {
          id: 'quarterly-compliance-review',
          name: '季度合规审查',
          steps: ['compliance-check', 'regulatory-report-generator', 'audit-log-analyzer'],
          estimatedTime: 60
        }
      ],
      // 深化端到端解决方案
      endToEndSolutions: [
        {
          id: 'smart-credit-fullflow',
          name: '智能信贷全流程',
          description: '从进件到贷后监控的完整信贷生命周期管理',
          icon: '💳',
          stages: [
            { id: 'application', name: '进件审核', skills: ['kyc-customer-verification', 'risk-assessment'] },
            { id: 'anti-fraud', name: '反欺诈检测', skills: ['aml-transaction-monitor'] },
            { id: 'credit-scoring', name: '信用评分', skills: ['risk-assessment'] },
            { id: 'approval', name: '智能审批', skills: ['compliance-check'] },
            { id: 'disbursement', name: '放款执行', skills: ['regulatory-report-generator'] },
            { id: 'monitoring', name: '贷后监控', skills: ['aml-transaction-monitor', 'audit-log-analyzer'] }
          ],
          estimatedTime: 480,
          automationRate: '85%'
        },
        {
          id: 'cross-border-payment-compliance',
          name: '跨境支付合规助手',
          description: '自动识别制裁名单、生成监管报告、合规检查',
          icon: '🌍',
          stages: [
            { id: 'sanction-screening', name: '制裁名单筛查', skills: ['aml-transaction-monitor'] },
            { id: 'risk-evaluation', name: '风险评估', skills: ['risk-assessment'] },
            { id: 'compliance-check', name: '合规检查', skills: ['compliance-check'] },
            { id: 'report-generation', name: '监管报告', skills: ['regulatory-report-generator'] }
          ],
          estimatedTime: 30,
          automationRate: '90%'
        }
      ],
      integrations: ['Core Banking System', 'SWIFT', 'RegTech Platform'],
      roi: {
        timeSaving: '70%',
        costReduction: '40%',
        accuracyImprovement: '95%'
      }
    });

    // Hospital Clinical Decision Support
    this.solutions.set('hospital-clinical', {
      id: 'hospital-clinical',
      name: '医院临床辅助系统',
      nameEn: 'Hospital Clinical Decision Support System',
      description: 'AI驱动的临床决策支持，提升诊疗效率和质量',
      icon: '🏥',
      color: '#dc2626',
      category: 'healthcare',
      targetCustomers: ['三甲医院', '专科医院', '诊所'],
      skills: [
        'medical-image-analysis',
        'symptom-checker',
        'drug-interaction',
        'health-record-summary',
        'appointment-scheduler',
        'insurance-claim'
      ],
      workflows: [
        {
          id: 'patient-workup',
          name: '患者初诊工作流',
          steps: ['symptom-checker', 'medical-image-analysis', 'health-record-summary'],
          estimatedTime: 30
        },
        {
          id: 'medication-review',
          name: '用药复查工作流',
          steps: ['health-record-summary', 'drug-interaction', 'appointment-scheduler'],
          estimatedTime: 20
        }
      ],
      // 深化端到端解决方案
      endToEndSolutions: [
        {
          id: 'smart-hospital-patient-service',
          name: '智慧医院患者服务平台',
          description: '覆盖挂号、导诊、病历摘要、用药提醒的全流程患者服务',
          icon: '👨‍⚕️',
          stages: [
            { id: 'registration', name: '智能挂号', skills: ['appointment-scheduler'] },
            { id: 'triage', name: 'AI导诊', skills: ['symptom-checker'] },
            { id: 'diagnosis', name: '辅助诊断', skills: ['medical-image-analysis', 'health-record-summary'] },
            { id: 'medication', name: '用药管理', skills: ['drug-interaction'] },
            { id: 'followup', name: '随访管理', skills: ['appointment-scheduler'] },
            { id: 'billing', name: '医保结算', skills: ['insurance-claim'] }
          ],
          estimatedTime: 120,
          automationRate: '70%'
        },
        {
          id: 'clinical-decision-support',
          name: '临床辅助决策系统',
          description: '整合影像分析、症状检查、诊疗指南的智能诊断支持',
          icon: '🔬',
          stages: [
            { id: 'symptom-analysis', name: '症状分析', skills: ['symptom-checker'] },
            { id: 'imaging', name: '影像分析', skills: ['medical-image-analysis'] },
            { id: 'history-review', name: '病历回顾', skills: ['health-record-summary'] },
            { id: 'decision-support', name: '诊疗建议', skills: ['drug-interaction'] }
          ],
          estimatedTime: 45,
          automationRate: '60%'
        }
      ],
      integrations: ['HIS', 'PACS', 'EMR', 'LIS'],
      roi: {
        diagnosisAccuracy: '+25%',
        timeSaving: '50%',
        readmissionReduction: '30%'
      }
    });

    // Smart Factory Solution
    this.solutions.set('smart-factory', {
      id: 'smart-factory',
      name: '智能工厂解决方案',
      nameEn: 'Smart Factory Solution',
      description: '工业4.0驱动的智能制造，提升质量、效率、降低成本',
      icon: '🏭',
      color: '#f59e0b',
      category: 'manufacturing',
      targetCustomers: ['离散制造', '流程工业', '汽车零部件'],
      skills: [
        'quality-control',
        'predictive-maintenance',
        'supply-chain-optimization',
        'process-optimization',
        'inventory-forecast',
        'root-cause-analysis'
      ],
      workflows: [
        {
          id: 'quality-inspection',
          name: '智能质检流程',
          steps: ['quality-control', 'root-cause-analysis'],
          estimatedTime: 10
        },
        {
          id: 'maintenance-workflow',
          name: '预测性维护工作流',
          steps: ['predictive-maintenance', 'inventory-forecast'],
          estimatedTime: 5
        }
      ],
      // 深化端到端解决方案
      endToEndSolutions: [
        {
          id: 'digital-twin-production',
          name: '数字孪生生产线监控',
          description: '实时数据采集、异常预警、根因分析的全链路监控',
          icon: '🔧',
          stages: [
            { id: 'data-collection', name: '数据采集', skills: ['process-optimization'] },
            { id: 'realtime-monitor', name: '实时监控', skills: ['quality-control'] },
            { id: 'anomaly-detection', name: '异常预警', skills: ['predictive-maintenance'] },
            { id: 'root-cause', name: '根因分析', skills: ['root-cause-analysis'] },
            { id: 'optimization', name: '优化建议', skills: ['process-optimization'] }
          ],
          estimatedTime: 60,
          automationRate: '75%'
        },
        {
          id: 'supply-chain-resilience',
          name: '供应链韧性评估',
          description: '风险识别、替代供应商推荐、库存优化的供应链管理',
          icon: '📦',
          stages: [
            { id: 'risk-assessment', name: '风险识别', skills: ['supply-chain-optimization'] },
            { id: 'supplier-analysis', name: '供应商分析', skills: ['inventory-forecast'] },
            { id: 'inventory-optimization', name: '库存优化', skills: ['inventory-forecast'] },
            { id: 'contingency-plan', name: '应急预案', skills: ['supply-chain-optimization'] }
          ],
          estimatedTime: 90,
          automationRate: '65%'
        }
      ],
      integrations: ['MES', 'ERP', 'SCADA', 'IoT Platform'],
      roi: {
        qualityRate: '+15%',
        downtimeReduction: '60%',
        energySaving: '20%'
      }
    });

    // Smart School Solution
    this.solutions.set('smart-school', {
      id: 'smart-school',
      name: '智慧校园解决方案',
      nameEn: 'Smart Campus Solution',
      description: '教育信息化升级，提升教学质量和学习效果',
      icon: '🏫',
      color: '#3b82f6',
      category: 'education',
      targetCustomers: ['K12学校', '高等院校', '培训机构'],
      skills: [
        'smart-lesson-planning',
        'smart-grading',
        'learning-analytics',
        'course-recommendation',
        'student-assessment',
        'exam-generator'
      ],
      workflows: [
        {
          id: 'personalized-learning',
          name: '个性化学习方案',
          steps: ['learning-analytics', 'course-recommendation', 'student-assessment'],
          estimatedTime: 5
        },
        {
          id: 'exam-workflow',
          name: '考试全流程',
          steps: ['exam-generator', 'smart-grading', 'learning-analytics'],
          estimatedTime: 120
        }
      ],
      integrations: ['LMS', 'SIS', 'Video Platform', 'Smart Classroom'],
      roi: {
        teacherEfficiency: '+40%',
        studentEngagement: '+35%',
        passRate: '+20%'
      }
    });

    // Legal Practice Solution
    this.solutions.set('legal-practice', {
      id: 'legal-practice',
      name: '智慧律所解决方案',
      nameEn: 'Smart Law Firm Solution',
      description: '法律科技赋能，提升律师工作效率和案件胜率',
      icon: '⚖️',
      color: '#7c3aed',
      category: 'legal',
      targetCustomers: ['律所', '企业法务', '法律科技公司'],
      skills: [
        'contract-review',
        'legal-research',
        'compliance-check',
        'ip-protection',
        'case-analysis',
        'document-drafting'
      ],
      workflows: [
        {
          id: 'm-and-a-review',
          name: '并购尽职调查',
          steps: ['contract-review', 'compliance-check', 'ip-protection'],
          estimatedTime: 120
        },
        {
          id: 'litigation-workflow',
          name: '诉讼工作流',
          steps: ['case-analysis', 'legal-research', 'document-drafting'],
          estimatedTime: 60
        }
      ],
      integrations: ['Case Management', 'Billing System', 'Court E-filing'],
      roi: {
        researchEfficiency: '+300%',
        contractReviewTime: '-70%',
        caseWinRate: '+25%'
      }
    });

    // Retail Smart Store
    this.solutions.set('retail-smart-store', {
      id: 'retail-smart-store',
      name: '智慧门店解决方案',
      nameEn: 'Smart Retail Store Solution',
      description: '新零售数字化升级，提升客户体验和销售转化',
      icon: '🛒',
      color: '#ec4899',
      category: 'retail',
      targetCustomers: ['品牌商', '零售商', '电商平台'],
      skills: [
        'product-recommendation',
        'demand-forecast',
        'dynamic-pricing',
        'customer-segmentation',
        'inventory-optimization',
        'churn-prediction'
      ],
      workflows: [
        {
          id: 'personalized-marketing',
          name: '个性化营销方案',
          steps: ['customer-segmentation', 'product-recommendation', 'churn-prediction'],
          estimatedTime: 30
        },
        {
          id: 'inventory-management',
          name: '智能库存管理',
          steps: ['demand-forecast', 'inventory-optimization', 'dynamic-pricing'],
          estimatedTime: 15
        }
      ],
      integrations: ['POS', 'CRM', 'ERP', 'Digital Signage'],
      roi: {
        salesConversion: '+30%',
        inventoryTurnover: '+25%',
        customerRetention: '+40%'
      }
    });

    // ==========================================
    // 新增行业领域
    // ==========================================

    // Smart Energy Solution
    this.solutions.set('smart-energy', {
      id: 'smart-energy',
      name: '智慧能源解决方案',
      nameEn: 'Smart Energy Solution',
      description: '能源数字化转型，提升能源效率、降低碳排放',
      icon: '⚡',
      color: '#22c55e',
      category: 'energy',
      targetCustomers: ['电网公司', '发电企业', '新能源企业', '能源服务商'],
      skills: [
        'load-forecast',
        'equipment-fault-diagnosis',
        'carbon-emission-calc',
        'energy-efficiency-opt',
        'smart-grid-scheduling',
        'renewable-forecast'
      ],
      workflows: [
        {
          id: 'energy-optimization',
          name: '能源优化调度',
          steps: ['load-forecast', 'smart-grid-scheduling', 'energy-efficiency-opt'],
          estimatedTime: 30
        },
        {
          id: 'carbon-report',
          name: '碳排放报告生成',
          steps: ['carbon-emission-calc', 'renewable-forecast', 'energy-efficiency-opt'],
          estimatedTime: 45
        }
      ],
      integrations: ['SCADA', 'EMS', 'IoT Platform', 'Carbon Trading System'],
      roi: {
        energySaving: '25%',
        carbonReduction: '30%',
        costReduction: '20%'
      }
    });

    // Smart Agriculture Solution
    this.solutions.set('smart-agriculture', {
      id: 'smart-agriculture',
      name: '智慧农业解决方案',
      nameEn: 'Smart Agriculture Solution',
      description: '精准农业技术，提升产量、降低成本、改善品质',
      icon: '🌾',
      color: '#84cc16',
      category: 'agriculture',
      targetCustomers: ['农场', '农业合作社', '农业科技公司', '政府农业部门'],
      skills: [
        'crop-yield-predict',
        'pest-disease-detect',
        'irrigation-optimize',
        'soil-analysis',
        'farm-machinery-schedule',
        'market-price-predict'
      ],
      workflows: [
        {
          id: 'precision-farming',
          name: '精准种植方案',
          steps: ['soil-analysis', 'crop-yield-predict', 'irrigation-optimize'],
          estimatedTime: 20
        },
        {
          id: 'crop-health-monitor',
          name: '作物健康监测',
          steps: ['pest-disease-detect', 'soil-analysis', 'farm-machinery-schedule'],
          estimatedTime: 15
        }
      ],
      integrations: ['Farm Management System', 'IoT Sensors', 'Drone Platform', 'Weather API'],
      roi: {
        yieldIncrease: '20%',
        waterSaving: '30%',
        laborReduction: '40%'
      }
    });

    // Government Smart Service Solution
    this.solutions.set('government-smart', {
      id: 'government-smart',
      name: '智慧政务解决方案',
      nameEn: 'Smart Government Solution',
      description: '数字政府建设，提升政务服务效率和公众满意度',
      icon: '🏛️',
      color: '#6366f1',
      category: 'government',
      targetCustomers: ['各级政府', '事业单位', '公共服务机构'],
      skills: [
        'official-doc-generator',
        'policy-sentiment-analysis',
        'budget-optimization',
        'license-approval',
        'public-safety-alert',
        'egovernment-qa'
      ],
      workflows: [
        {
          id: 'document-approval',
          name: '公文审批流程',
          steps: ['official-doc-generator', 'license-approval'],
          estimatedTime: 10
        },
        {
          id: 'policy-analysis',
          name: '政策分析报告',
          steps: ['policy-sentiment-analysis', 'budget-optimization', 'egovernment-qa'],
          estimatedTime: 60
        }
      ],
      integrations: ['OA System', 'E-filing Platform', 'Big Data Platform', 'Public Service Portal'],
      roi: {
        processingTime: '-60%',
        citizenSatisfaction: '+45%',
        costSaving: '35%'
      }
    });

    // Smart Transportation Solution
    this.solutions.set('smart-transport', {
      id: 'smart-transport',
      name: '智慧交通解决方案',
      nameEn: 'Smart Transportation Solution',
      description: '交通智能化升级，提升通行效率、保障安全',
      icon: '🚗',
      color: '#f97316',
      category: 'transportation',
      targetCustomers: ['交通管理部门', '物流企业', '出行平台', '公共交通公司'],
      skills: [
        'route-optimization',
        'traffic-flow-predict',
        'vehicle-scheduling',
        'accident-analysis',
        'logistics-tracking',
        'autonomous-driving-assist'
      ],
      workflows: [
        {
          id: 'traffic-management',
          name: '交通管理优化',
          steps: ['traffic-flow-predict', 'route-optimization', 'accident-analysis'],
          estimatedTime: 25
        },
        {
          id: 'fleet-management',
          name: '车队调度管理',
          steps: ['vehicle-scheduling', 'route-optimization', 'logistics-tracking'],
          estimatedTime: 15
        }
      ],
      integrations: ['Traffic Management System', 'GPS Platform', 'Fleet Management', 'Smart City Platform'],
      roi: {
        trafficEfficiency: '+30%',
        accidentReduction: '25%',
        fuelSaving: '15%'
      }
    });

    // Media & Entertainment Solution
    this.solutions.set('media-entertainment', {
      id: 'media-entertainment',
      name: '智慧媒体解决方案',
      nameEn: 'Smart Media & Entertainment Solution',
      description: '媒体内容智能化，提升内容生产效率和用户体验',
      icon: '🎬',
      color: '#ec4899',
      category: 'media',
      targetCustomers: ['媒体机构', '内容平台', '广告公司', 'MCN机构'],
      skills: [
        'content-tagging',
        'personalized-recommend',
        'copyright-detection',
        'sentiment-monitoring',
        'smart-video-edit',
        'danmaku-analysis'
      ],
      workflows: [
        {
          id: 'content-publishing',
          name: '内容发布流程',
          steps: ['content-tagging', 'copyright-detection', 'personalized-recommend'],
          estimatedTime: 20
        },
        {
          id: 'audience-analysis',
          name: '受众分析报告',
          steps: ['sentiment-monitoring', 'danmaku-analysis', 'personalized-recommend'],
          estimatedTime: 30
        }
      ],
      integrations: ['CMS', 'CDN', 'Analytics Platform', 'Ad Server'],
      roi: {
        contentEfficiency: '+50%',
        userEngagement: '+35%',
        adRevenue: '+25%'
      }
    });
  }

  getAllSolutions() {
    return Array.from(this.solutions.values());
  }

  getSolution(id) {
    return this.solutions.get(id);
  }

  getSolutionsByCategory(category) {
    return this.getAllSolutions().filter(s => s.category === category);
  }

  getSolutionSkills(solutionId) {
    const solution = this.solutions.get(solutionId);
    return solution ? solution.skills : [];
  }

  getSolutionWorkflows(solutionId) {
    const solution = this.solutions.get(solutionId);
    return solution ? solution.workflows : [];
  }

  getEndToEndSolutions(solutionId) {
    const solution = this.solutions.get(solutionId);
    return solution?.endToEndSolutions || [];
  }

  getEndToEndSolution(solutionId, e2eId) {
    const e2eSolutions = this.getEndToEndSolutions(solutionId);
    return e2eSolutions.find(s => s.id === e2eId) || null;
  }

  getAllEndToEndSolutions() {
    const allE2E = [];
    for (const solution of this.solutions.values()) {
      if (solution.endToEndSolutions) {
        for (const e2e of solution.endToEndSolutions) {
          allE2E.push({
            ...e2e,
            parentSolution: solution.name,
            parentCategory: solution.category
          });
        }
      }
    }
    return allE2E;
  }

  executeWorkflow(solutionId, workflowId, inputs) {
    if (!solutionId || typeof solutionId !== 'string' || !/^[a-z0-9-]+$/.test(solutionId)) {
      return { error: 'Invalid solution ID format' };
    }
    
    if (!workflowId || typeof workflowId !== 'string' || !/^[a-z0-9-]+$/.test(workflowId)) {
      return { error: 'Invalid workflow ID format' };
    }
    
    const solution = this.solutions.get(solutionId);
    if (!solution) return { error: 'Solution not found' };

    const workflow = solution.workflows.find(w => w.id === workflowId);
    if (!workflow) return { error: 'Workflow not found' };

    const sanitizedInputs = this._sanitizeInputs(inputs);

    return {
      solution: solution.name,
      workflow: workflow.name,
      steps: workflow.steps,
      estimatedTime: workflow.estimatedTime,
      readyForExecution: true,
      inputs: sanitizedInputs
    };
  }
  
  _sanitizeInputs(inputs) {
    if (!inputs || typeof inputs !== 'object') return {};
    
    const sanitized = {};
    for (const [key, value] of Object.entries(inputs)) {
      if (typeof key === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        if (typeof value === 'string') {
          sanitized[key] = value.replace(/[<>&"']/g, '').slice(0, 10000);
        } else if (typeof value === 'number' && isFinite(value)) {
          sanitized[key] = value;
        } else if (typeof value === 'boolean') {
          sanitized[key] = value;
        } else if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
          sanitized[key] = value.slice(0, 100);
        }
      }
    }
    return sanitized;
  }

  generateSolutionReport(solutionId) {
    const solution = this.solutions.get(solutionId);
    if (!solution) return null;

    return {
      solution: solution.name,
      description: solution.description,
      targetCustomers: solution.targetCustomers,
      roi: solution.roi,
      implementationPlan: this._generateImplementationPlan(solution),
      successStories: this._getSuccessStories(solution.category)
    };
  }

  _generateImplementationPlan(solution) {
    return {
      phase1: {
        name: '基础部署',
        duration: '1-2周',
        activities: ['环境配置', '技能导入', '基础培训']
      },
      phase2: {
        name: '集成对接',
        duration: '2-4周',
        activities: ['系统集成', '流程定制', '数据迁移']
      },
      phase3: {
        name: '上线运营',
        duration: '1-2周',
        activities: ['试运行', '优化调整', '正式上线']
      },
      totalDuration: '4-8周'
    };
  }

  _getSuccessStories(category) {
    const stories = {
      banking: [
        { company: '某股份制银行', result: '反洗钱审核效率提升300%' },
        { company: '某城商行', result: '合规报告生成时间从3天缩短到2小时' }
      ],
      healthcare: [
        { company: '某三甲医院', result: '影像诊断准确率提升25%' },
        { company: '某专科医院', result: '患者满意度提升40%' }
      ],
      manufacturing: [
        { company: '某汽车零部件厂', result: '产品良率提升15%' },
        { company: '某电子厂', result: '设备非计划停机减少60%' }
      ],
      energy: [
        { company: '某省级电网公司', result: '负荷预测准确率达到98%' },
        { company: '某新能源电站', result: '发电效率提升20%' }
      ],
      agriculture: [
        { company: '某现代农业园区', result: '亩产提升18%，节水30%' },
        { company: '某养殖企业', result: '病虫害损失降低50%' }
      ],
      government: [
        { company: '某市级政务中心', result: '审批时间缩短65%' },
        { company: '某区县部门', result: '公文处理效率提升200%' }
      ],
      transportation: [
        { company: '某城市交通局', result: '高峰期拥堵减少25%' },
        { company: '某物流平台', result: '配送效率提升35%' }
      ],
      media: [
        { company: '某视频平台', result: '内容审核效率提升400%' },
        { company: '某MCN机构', result: '内容推荐点击率提升45%' }
      ]
    };
    return stories[category] || [];
  }
}

module.exports = { IndustrySolutions };
