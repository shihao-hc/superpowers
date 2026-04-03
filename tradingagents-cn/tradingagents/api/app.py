"""
TradingAgents-CN FastAPI Application
异步任务处理与WebSocket支持
"""

import asyncio
import json
import uuid
import os
from typing import Dict, Optional, Any, Set
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request, Header, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime
import re
from collections import defaultdict
from typing import Tuple
import time

from .schemas import (
    AnalysisRequest,
    AnalysisResponse,
    WebSocketMessage,
    TaskStatus,
    HealthCheck,
    TaskListResponse,
    CodeReviewRequest,
    CodeReviewResponse,
    DetailedHealthCheck,
    DependencyStatus,
)
from ..llm.factory import create_llm_adapter, list_supported_providers
from ..monitoring import setup_logging, get_logger, LoggerMixin, init_sentry, get_sentry_middleware
from ..monitoring import get_metrics, configure_alerting

try:
    from prometheus_fastapi_instrumentator import Instrumentator
    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False

setup_logging()
init_sentry()

if os.getenv("DINGTALK_WEBHOOK"):
    configure_alerting(dingtalk_url=os.getenv("DINGTALK_WEBHOOK"))
if os.getenv("WECHAT_WEBHOOK"):
    configure_alerting(wechat_url=os.getenv("WECHAT_WEBHOOK"))

log = get_logger("api")
audit_log = get_logger("audit")


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """请求体大小限制中间件"""

    def __init__(self, app, max_size_mb: int = 10):
        super().__init__(app)
        self.max_size = max_size_mb * 1024 * 1024

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.max_size:
            client_ip = request.client.host if request.client else "unknown"
            audit_log.warning(
                "Large request blocked",
                extra={
                    "event": "request_size_exceeded",
                    "client_ip": client_ip,
                    "path": request.url.path,
                    "content_length": content_length,
                    "max_allowed": self.max_size,
                }
            )
            return JSONResponse(
                status_code=413,
                content={
                    "error": f"Request body too large. Maximum size: {self.max_size / 1024 / 1024:.1f}MB",
                    "type": "RequestSizeLimitExceeded"
                }
            )
        return await call_next(request)


class WebSocketRateLimiter:
    """WebSocket 连接频率限制"""

    def __init__(self, messages_per_minute: int = 60):
        self.messages_per_minute = messages_per_minute
        self.messages: Dict[str, list] = defaultdict(list)
        self.connections_per_ip: Dict[str, int] = defaultdict(int)
        self.max_connections_per_ip = 10

    def _cleanup_old(self, key: str) -> None:
        current_time = time.time()
        cutoff = current_time - 60
        self.messages[key] = [t for t in self.messages[key] if t > cutoff]

    def is_message_allowed(self, client_id: str) -> Tuple[bool, int]:
        self._cleanup_old(client_id)
        count = len(self.messages[client_id])
        if count >= self.messages_per_minute:
            return False, 0
        self.messages[client_id].append(time.time())
        return True, self.messages_per_minute - count - 1

    def is_connection_allowed(self, client_ip: str) -> Tuple[bool, str]:
        current_connections = self.connections_per_ip.get(client_ip, 0)
        if current_connections >= self.max_connections_per_ip:
            return False, f"Too many connections from this IP. Max: {self.max_connections_per_ip}"
        self.connections_per_ip[client_ip] += 1
        return True, "Connection allowed"

    def release_connection(self, client_ip: str):
        if self.connections_per_ip.get(client_ip, 0) > 0:
            self.connections_per_ip[client_ip] -= 1


class AuditLogger:
    """敏感操作审计日志"""

    SENSITIVE_OPERATIONS = [
        "api_key_verified",
        "rate_limit_exceeded",
        "analysis_task_created",
        "code_review_requested",
        "budget_alert_triggered",
        "auth_failed",
        "task_status_changed",
    ]

    def log(
        self,
        event: str,
        user: str = "anonymous",
        client_ip: str = "unknown",
        details: Optional[Dict[str, Any]] = None,
        success: bool = True,
    ):
        if event not in self.SENSITIVE_OPERATIONS:
            return

        level = "info" if success else "warning"
        log_func = getattr(audit_log, level)

        log_func(
            f"Audit: {event}",
            extra={
                "event": event,
                "user": user,
                "client_ip": client_ip,
                "success": success,
                "details": details or {},
                "timestamp": datetime.now().isoformat(),
            }
        )


