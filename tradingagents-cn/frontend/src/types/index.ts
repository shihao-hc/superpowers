// API 类型定义
export interface AnalysisRequest {
  company: string
  trade_date: string
  task_id?: string
  use_cache?: boolean
  max_debate_rounds?: number
  llm_provider?: string
  risk_preference?: string
}

export interface AnalystReport {
  expert_name: string
  report: string
  confidence: number
}

export interface TradingPlan {
  action: string
  position_size: number
  entry_price_range: { low: number; high: number }
  stop_loss: number
  take_profit: number
  holding_period: string
  risk_level: string
  rationale: string
  risk_warnings: string[]
}

export interface AnalysisResponse {
  task_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  company: string
  trade_date: string
  created_at: string
  completed_at?: string
  analyst_reports: Record<string, AnalystReport>
  investment_decision?: {
    bull_case: string
    bear_case: string
    judge_decision: string
    investment_plan: string
  }
  risk_assessment?: {
    risky_assessment: string
    safe_assessment: string
    neutral_assessment: string
    final_decision: string
    risk_level: string
  }
  trading_plan?: TradingPlan
  errors: string[]
  progress: number
}

export type WebSocketMessageType = 'status' | 'report' | 'completed' | 'error' | 'pong' | 'websocket_connected' | 'ping'

export interface WebSocketStatusData {
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  phase?: string
  message?: string
}

export interface WebSocketCompletedData {
  response: AnalysisResponse
}

export interface WebSocketMessage {
  type: WebSocketMessageType
  task_id?: string
  data?: WebSocketStatusData | WebSocketCompletedData | Record<string, any>
  error?: string
  timestamp?: string
}

export interface PerformanceMetrics {
  total_calls: number
  success_rate: number
  avg_latency_ms: number
  total_cost_usd: number
  total_tokens: number
}

// Phase mapping
export const PHASE_LABELS: Record<string, string> = {
  'data_collection': '数据收集',
  'data-collection': '数据收集',
  'analysis': '专家分析',
  'expert_analysis': '专家分析',
  'debate': '辩论决策',
  'debate_decision': '辩论决策',
  'risk_assessment': '风险评估',
  'risk-evaluation': '风险评估',
  'trading_plan': '交易计划',
  'completed': '已完成',
  'running': '分析中',
}

export const PHASE_THRESHOLDS: Record<string, number> = {
  'data_collection': 0,
  'data-collection': 0,
  'analysis': 0.25,
  'expert_analysis': 0.25,
  'debate': 0.5,
  'debate_decision': 0.5,
  'risk_assessment': 0.75,
  'risk-evaluation': 0.75,
  'trading_plan': 1.0,
  'completed': 1.0,
}
