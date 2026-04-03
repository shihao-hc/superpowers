const CUSTOMER_SERVICE_TEMPLATES = [
  {
    id: 'faq_bot',
    name: 'FAQ问答',
    icon: '🤖',
    industry: 'customer_service',
    description: '基于知识库的自动问答',
    params: ['question', 'knowledge_base'],
    steps: [
      { action: 'complete', params: { result: 'FAQ回答完成' } }
    ]
  },
  {
    id: 'ticket_classifier',
    name: '工单分类',
    icon: '🎫',
    industry: 'customer_service',
    description: '自动分类工单类型',
    params: ['ticket_content'],
    steps: [
      { action: 'complete', params: { result: '工单分类完成' } }
    ]
  },
  {
    id: 'sentiment_monitor',
    name: '情感监测',
    icon: '😊',
    industry: 'customer_service',
    description: '实时分析对话情感',
    params: ['conversation'],
    steps: [
      { action: 'complete', params: { result: '情感分析完成' } }
    ]
  },
  {
    id: 'auto_reply',
    name: '自动回复',
    icon: '💬',
    industry: 'customer_service',
    description: '生成智能回复',
    params: ['message', 'context'],
    steps: [
      { action: 'complete', params: { result: '回复生成完成' } }
    ]
  },
  {
    id: 'escalation',
    name: '人工升级',
    icon: '📞',
    industry: 'customer_service',
    description: '将复杂问题升级给人工客服',
    params: ['ticket_id', 'reason'],
    steps: [
      { action: 'complete', params: { result: '已升级至人工客服' } }
    ]
  }
];

const CUSTOMER_SERVICE_WORKFLOWS = [
  {
    id: 'auto_ticket',
    name: '自动工单',
    icon: '📋',
    description: '接收 → 分类 → 路由 → 通知',
    steps: [
      { agent: 'receiver', task: 'receive_ticket' },
      { agent: 'classifier', task: 'classify_ticket' },
      { agent: 'router', task: 'route_to_agent' },
      { agent: 'notifier', task: 'send_notification' }
    ]
  },
  {
    id: 'smart_qa',
    name: '智能问答',
    icon: '🤖',
    description: '用户提问 → 知识库检索 → 生成答案 → 多渠道回复',
    steps: [
      { agent: 'receiver', task: 'receive_question' },
      { agent: 'retriever', task: 'search_knowledge' },
      { agent: 'generator', task: 'generate_answer' },
      { agent: 'responder', task: 'send_response' }
    ]
  },
  {
    id: 'emotion_escalation',
    name: '情绪升级',
    icon: '😤',
    description: '分析对话 → 检测负面情绪 → 生成建议 → 转人工',
    steps: [
      { agent: 'monitor', task: 'monitor_conversation' },
      { agent: 'analyzer', task: 'detect_negative_emotion' },
      { agent: 'advisor', task: 'generate_suggestions' },
      { agent: 'escalator', task: 'transfer_to_human' }
    ]
  },
  {
    id: 'return_process',
    name: '退货处理',
    icon: '🔄',
    description: '用户请求 → 验证订单 → 生成退货单 → 物流通知',
    steps: [
      { agent: 'receiver', task: 'receive_return_request' },
      { agent: 'validator', task: 'validate_order' },
      { agent: 'processor', task: 'create_return_order' },
      { agent: 'notifier', task: 'send_logistics_info' }
    ]
  }
];

module.exports = { CUSTOMER_SERVICE_TEMPLATES, CUSTOMER_SERVICE_WORKFLOWS };