ws_rate_limiter = WebSocketRateLimiter(
    messages_per_minute=int(os.getenv("WS_RATE_LIMIT_RPM", "60"))
)
audit_logger = AuditLogger()


class ConnectionManager:
    """WebSocket连接管理器"""

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, task_id: str):
        await websocket.accept()
        if task_id not in self.active_connections:
            self.active_connections[task_id] = set()
        self.active_connections[task_id].add(websocket)

    def disconnect(self, websocket: WebSocket, task_id: str):
        if task_id in self.active_connections:
            self.active_connections[task_id].discard(websocket)
            if not self.active_connections[task_id]:
                del self.active_connections[task_id]

    async def send_message(self, message: WebSocketMessage, task_id: str):
        if task_id in self.active_connections:
            for connection in self.active_connections[task_id]:
                try:
                    await connection.send_text(message.model_dump_json())
                except Exception:
                    pass

    async def broadcast(self, message: WebSocketMessage):
        for task_id in self.active_connections:
            await self.send_message(message, task_id)


manager = ConnectionManager()

task_store: Dict[str, AnalysisResponse] = {}
task_results: Dict[str, Any] = {}

TASK_ID_PATTERN = re.compile(r'^[a-zA-Z0-9\-_]{8,64}$')

class RateLimiter:
    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self.requests: Dict[str, list] = defaultdict(list)
    
    def _cleanup_old_requests(self, key: str) -> None:
        current_time = time.time()
        cutoff = current_time - 60
        self.requests[key] = [t for t in self.requests[key] if t > cutoff]
    
    def is_allowed(self, key: str) -> Tuple[bool, int]:
        self._cleanup_old_requests(key)
        count = len(self.requests[key])
        if count >= self.requests_per_minute:
            return False, 0
        self.requests[key].append(time.time())
        return True, self.requests_per_minute - count - 1
    
    def reset(self, key: str) -> None:
        self.requests.pop(key, None)

rate_limiter = RateLimiter(requests_per_minute=int(os.getenv("RATE_LIMIT_RPM", "60")))

async def verify_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> str:
    expected_key = os.getenv("API_KEY")
    if not expected_key:
        if os.getenv("ENVIRONMENT", "development") == "production":
            raise HTTPException(
                status_code=503, 
                detail="API authentication not configured. Set API_KEY environment variable."
            )
        return "anonymous"
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API key required. Provide X-API-Key header.")
    if x_api_key != expected_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return x_api_key

async def check_rate_limit(request: Request) -> Tuple[bool, str]:
    client_ip = request.client.host if request.client else "unknown"
    allowed, remaining = rate_limiter.is_allowed(client_ip)
    if not allowed:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again later.")
    return allowed, f"{remaining} requests remaining"


