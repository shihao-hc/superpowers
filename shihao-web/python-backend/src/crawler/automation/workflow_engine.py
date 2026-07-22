"""Smart automation workflow engine for autonomous crawling."""

from dataclasses import dataclass, field
from typing import Optional, Callable, Any
from enum import Enum
import asyncio
import json


class WorkflowStatus(Enum):
    """Workflow execution status."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"
    CANCELLED = "cancelled"


class StepType(Enum):
    """Workflow step types."""

    CRAWL = "crawl"
    EXTRACT = "extract"
    TRANSFORM = "transform"
    VALIDATE = "validate"
    SAVE = "save"
    NOTIFY = "notify"
    BRANCH = "branch"
    LOOP = "loop"
    PARALLEL = "parallel"
    WAIT = "wait"
    CONDITION = "condition"


@dataclass
class WorkflowStep:
    """Single step in workflow."""

    step_id: str
    step_type: StepType
    config: dict = field(default_factory=dict)
    next_step: Optional[str] = None
    on_error: Optional[str] = None
    condition: Optional[Callable] = None
    max_retries: int = 3
    timeout: int = 60


@dataclass
class WorkflowResult:
    """Result of workflow execution."""

    workflow_id: str
    status: WorkflowStatus
    steps_executed: list[str]
    output: Any
    errors: list[dict] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    execution_time: float = 0.0


@dataclass
class AutomationContext:
    """Shared context for workflow execution."""

    url: str
    results: dict = field(default_factory=dict)
    variables: dict = field(default_factory=dict)
    history: list = field(default_factory=list)
    errors: list = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


class WorkflowEngine:
    """
    Smart automation workflow engine.

    Features:
    - Declarative workflow definition
    - Conditional branching
    - Error recovery
    - Parallel execution
    - State persistence
    """

    def __init__(
        self,
        max_concurrent: int = 5,
        default_timeout: int = 300,
    ):
        """
        Initialize workflow engine.

        Args:
            max_concurrent: Max concurrent workflows
            default_timeout: Default timeout per workflow
        """
        self.max_concurrent = max_concurrent
        self.default_timeout = default_timeout
        self._handlers: dict[StepType, Callable] = {}
        self._workflows: dict[str, list[WorkflowStep]] = {}
        self._running: set[str] = set()
        self._lock = asyncio.Lock()

    def register_handler(
        self,
        step_type: StepType,
        handler: Callable,
    ) -> None:
        """
        Register step handler.

        Args:
            step_type: Step type to handle
            handler: Async function(step, context) -> result
        """
        self._handlers[step_type] = handler

    def define_workflow(
        self,
        workflow_id: str,
        steps: list[WorkflowStep],
    ) -> None:
        """
        Define a workflow.

        Args:
            workflow_id: Unique workflow identifier
            steps: List of workflow steps
        """
        self._workflows[workflow_id] = steps

    async def execute(
        self,
        workflow_id: str,
        url: str,
        initial_input: Any = None,
        options: Optional[dict] = None,
    ) -> WorkflowResult:
        """
        Execute workflow.

        Args:
            workflow_id: Workflow to execute
            url: Target URL
            initial_input: Initial input data
            options: Execution options

        Returns:
            WorkflowResult
        """
        if workflow_id not in self._workflows:
            raise ValueError(f"Workflow not found: {workflow_id}")

        import time

        start_time = time.time()

        context = AutomationContext(
            url=url,
            variables={"input": initial_input, "options": options or {}},
        )

        steps = self._workflows[workflow_id]
        executed = []
        errors = []
        output = None

        async with self._lock:
            self._running.add(workflow_id)

        try:
            for step in steps:
                try:
                    result = await self._execute_step(step, context)
                    executed.append(step.step_id)
                    context.history.append(
                        {
                            "step": step.step_id,
                            "result": result,
                        }
                    )
                    output = result

                    if step.condition and not step.condition(context):
                        break

                except Exception as e:
                    error_info = {
                        "step": step.step_id,
                        "error": str(e),
                        "attempt": len([x for x in executed if x == step.step_id]),
                    }
                    errors.append(error_info)
                    context.errors.append(error_info)

                    if step.on_error:
                        error_step = next(
                            (s for s in steps if s.step_id == step.on_error), None
                        )
                        if error_step:
                            await self._execute_step(error_step, context)

                    if (
                        len([x for x in executed if x == step.step_id])
                        >= step.max_retries
                    ):
                        break

        finally:
            async with self._lock:
                self._running.discard(workflow_id)

        return WorkflowResult(
            workflow_id=workflow_id,
            status=WorkflowStatus.FAILED if errors else WorkflowStatus.COMPLETED,
            steps_executed=executed,
            output=output,
            errors=errors,
            execution_time=time.time() - start_time,
        )

    async def _execute_step(
        self,
        step: WorkflowStep,
        context: AutomationContext,
    ) -> Any:
        """Execute single step."""
        handler = self._handlers.get(step.step_type)

        if not handler:
            return None

        return await asyncio.wait_for(
            handler(step, context),
            timeout=step.timeout,
        )

    def get_status(self) -> dict:
        """Get engine status."""
        return {
            "running": len(self._running),
            "max_concurrent": self.max_concurrent,
            "workflows": len(self._workflows),
            "handlers": len(self._handlers),
        }


class SmartCrawlWorkflow:
    """
    Pre-built smart crawl workflow.

    Automatically handles:
    - Strategy selection
    - Error recovery
    - Data extraction
    - Validation
    """

    @staticmethod
    def create_workflow(engine: WorkflowEngine) -> str:
        """Create and register smart crawl workflow."""
        workflow_id = "smart_crawl"

        steps = [
            WorkflowStep(
                step_id="detect",
                step_type=StepType.CRAWL,
                config={"mode": "detect"},
                next_step="extract",
            ),
            WorkflowStep(
                step_id="extract",
                step_type=StepType.EXTRACT,
                config={"extractors": ["structured", "multimodal"]},
                next_step="validate",
            ),
            WorkflowStep(
                step_id="validate",
                step_type=StepType.VALIDATE,
                config={"min_confidence": 0.7},
                next_step="transform",
            ),
            WorkflowStep(
                step_id="transform",
                step_type=StepType.TRANSFORM,
                config={"normalize": True},
            ),
        ]

        engine.define_workflow(workflow_id, steps)

        return workflow_id

    @staticmethod
    def register_handlers(
        engine: WorkflowEngine,
        crawler,
        extractors: dict,
    ) -> None:
        """Register handlers for smart crawl workflow."""

        async def crawl_handler(step: WorkflowStep, context: AutomationContext):
            mode = step.config.get("mode", "auto")

            if mode == "detect":
                result = await crawler.crawl(context.url, strategy="auto")
            else:
                result = await crawler.crawl(
                    context.url,
                    strategy=mode,
                )

            context.results["raw"] = result
            return result

        async def extract_handler(step: WorkflowStep, context: AutomationContext):
            raw = context.results.get("raw", {})
            content = raw.get("content", "")

            extracted = {}

            if "structured" in step.config.get("extractors", []):
                from ..multimodal import MultimodalExtractor

                extractor = MultimodalExtractor()
                result = extractor.extract(content)
                extracted["multimodal"] = result

            context.results["extracted"] = extracted
            return extracted

        async def validate_handler(step: WorkflowStep, context: AutomationContext):
            extracted = context.results.get("extracted", {})
            min_conf = step.config.get("min_confidence", 0.7)

            validation = {
                "passed": True,
                "issues": [],
            }

            if not extracted:
                validation["passed"] = False
                validation["issues"].append("No content extracted")

            context.results["validation"] = validation
            return validation

        async def transform_handler(step: WorkflowStep, context: AutomationContext):
            extracted = context.results.get("extracted", {})
            normalize = step.config.get("normalize", True)

            result = {
                "url": context.url,
                "data": extracted,
                "normalized": normalize,
            }

            return result

        engine.register_handler(StepType.CRAWL, crawl_handler)
        engine.register_handler(StepType.EXTRACT, extract_handler)
        engine.register_handler(StepType.VALIDATE, validate_handler)
        engine.register_handler(StepType.TRANSFORM, transform_handler)


def quick_crawl_workflow(url: str, crawler) -> WorkflowResult:
    """
    Quick smart crawl using default workflow.

    Args:
        url: Target URL
        crawler: CrawlerEngine instance

    Returns:
        WorkflowResult with extracted data
    """
    engine = WorkflowEngine()
    workflow_id = SmartCrawlWorkflow.create_workflow(engine)
    SmartCrawlWorkflow.register_handlers(engine, crawler, {})

    return asyncio.run(engine.execute(workflow_id, url))
