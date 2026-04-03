class VerticalSolutions {
  constructor(options = {}) {
    this.solutions = new Map();
    this.activeDeployments = new Map();
    this.onDeploy = options.onDeploy || (() => {});
    this.onError = options.onError || ((e) => console.error('[VerticalSolutions]', e));

    this._registerDefaultSolutions();
  }

  _registerDefaultSolutions() {
    this.registerSolution('finance_monitor', {
      name: '金融监控',
      industry: 'finance',
      icon: '💰',
      description: '实时监控市场动态，自动生成分析报告',
      agents: ['market_monitor', 'data_analyst', 'report_generator', 'risk_assessor'],
      workflows: [
        { step: 'monitor', agent: 'market_monitor', task: '采集市场数据' },
        { step: 'analyze', agent: 'data_analyst', task: '分析趋势' },
        { step: 'assess', agent: 'risk_assessor', task: '风险评估' },
        { step: 'report', agent: 'report_generator', task: '生成报告' }
      ],
      config: {
        updateInterval: '5 m',
        alertThreshold: 0.05,
        reportFormat: 'pdf'
      }
    });

    this.registerSolution('ecommerce_auto', {
      name: '电商自动化',
      industry: 'ecommerce',
      icon: '🛒',
      description: '商品监控、价格跟踪、竞品分析、自动下单',
      agents: ['product_scraper', 'price_tracker', 'competitor_analyst', 'order_executor'],
      workflows: [
        { step: 'scrape', agent: 'product_scraper', task: '采集商品信息' },
        { step: 'track', agent: 'price_tracker', task: '价格跟踪' },
        { step: 'analyze', agent: 'competitor_analyst', task: '竞品分析' },
        { step: 'execute', agent: 'order_executor', task: '执行下单' }
      ],
      config: {
        platforms: ['taobao', 'jd', 'pdd'],
        autoBuy: false,
        priceAlert: true
      }
    });

    this.registerSolution('customer_service', {
      name: '智能客服',
      industry: 'service',
      icon: '🎧',
      description: '7x24小时自动客服，多轮对话，工单管理',
      agents: ['intent_detector', 'knowledge_base', 'ticket_manager', 'escalation_handler'],
      workflows: [
        { step: 'detect', agent: 'intent_detector', task: '意图识别' },
        { step: 'answer', agent: 'knowledge_base', task: '知识库查询' },
        { step: 'ticket', agent: 'ticket_manager', task: '工单处理' },
        { step: 'escalate', agent: 'escalation_handler', task: '人工升级' }
      ],
      config: {
        responseTime: '< 3s',
        autoEscalate: true,
        sentimentAnalysis: true
      }
    });

    this.registerSolution('hr_recruitment', {
      name: '智能招聘',
      industry: 'hr',
      icon: '👔',
      description: '简历筛选、面试安排、候选人跟踪',
      agents: ['resume_parser', 'candidate_matcher', 'interview_scheduler', 'tracker'],
      workflows: [
        { step: 'parse', agent: 'resume_parser', task: '简历解析' },
        { step: 'match', agent: 'candidate_matcher', task: '匹配评估' },
        { step: 'schedule', agent: 'interview_scheduler', task: '面试安排' },
        { step: 'track', agent: 'tracker', task: '进度跟踪' }
      ],
      config: {
        matchThreshold: 0.7,
        autoSchedule: true
      }
    });

    this.registerSolution('content_marketing', {
      name: '内容营销',
      industry: 'marketing',
      icon: '📢',
      description: '内容创作、多平台发布、数据分析',
      agents: ['content_creator', 'seo_optimizer', 'multi_publisher', 'analytics'],
      workflows: [
        { step: 'create', agent: 'content_creator', task: '内容创作' },
        { step: 'optimize', agent: 'seo_optimizer', task: 'SEO优化' },
        { step: 'publish', agent: 'multi_publisher', task: '多平台发布' },
        { step: 'analyze', agent: 'analytics', task: '数据分析' }
      ],
      config: {
        platforms: ['wechat', 'weibo', 'zhihu'],
        autoPublish: false
      }
    });

    this.registerSolution('supply_chain', {
      name: '供应链管理',
      industry: 'logistics',
      icon: '📦',
      description: '库存监控、需求预测、采购自动化',
      agents: ['inventory_monitor', 'demand_predictor', 'purchase_executor', 'logistics_tracker'],
      workflows: [
        { step: 'monitor', agent: 'inventory_monitor', task: '库存监控' },
        { step: 'predict', agent: 'demand_predictor', task: '需求预测' },
        { step: 'purchase', agent: 'purchase_executor', task: '采购执行' },
        { step: 'track', agent: 'logistics_tracker', task: '物流跟踪' }
      ],
      config: {
        reorderPoint: 100,
        safetyStock: 50,
        leadTime: 7
      }
    });

    this.registerSolution('legal_compliance', {
      name: '法律合规',
      industry: 'legal',
      icon: '⚖️',
      description: '合同审查、法规查询、合规检查',
      agents: ['contract_reviewer', 'regulation_searcher', 'compliance_checker', 'document_generator'],
      workflows: [
        { step: 'review', agent: 'contract_reviewer', task: '合同审查' },
        { step: 'search', agent: 'regulation_searcher', task: '法规查询' },
        { step: 'check', agent: 'compliance_checker', task: '合规检查' },
        { step: 'generate', agent: 'document_generator', task: '文档生成' }
      ],
      config: {
        jurisdictions: ['cn', 'us', 'eu'],
        riskLevel: 'medium'
      }
    });

    this.registerSolution('healthcare', {
      name: '医疗辅助',
      industry: 'healthcare',
      icon: '🏥',
      description: '病历分析、药物提醒、健康监测',
      agents: ['record_analyzer', 'medication_reminder', 'health_monitor', 'appointment_scheduler'],
      workflows: [
        { step: 'analyze', agent: 'record_analyzer', task: '病历分析' },
        { step: 'remind', agent: 'medication_reminder', task: '用药提醒' },
        { step: 'monitor', agent: 'health_monitor', task: '健康监测' },
        { step: 'schedule', agent: 'appointment_scheduler', task: '预约挂号' }
      ],
      config: {
        dataPrivacy: 'strict',
        reminderInterval: 'daily'
      }
    });
  }

  registerSolution(solutionId, config) {
    this.solutions.set(solutionId, {
      id: solutionId,
      name: config.name,
      industry: config.industry,
      icon: config.icon,
      description: config.description,
      agents: config.agents,
      workflows: config.workflows,
      config: config.config,
      status: 'available',
      createdAt: Date.now()
    });
  }

  async deploy(solutionId, deploymentConfig = {}) {
    const solution = this.solutions.get(solutionId);
    if (!solution) throw new Error('Solution not found');

    const deploymentId = `deploy_${solutionId}_${Date.now().toString(36)}`;

    const deployment = {
      id: deploymentId,
      solutionId,
      solutionName: solution.name,
      status: 'deploying',
      config: { ...solution.config, ...deploymentConfig },
      agents: solution.agents.map(a => ({
        name: a,
        status: 'initializing',
        initializedAt: null
      })),
      startedAt: Date.now(),
      completedAt: null
    };

    this.activeDeployments.set(deploymentId, deployment);

    for (const agent of deployment.agents) {
      await new Promise(r => setTimeout(r, 200));
      agent.status = 'ready';
      agent.initializedAt = Date.now();
    }

    deployment.status = 'running';
    deployment.completedAt = Date.now();

    this.onDeploy(deployment);

    return deployment;
  }

  async stop(deploymentId) {
    const deployment = this.activeDeployments.get(deploymentId);
    if (!deployment) return false;

    deployment.status = 'stopped';
    deployment.stoppedAt = Date.now();

    for (const agent of deployment.agents) {
      agent.status = 'stopped';
    }

    return true;
  }

  getSolution(solutionId) {
    return this.solutions.get(solutionId);
  }

  getAllSolutions() {
    return Array.from(this.solutions.values());
  }

  getSolutionsByIndustry(industry) {
    return Array.from(this.solutions.values()).filter(s => s.industry === industry);
  }

  getDeployment(deploymentId) {
    return this.activeDeployments.get(deploymentId);
  }

  getAllDeployments() {
    return Array.from(this.activeDeployments.values());
  }

  getRunningDeployments() {
    return Array.from(this.activeDeployments.values()).filter(d => d.status === 'running');
  }

  getStats() {
    const solutions = Array.from(this.solutions.values());
    const deployments = Array.from(this.activeDeployments.values());

    const industries = [...new Set(solutions.map(s => s.industry))];

    return {
      solutions: {
        total: solutions.length,
        byIndustry: industries.reduce((acc, ind) => {
          acc[ind] = solutions.filter(s => s.industry === ind).length;
          return acc;
        }, {})
      },
      deployments: {
        total: deployments.length,
        running: deployments.filter(d => d.status === 'running').length,
        stopped: deployments.filter(d => d.status === 'stopped').length
      }
    };
  }

  destroy() {
    for (const [deploymentId] of this.activeDeployments) {
      this.stop(deploymentId);
    }
    this.solutions.clear();
    this.activeDeployments.clear();
  }
}

module.exports = { VerticalSolutions };