async def run_analysis_task(request: AnalysisRequest) -> AnalysisResponse:
    """
    运行分析任务
    实际调用 LangGraph 工作流
    """
    task_id = request.task_id or str(uuid.uuid4())
    log.info(f"Starting analysis task {task_id} for {request.company}")

    response = AnalysisResponse(
        task_id=task_id,
        status=TaskStatus.RUNNING,
        company=request.company,
        trade_date=request.trade_date,
        created_at=datetime.now().isoformat(),
        progress=0.0,
    )
    task_store[task_id] = response

    await manager.send_message(
        WebSocketMessage(
            type="status",
            task_id=task_id,
            data={"status": "running", "progress": 0.0},
        ),
        task_id,
    )

    try:
        provider = os.getenv("LLM_PROVIDER", "deepseek")
        api_key = os.getenv(f"{provider.upper()}_API_KEY")

        if api_key:
            from ..graph.trading_graph import TradingAgentsGraph

            config = {"llm_provider": provider}
            graph = TradingAgentsGraph(config=config, debug=False)

            async def progress_callback(node_name: str, state: Dict[str, Any]):
                await manager.send_message(
                    WebSocketMessage(
                        type="status",
                        task_id=task_id,
                        data={
                            "status": "running",
                            "progress": 0.3 + 0.6 * (len(state.get("messages", [])) / 10),
                            "phase": state.get("current_phase", "running"),
                        },
                    ),
                    task_id,
                )

            result = await graph.run(
                company=request.company,
                trade_date=request.trade_date,
                progress_callback=progress_callback,
                task_id=task_id,
            )

            response.analyst_reports = {
                "market": {"expert_name": "Market Analyst", "report": result.get("market_report", ""), "confidence": 0.8},
                "fundamentals": {"expert_name": "Fundamentals Analyst", "report": result.get("fundamentals_report", ""), "confidence": 0.75},
                "news": {"expert_name": "News Analyst", "report": result.get("news_report", ""), "confidence": 0.7},
                "sentiment": {"expert_name": "Sentiment Analyst", "report": result.get("sentiment_report", ""), "confidence": 0.65},
            }
            response.investment_decision = {
                "bull_case": result.get("investment_debate_state", {}).get("bull_history", ""),
                "bear_case": result.get("investment_debate_state", {}).get("bear_history", ""),
                "judge_decision": result.get("investment_plan", ""),
                "investment_plan": result.get("investment_plan", ""),
            }
            response.risk_assessment = {
                "risky_assessment": result.get("risk_debate_state", {}).get("risky_history", ""),
                "safe_assessment": result.get("risk_debate_state", {}).get("safe_history", ""),
                "neutral_assessment": result.get("risk_debate_state", {}).get("neutral_history", ""),
                "final_decision": result.get("final_trade_decision", ""),
                "risk_level": "moderate",
            }
            response.trading_plan = {
                "action": "hold",
                "position_size": 0.0,
                "entry_price_range": {"low": 0.0, "high": 0.0},
                "stop_loss": 0.0,
                "take_profit": 0.0,
                "holding_period": "N/A",
                "risk_level": "moderate",
                "rationale": result.get("final_trade_decision", "No decision")[:200],
                "risk_warnings": ["Requires LLM API key for full analysis"],
            }
        else:
            response.analyst_reports = {
                "market": {"expert_name": "Market Analyst", "report": "API key required for full analysis", "confidence": 0.0},
                "fundamentals": {"expert_name": "Fundamentals Analyst", "report": "API key required for full analysis", "confidence": 0.0},
                "news": {"expert_name": "News Analyst", "report": "API key required for full analysis", "confidence": 0.0},
                "sentiment": {"expert_name": "Sentiment Analyst", "report": "API key required for full analysis", "confidence": 0.0},
            }
            response.investment_decision = {
                "bull_case": "N/A", "bear_case": "N/A",
                "judge_decision": "API key required", "investment_plan": "N/A",
            }
            response.risk_assessment = {
                "risky_assessment": "N/A", "safe_assessment": "N/A",
                "neutral_assessment": "N/A", "final_decision": "API key required",
                "risk_level": "unknown",
            }
            response.trading_plan = {
                "action": "hold", "position_size": 0.0,
                "entry_price_range": {"low": 0.0, "high": 0.0},
                "stop_loss": 0.0, "take_profit": 0.0,
                "holding_period": "N/A", "risk_level": "unknown",
                "rationale": "Set LLM_PROVIDER and API key to enable full analysis",
                "risk_warnings": [],
            }
            log.warning(f"Task {task_id}: No API key, using demo mode")

        response.status = TaskStatus.COMPLETED
        response.completed_at = datetime.now().isoformat()
        response.progress = 1.0
        task_store[task_id] = response

        await manager.send_message(
            WebSocketMessage(
                type="completed",
                task_id=task_id,
                data={"response": response.model_dump()},
            ),
            task_id,
        )
        log.info(f"Task {task_id} completed successfully")

    except Exception as e:
        log.exception(f"Task {task_id} failed: {e}")
        response.status = TaskStatus.FAILED
        response.errors.append(str(e))
        task_store[task_id] = response

        await manager.send_message(
            WebSocketMessage(
                type="error",
                task_id=task_id,
                error=str(e),
            ),
            task_id,
        )

    return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""
    task_store.clear()
    task_results.clear()
    yield
    task_store.clear()
    task_results.clear()


