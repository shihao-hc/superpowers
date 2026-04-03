const FINANCE_TEMPLATES = [
  {
    id: 'stock_data_fetch',
    name: '股票数据采集',
    icon: '📈',
    industry: 'finance',
    description: '从财经网站采集股票实时数据',
    params: ['symbol', 'period'],
    steps: [
      { action: 'navigate', params: { url: 'https://finance.yahoo.com/quote/{{symbol}}' } },
      { action: 'wait', params: { duration: 2000 } },
      { action: 'extract', params: { selector: '[data-field="regularMarketPrice"]', attribute: 'textContent' } },
      { action: 'screenshot', params: {} },
      { action: 'complete', params: { result: '股票数据采集完成' } }
    ]
  },
  {
    id: 'credit_score',
    name: '信用评分',
    icon: '💳',
    industry: 'finance',
    description: '调用评分模型计算信用分数',
    params: ['applicant_id', 'data_source'],
    steps: [
      { action: 'extract', params: { selector: '#applicant-data', attribute: 'textContent' } },
      { action: 'complete', params: { result: '信用评分完成' } }
    ]
  },
  {
    id: 'regulatory_monitor',
    name: '监管公告监控',
    icon: '⚖️',
    industry: 'finance',
    description: '定时抓取监管机构公告',
    params: ['source_url', 'keywords'],
    steps: [
      { action: 'navigate', params: { url: '{{source_url}}' } },
      { action: 'wait', params: { duration: 2000 } },
      { action: 'extract', params: { selector: '.announcement-item', attribute: 'textContent' } },
      { action: 'screenshot', params: {} },
      { action: 'complete', params: { result: '监管公告采集完成' } }
    ]
  },
  {
    id: 'portfolio_analysis',
    name: '投资组合分析',
    icon: '💼',
    industry: 'finance',
    description: '分析投资组合风险和收益',
    params: ['portfolio_data'],
    steps: [
      { action: 'complete', params: { result: '投资组合分析完成' } }
    ]
  },
  {
    id: 'risk_assessment',
    name: '风险评估',
    icon: '⚠️',
    industry: 'finance',
    description: '评估交易或投资项目风险',
    params: ['transaction_data'],
    steps: [
      { action: 'complete', params: { result: '风险评估完成' } }
    ]
  }
];

const FINANCE_WORKFLOWS = [
  {
    id: 'financial_advisor',
    name: '智能投顾',
    icon: '💰',
    description: '采集市场数据 → 分析 → 生成报告 → 推送',
    steps: [
      { agent: 'data_collector', task: 'collect_market_data' },
      { agent: 'analyst', task: 'analyze_portfolio' },
      { agent: 'reporter', task: 'generate_report' },
      { agent: 'notifier', task: 'push_to_client' }
    ]
  },
  {
    id: 'credit_approval',
    name: '信贷审批',
    icon: '✅',
    description: '获取信息 → 评分 → 反欺诈 → 审批 → 存证',
    steps: [
      { agent: 'collector', task: 'get_applicant_info' },
      { agent: 'scorer', task: 'credit_scoring' },
      { agent: 'fraud_detector', task: 'anti_fraud_check' },
      { agent: 'approver', task: 'generate_decision' },
      { agent: 'attester', task: 'attest_on_chain' }
    ]
  },
  {
    id: 'compliance_monitor',
    name: '合规监控',
    icon: '🔍',
    description: '抓取公告 → 解析条款 → 比对 → 预警',
    steps: [
      { agent: 'scraper', task: 'fetch_announcements' },
      { agent: 'parser', task: 'extract_clauses' },
      { agent: 'comparator', task: 'compare_with_rules' },
      { agent: 'alerter', task: 'send_alerts' }
    ]
  }
];

module.exports = { FINANCE_TEMPLATES, FINANCE_WORKFLOWS };
