const ECOMMERCE_TEMPLATES = [
  {
    id: 'price_monitor',
    name: '价格监控',
    icon: '💰',
    industry: 'ecommerce',
    description: '监控竞品商品价格变化',
    params: ['product_url', 'competitor_urls'],
    steps: [
      { action: 'navigate', params: { url: '{{product_url}}' } },
      { action: 'wait', params: { duration: 2000 } },
      { action: 'extract', params: { selector: '.price', attribute: 'textContent' } },
      { action: 'screenshot', params: {} },
      { action: 'complete', params: { result: '价格监控完成' } }
    ]
  },
  {
    id: 'review_analysis',
    name: '评论情感分析',
    icon: '💬',
    industry: 'ecommerce',
    description: '分析商品评论的情感倾向',
    params: ['product_url', 'review_selector'],
    steps: [
      { action: 'navigate', params: { url: '{{product_url}}' } },
      { action: 'wait', params: { duration: 2000 } },
      { action: 'extract', params: { selector: '{{review_selector}}', attribute: 'textContent' } },
      { action: 'complete', params: { result: '评论分析完成' } }
    ]
  },
  {
    id: 'inventory_forecast',
    name: '库存预测',
    icon: '📦',
    industry: 'ecommerce',
    description: '基于销售数据预测库存需求',
    params: ['sales_data', 'forecast_period'],
    steps: [
      { action: 'complete', params: { result: '库存预测完成' } }
    ]
  },
  {
    id: 'product_compare',
    name: '商品比价',
    icon: '⚖️',
    industry: 'ecommerce',
    description: '对比多个平台的商品价格',
    params: ['product_name', 'platforms'],
    steps: [
      { action: 'navigate', params: { url: 'https://www.google.com/search?q={{product_name}}+price' } },
      { action: 'wait', params: { duration: 2000 } },
      { action: 'extract', params: { selector: '.price', attribute: 'textContent' } },
      { action: 'screenshot', params: {} },
      { action: 'complete', params: { result: '商品比价完成' } }
    ]
  },
  {
    id: 'auto_order',
    name: '自动下单',
    icon: '🛒',
    industry: 'ecommerce',
    description: '根据策略自动下单购买',
    params: ['product_url', 'quantity', 'max_price'],
    steps: [
      { action: 'navigate', params: { url: '{{product_url}}' } },
      { action: 'wait', params: { duration: 2000 } },
      { action: 'click', params: { selector: '.buy-now' } },
      { action: 'wait', params: { duration: 3000 } },
      { action: 'screenshot', params: {} },
      { action: 'complete', params: { result: '下单完成' } }
    ]
  }
];

const ECOMMERCE_WORKFLOWS = [
  {
    id: 'price_alert',
    name: '价格告警',
    icon: '🔔',
    description: '价格监控 → 比对 → 决策 → 执行 → 存证',
    steps: [
      { agent: 'monitor', task: 'monitor_price' },
      { agent: 'comparator', task: 'compare_prices' },
      { agent: 'decision_maker', task: 'decide_action' },
      { agent: 'executor', task: 'execute_action' },
      { agent: 'attester', task: 'attest_result' }
    ]
  },
  {
    id: 'review_sentiment',
    name: '评论情感',
    icon: '😊',
    description: '采集评论 → 情感分析 → 报告 → 客服触发',
    steps: [
      { agent: 'collector', task: 'collect_reviews' },
      { agent: 'analyzer', task: 'analyze_sentiment' },
      { agent: 'reporter', task: 'generate_report' },
      { agent: 'dispatcher', task: 'trigger_support' }
    ]
  },
  {
    id: 'inventory_replenish',
    name: '库存补货',
    icon: '📦',
    description: '销售数据 → 预测 → 采购单 → 调用API',
    steps: [
      { agent: 'data_collector', task: 'get_sales_data' },
      { agent: 'predictor', task: 'forecast_demand' },
      { agent: 'planner', task: 'generate_order' },
      { agent: 'executor', task: 'call_purchase_api' }
    ]
  }
];

module.exports = { ECOMMERCE_TEMPLATES, ECOMMERCE_WORKFLOWS };