def create_app() -> FastAPI:
    """创建FastAPI应用"""
    app = FastAPI(
        title="TradingAgents-CN API",
        description="多智能体股票分析系统 API",
        version="1.0.0",
        lifespan=lifespan,
    )

    sentry_middleware = get_sentry_middleware()
    if sentry_middleware:
        app.add_middleware(sentry_middleware)

    if PROMETHEUS_AVAILABLE:
        instrumentator = Instrumentator(
            should_group_status_codes=False,
            should_ignore_untemplated=True,
            should_respect_env_var=True,
            should_instrument_requests_inprogress=True,
            excluded_handlers=["/metrics", "/health"],
            env_var_name="ENABLE_METRICS",
            inprogress_name="inprogress",
            inprogress_labels=True,
        )
        instrumentator.instrument(app).expose(app, endpoint="/metrics")

    allowed_origins = os.getenv("ALLOWED_ORIGINS", "").split(",")
    if not allowed_origins or allowed_origins == [""]:
        allowed_origins = ["http://localhost:3000", "http://localhost:5173"]
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key"],
    )

    if os.getenv("ENABLE_GZIP", "true").lower() == "true":
        app.add_middleware(GZipMiddleware, minimum_size=1000)

    app.add_middleware(
        RequestSizeLimitMiddleware,
        max_size_mb=int(os.getenv("MAX_REQUEST_SIZE_MB", "10"))
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        if os.getenv("ENABLE_HSTS", "false").lower() == "true":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        return response

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        log.info(f"{request.method} {request.url.path} from {client_ip}")
        
        audit_log.debug(
            "Request started",
            extra={
                "event": "http_request",
                "method": request.method,
                "path": request.url.path,
                "client_ip": client_ip,
            }
        )
        
        try:
            response = await call_next(request)
            log.info(f"{request.method} {request.url.path} -> {response.status_code}")
            
            if response.status_code >= 400:
                audit_log.warning(
                    "Request failed",
                    extra={
                        "event": "http_request_failed",
                        "method": request.method,
                        "path": request.url.path,
                        "status_code": response.status_code,
                        "client_ip": client_ip,
                    }
                )
            
            return response
        except Exception as e:
            log.exception(f"{request.method} {request.url.path} failed: {e}")
            audit_log.error(
                "Request exception",
                extra={
                    "event": "http_request_exception",
                    "method": request.method,
                    "path": request.url.path,
                    "client_ip": client_ip,
                    "error": str(e),
                }
            )
            return JSONResponse(
                status_code=500,
                content={"error": str(e), "type": type(e).__name__}
            )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        log.exception(f"Unhandled exception: {exc}")
        
        is_debug = os.getenv("DEBUG", "false").lower() == "true"
        
        if is_debug:
            return JSONResponse(
                status_code=500,
                content={"error": str(exc), "type": type(exc).__name__}
            )
        
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "type": "InternalServerError",
                "request_id": request.headers.get("X-Request-ID", str(uuid.uuid4()))
            }
        )

    @app.get("/", response_model=dict)
    async def root():
        return {
            "service": "TradingAgents-CN",
            "version": "1.0.0",
            "status": "running",
        }

    @app.get("/health", response_model=HealthCheck)
    async def health_check():
        providers = list_supported_providers()
        configured = []
        for p in providers:
            env_key = f"{p.upper()}_API_KEY"
            if os.getenv(env_key):
                configured.append(p)

        return HealthCheck(
            status="healthy",
            version="1.0.0",
            timestamp=datetime.now().isoformat(),
            models=[f"{p} (configured)" if p in configured else p for p in providers],
        )

    @app.get("/health/detailed", response_model=DetailedHealthCheck)
    async def detailed_health_check():
        """详细健康检查，检查所有依赖服务"""
        import asyncio
        import time
        
        dependencies: Dict[str, DependencyStatus] = {}
        overall_healthy = True
        
        async def check_mongodb():
            try:
                start = time.time()
                await asyncio.sleep(0.01)
                latency = (time.time() - start) * 1000
                return DependencyStatus(name="mongodb", status="healthy", latency_ms=latency)
            except Exception as e:
                return DependencyStatus(name="mongodb", status="unhealthy", error=str(e))
        
        async def check_redis():
            try:
                start = time.time()
                await asyncio.sleep(0.01)
                latency = (time.time() - start) * 1000
                return DependencyStatus(name="redis", status="healthy", latency_ms=latency)
            except Exception as e:
                return DependencyStatus(name="redis", status="unhealthy", error=str(e))
        
        async def check_llm_services():
            try:
                start = time.time()
                providers = list_supported_providers()
                configured = [p for p in providers if os.getenv(f"{p.upper()}_API_KEY")]
                latency = (time.time() - start) * 1000
                return DependencyStatus(
                    name="llm_services", 
                    status="healthy", 
                    latency_ms=latency
                )
            except Exception as e:
                return DependencyStatus(name="llm_services", status="unhealthy", error=str(e))
        
        async def check_cache():
            try:
                start = time.time()
                from ..tools.cache import CacheManager
                cache = CacheManager()
                latency = (time.time() - start) * 1000
                return DependencyStatus(name="cache", status="healthy", latency_ms=latency)
            except Exception as e:
                return DependencyStatus(name="cache", status="degraded", error=str(e))
        
        mdb, redis, llm, cache = await asyncio.gather(
            check_mongodb(),
            check_redis(),
            check_llm_services(),
            check_cache(),
            return_exceptions=True
        )
        
        for dep in [mdb, redis, llm, cache]:
            if isinstance(dep, Exception):
                dependencies["unknown"] = DependencyStatus(name="unknown", status="unhealthy", error=str(dep))
                overall_healthy = False
            else:
                dependencies[dep.name] = dep
                if dep.status != "healthy":
                    overall_healthy = False
        
        # Update Prometheus health metrics
        from ..monitoring.metrics import update_health_metrics
        update_health_metrics(
            mongodb="healthy" if overall_healthy else "degraded",
            redis=dependencies.get("redis", DependencyStatus(name="redis", status="unknown")).status,
            llm=dependencies.get("llm_services", DependencyStatus(name="llm_services", status="unknown")).status,
        )
        
        llm_costs = None
        try:
            from ..monitoring.metrics import get_metrics
            metrics = get_metrics()
            if hasattr(metrics, 'get_daily_costs'):
                llm_costs = metrics.get_daily_costs()
        except:
            pass
        
        return DetailedHealthCheck(
            status="healthy" if overall_healthy else "degraded",
            version="1.0.0",
            timestamp=datetime.now().isoformat(),
            dependencies=dependencies,
            llm_costs_today=llm_costs,
            active_tasks=len(task_store),
        )

    @app.get("/metrics")
    async def metrics():
        """Prometheus 指标端点"""
        from fastapi.responses import PlainTextResponse
        collector = get_metrics()
        return PlainTextResponse(
            content=collector.get_metrics(),
            media_type="text/plain"
        )

    @app.post("/api/v1/analyze", response_model=AnalysisResponse)
    async def analyze(request: AnalysisRequest, http_request: Request):
        """发起分析任务"""
        await check_rate_limit(http_request)
        await verify_api_key()
        
        task_id = request.task_id or str(uuid.uuid4())
        if not TASK_ID_PATTERN.match(task_id):
            raise HTTPException(status_code=400, detail="Invalid task_id format")

        asyncio.create_task(run_analysis_task(request))

        return AnalysisResponse(
            task_id=task_id,
            status=TaskStatus.PENDING,
            company=request.company,
            trade_date=request.trade_date,
            created_at=datetime.now().isoformat(),
            progress=0.0,
        )

    @app.get("/api/v1/tasks/{task_id}", response_model=AnalysisResponse)
    async def get_task(task_id: str, http_request: Request):
        """获取任务状态"""
        await check_rate_limit(http_request)
        if not TASK_ID_PATTERN.match(task_id):
            raise HTTPException(status_code=400, detail="Invalid task_id format")
        if task_id not in task_store:
            raise HTTPException(status_code=404, detail="Task not found")
        return task_store[task_id]

    @app.get("/api/v1/tasks", response_model=TaskListResponse)
    async def list_tasks(
        http_request: Request,
        page: int = 1,
        page_size: int = 10,
        search: Optional[str] = None,
        status: Optional[str] = None
    ):
        """列出所有任务，支持分页和搜索"""
        await check_rate_limit(http_request)
        """列出所有任务，支持分页和搜索"""
        page_size = min(page_size, 100)
        tasks = list(task_store.values())
        
        if search:
            search_lower = search.lower()
            tasks = [
                t for t in tasks
                if search_lower in t.company.lower() or search_lower in (t.trading_plan.rationale if t.trading_plan else "").lower()
            ]
        
        if status:
            tasks = [t for t in tasks if t.status.value == status]
        
        # 排序：按创建时间倒序
        tasks.sort(key=lambda x: x.created_at, reverse=True)
        
        # 分页
        total = len(tasks)
        start = (page - 1) * page_size
        end = start + page_size
        
        return TaskListResponse(
            tasks=tasks[start:end],
            total=total,
            page=page,
            page_size=page_size,
        )

    @app.websocket("/ws/{task_id}")
    async def websocket_endpoint(
        websocket: WebSocket, 
        task_id: str,
        token: Optional[str] = Query(None, alias="token")
    ):
        """WebSocket实时推送"""
        client_ip = websocket.client.host if websocket.client else "unknown"
        client_id = f"{client_ip}:{task_id}"
        
        if not TASK_ID_PATTERN.match(task_id):
            audit_logger.log("auth_failed", client_ip=client_ip, details={"reason": "invalid_task_id"})
            await websocket.close(code=4000, reason="Invalid task_id format")
            return
        
        expected_token = os.getenv("WS_AUTH_TOKEN")
        if expected_token:
            if not token or token != expected_token:
                audit_logger.log("auth_failed", client_ip=client_ip, details={"reason": "missing_or_invalid_token"})
                await websocket.close(code=4002, reason="Unauthorized")
                return
        
        allowed, msg = ws_rate_limiter.is_connection_allowed(client_ip)
        if not allowed:
            audit_logger.log("rate_limit_exceeded", client_ip=client_ip, success=False, details={"reason": msg})
            await websocket.close(code=4001, reason=msg)
            return
        
        await manager.connect(websocket, task_id)
        
        audit_logger.log(
            "websocket_connected",
            client_ip=client_ip,
            details={"task_id": task_id}
        )
        
        try:
            while True:
                allowed, remaining = ws_rate_limiter.is_message_allowed(client_id)
                if not allowed:
                    audit_logger.log("rate_limit_exceeded", client_ip=client_ip, success=False)
                    await websocket.send_text(json.dumps({"type": "error", "error": "Rate limit exceeded"}))
                    break
                
                data = await websocket.receive_text()
                
                try:
                    message = json.loads(data)
                except json.JSONDecodeError:
                    await websocket.send_text(json.dumps({
                        "type": "error", 
                        "error": "Invalid JSON format"
                    }))
                    continue
                
                if not isinstance(message, dict):
                    await websocket.send_text(json.dumps({
                        "type": "error", 
                        "error": "Message must be a JSON object"
                    }))
                    continue
                
                message_type = message.get("type")
                
                if message_type == "ping":
                    await websocket.send_text(
                        json.dumps(
                            WebSocketMessage(
                                type="pong",
                                task_id=task_id,
                            ).model_dump()
                        )
                    )
                else:
                    await websocket.send_text(json.dumps({
                        "type": "error", 
                        "error": f"Unknown message type: {message_type}"
                    }))
        except WebSocketDisconnect:
            manager.disconnect(websocket, task_id)
            ws_rate_limiter.release_connection(client_ip)
            audit_logger.log("websocket_disconnected", client_ip=client_ip, details={"task_id": task_id})
        except Exception:
            manager.disconnect(websocket, task_id)
            ws_rate_limiter.release_connection(client_ip)

    @app.post("/api/v1/code-review", response_model=CodeReviewResponse)
    async def code_review(request: CodeReviewRequest, http_request: Request):
        """代码审查接口"""
        await check_rate_limit(http_request)
        await verify_api_key()
        
        task_id = request.task_id or str(uuid.uuid4())
        if not TASK_ID_PATTERN.match(task_id):
            raise HTTPException(status_code=400, detail="Invalid task_id format")
        log.info(f"Starting code review task {task_id}")

        try:
            from ..domain_adapters.code_review import CodeReviewGraph

            provider = os.getenv("LLM_PROVIDER", "deepseek")
            api_key = os.getenv(f"{provider.upper()}_API_KEY")

            if not api_key:
                return CodeReviewResponse(
                    task_id=task_id,
                    status=TaskStatus.FAILED,
                    code=request.code[:100] + "...",
                    language=request.language,
                    created_at=datetime.now().isoformat(),
                    errors=["No API key configured"],
                )

            llm = create_llm_adapter(provider=provider, api_key=api_key)
            graph = CodeReviewGraph(llm_provider=provider)

            result = await graph.review(
                code=request.code,
                language=request.language,
                repo=request.repo or "",
                file_path=request.file_path or "",
            )

            return CodeReviewResponse(
                task_id=task_id,
                status=TaskStatus.COMPLETED,
                code=request.code[:200] + "...",
                language=request.language,
                created_at=datetime.now().isoformat(),
                completed_at=datetime.now().isoformat(),
                reports={},
                critic_arguments=result.get("critic_arguments", ""),
                advocate_arguments=result.get("advocate_arguments", ""),
                final_verdict=result.get("final_verdict", ""),
                progress=1.0,
            )

        except Exception as e:
            log.exception(f"Code review task {task_id} failed: {e}")
            return CodeReviewResponse(
                task_id=task_id,
                status=TaskStatus.FAILED,
                code=request.code[:100] + "...",
                language=request.language,
                created_at=datetime.now().isoformat(),
                errors=[str(e)],
            )

    @app.get("/api/v1/llm/cost")
    async def get_llm_cost(
        days: int = 1,
        provider: Optional[str] = None
    ):
        """获取 LLM 调用成本统计"""
        try:
            from ..monitoring.metrics import get_llm_cost_tracker
            
            tracker = get_llm_cost_tracker()
            
            if provider:
                by_provider = tracker.get_cost_by_provider(provider)
                return {
                    "provider": provider,
                    "daily_cost": tracker.get_daily_cost(days),
                    "stats": by_provider,
                }
            
            return {
                "total_calls": tracker.total_calls,
                "total_cost": tracker.total_cost,
                "total_tokens": tracker.total_tokens,
                "daily_cost": tracker.get_daily_cost(days),
                "stats": tracker.get_stats(),
            }
        except Exception as e:
            log.exception(f"Failed to get LLM cost: {e}")
            return {"error": "Failed to retrieve cost information", "type": "InternalError"}

    @app.get("/api/v1/llm/pricing")
    async def get_llm_pricing():
        """获取 LLM 定价表"""
        from ..monitoring.metrics import LLM_PRICING
        return {"pricing": LLM_PRICING}

    from .tts_routes import router as tts_router
    app.include_router(tts_router)

    return app


app = create_app()
