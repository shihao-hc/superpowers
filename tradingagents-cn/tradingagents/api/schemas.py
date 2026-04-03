"""
TradingAgents-CN API Schemas
请求和响应数据模型
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from enum import Enum
import re


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class AnalysisRequest(BaseModel):
    company: str = Field(..., min_length=1, max_length=100, description="公司名称或股票代码")
    trade_date: str = Field(..., description="交易日期 YYYY-MM-DD")
    task_id: Optional[str] = Field(None, description="任务ID，用于追踪")
    use_cache: bool = Field(True, description="是否使用缓存")
    max_debate_rounds: int = Field(2, ge=1, le=5, description="辩论轮数")

    @field_validator('trade_date')
    @classmethod
    def validate_date(cls, v: str) -> str:
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', v):
            raise ValueError('trade_date must be in YYYY-MM-DD format')
        return v

    @field_validator('company')
    @classmethod
    def sanitize_company(cls, v: str) -> str:
        return v.strip()[:100]

    @field_validator('task_id')
    @classmethod
    def validate_task_id(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if not re.match(r'^[a-zA-Z0-9_-]{1,64}$', v):
                raise ValueError('task_id must be alphanumeric with dash/underscore, max 64 chars')
        return v


class AnalystReport(BaseModel):
    expert_name: str
    report: str
    confidence: float = 0.0


class InvestmentDecision(BaseModel):
    bull_case: str
    bear_case: str
    judge_decision: str
    investment_plan: str


class RiskAssessment(BaseModel):
    risky_assessment: str
    safe_assessment: str
    neutral_assessment: str
    final_decision: str
    risk_level: str = "moderate"


class TradingPlan(BaseModel):
    action: str
    position_size: float
    entry_price_range: Dict[str, float]
    stop_loss: float
    take_profit: float
    holding_period: str
    risk_level: str
    rationale: str
    risk_warnings: List[str]


class AnalysisResponse(BaseModel):
    task_id: str
    status: TaskStatus
    company: str
    trade_date: str
    created_at: str
    completed_at: Optional[str] = None
    analyst_reports: Dict[str, AnalystReport] = {}
    investment_decision: Optional[InvestmentDecision] = None
    risk_assessment: Optional[RiskAssessment] = None
    trading_plan: Optional[TradingPlan] = None
    errors: List[str] = []
    progress: float = 0.0


class WebSocketMessage(BaseModel):
    type: str = Field(..., description="消息类型")
    task_id: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())


class HealthCheck(BaseModel):
    status: str = "healthy"
    version: str = "1.0.0"
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    models: List[str] = []


class DependencyStatus(BaseModel):
    name: str
    status: str = "healthy"
    latency_ms: Optional[float] = None
    error: Optional[str] = None


class DetailedHealthCheck(BaseModel):
    status: str = "healthy"
    version: str = "1.0.0"
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    uptime_seconds: Optional[float] = None
    dependencies: Dict[str, DependencyStatus] = {}
    llm_costs_today: Optional[Dict[str, Any]] = None
    active_tasks: int = 0


class TaskListResponse(BaseModel):
    tasks: List[AnalysisResponse]
    total: int
    page: int = 1
    page_size: int = 10


class CodeReviewRequest(BaseModel):
    code: str = Field(..., max_length=100000, description="待审查的代码")
    language: str = Field("python", description="编程语言")
    repo: Optional[str] = Field(None, max_length=500, description="代码仓库")
    file_path: Optional[str] = Field(None, max_length=500, description="文件路径")
    task_id: Optional[str] = Field(None, description="任务ID")
    llm_provider: Optional[str] = Field("deepseek", description="LLM提供商")

    SUPPORTED_LANGUAGES = {'python', 'javascript', 'typescript', 'java', 'go', 'rust', 'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'kotlin'}
    SUPPORTED_PROVIDERS = {'openai', 'deepseek', 'google', 'dashscope', 'ollama', 'mock'}

    @field_validator('language')
    @classmethod
    def validate_language(cls, v: str) -> str:
        if v.lower() not in cls.SUPPORTED_LANGUAGES:
            raise ValueError(f'language must be one of: {", ".join(cls.SUPPORTED_LANGUAGES)}')
        return v.lower()

    @field_validator('llm_provider')
    @classmethod
    def validate_provider(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.lower() not in cls.SUPPORTED_PROVIDERS:
            raise ValueError(f'llm_provider must be one of: {", ".join(cls.SUPPORTED_PROVIDERS)}')
        return v.lower() if v else v


class CodeReviewReport(BaseModel):
    expert_name: str
    report: str
    severity: str = "info"


class CodeReviewResponse(BaseModel):
    task_id: str
    status: TaskStatus
    code: str
    language: str
    created_at: str
    completed_at: Optional[str] = None
    reports: Dict[str, CodeReviewReport] = {}
    critic_arguments: Optional[str] = None
    advocate_arguments: Optional[str] = None
    final_verdict: Optional[str] = None
    errors: List[str] = []
    progress: float = 0.0
