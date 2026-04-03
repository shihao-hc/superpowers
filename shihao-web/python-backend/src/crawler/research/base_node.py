"""Base node abstraction for processing pipeline."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional, Dict, List
from datetime import datetime
import logging


logger = logging.getLogger(__name__)


class BaseNode(ABC):
    """Abstract base class for processing nodes."""

    def __init__(self, name: str):
        self.node_name = name
        self._logger = logging.getLogger(f"{__name__}.{name}")

    @abstractmethod
    def run(self, input_data: Any, **kwargs) -> Any:
        """Core processing logic."""
        pass

    def log_info(self, message: str):
        """Log info message."""
        self._logger.info(f"[{self.node_name}] {message}")

    def log_warning(self, message: str):
        """Log warning message."""
        self._logger.warning(f"[{self.node_name}] {message}")

    def log_error(self, message: str):
        """Log error message."""
        self._logger.error(f"[{self.node_name}] {message}")

    def log_debug(self, message: str):
        """Log debug message."""
        self._logger.debug(f"[{self.node_name}] {message}")


@dataclass
class NodeResult:
    """Result from a node execution."""

    success: bool
    data: Any = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "data": self.data,
            "error": self.error,
            "metadata": self.metadata,
            "timestamp": self.timestamp,
        }


class ProcessingNode(BaseNode):
    """Node that transforms input to output without state mutation."""

    @abstractmethod
    def process(self, input_data: Any, **kwargs) -> Any:
        """Processing logic."""
        pass

    def run(self, input_data: Any, **kwargs) -> NodeResult:
        try:
            result = self.process(input_data, **kwargs)
            return NodeResult(success=True, data=result)
        except Exception as e:
            self.log_error(f"Processing failed: {e}")
            return NodeResult(success=False, error=str(e))


class StateMutationNode(BaseNode):
    """Node that modifies state and returns output."""

    @abstractmethod
    def mutate_state(
        self, input_data: Any, state: Optional[Dict[str, Any]] = None, **kwargs
    ) -> tuple[Any, Dict[str, Any]]:
        """Process and return (output, new_state)."""
        pass

    def run(
        self, input_data: Any, state: Optional[Dict[str, Any]] = None, **kwargs
    ) -> NodeResult:
        try:
            output, new_state = self.mutate_state(input_data, state, **kwargs)
            return NodeResult(success=True, data=output, metadata={"state": new_state})
        except Exception as e:
            self.log_error(f"State mutation failed: {e}")
            return NodeResult(success=False, error=str(e))


class ConditionalNode(BaseNode):
    """Node that selects child nodes based on condition."""

    def __init__(self, name: str, branches: Dict[str, BaseNode]):
        super().__init__(name)
        self.branches = branches
        self.default_branch = branches.get("default")

    @abstractmethod
    def evaluate_condition(self, input_data: Any, **kwargs) -> str:
        """Return branch name to execute."""
        pass

    def run(self, input_data: Any, **kwargs) -> NodeResult:
        try:
            branch_name = self.evaluate_condition(input_data, **kwargs)
            branch = self.branches.get(branch_name, self.default_branch)

            if not branch:
                return NodeResult(
                    success=False,
                    error=f"No branch found for condition: {branch_name}",
                )

            return branch.run(input_data, **kwargs)
        except Exception as e:
            self.log_error(f"Conditional execution failed: {e}")
            return NodeResult(success=False, error=str(e))


class PipelineNode(BaseNode):
    """Node that chains multiple nodes together."""

    def __init__(self, name: str, nodes: List[BaseNode]):
        super().__init__(name)
        self.nodes = nodes

    def run(self, input_data: Any, **kwargs) -> NodeResult:
        current_data = input_data
        all_metadata = {}

        for node in self.nodes:
            self.log_info(f"Executing node: {node.node_name}")
            result = node.run(current_data, **kwargs)

            if not result.success:
                return NodeResult(
                    success=False,
                    error=f"Node {node.node_name} failed: {result.error}",
                    metadata=all_metadata,
                )

            current_data = result.data
            all_metadata.update(result.metadata or {})

        return NodeResult(success=True, data=current_data, metadata=all_metadata)


class ParallelNode(BaseNode):
    """Node that executes multiple nodes in parallel."""

    def __init__(self, name: str, nodes: List[BaseNode]):
        super().__init__(name)
        self.nodes = nodes

    async def run_async(self, input_data: Any, **kwargs) -> NodeResult:
        """Execute all nodes in parallel."""
        import asyncio

        try:
            tasks = [node.run(input_data, **kwargs) for node in self.nodes]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            success_results = []
            errors = []
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    errors.append(f"Node {i}: {str(result)}")
                elif not result.success:
                    errors.append(f"Node {i}: {result.error}")
                else:
                    success_results.append(result.data)

            if errors:
                return NodeResult(
                    success=False,
                    error="; ".join(errors),
                    metadata={"partial_results": success_results},
                )

            return NodeResult(success=True, data=success_results)
        except Exception as e:
            self.log_error(f"Parallel execution failed: {e}")
            return NodeResult(success=False, error=str(e))

    def run(self, input_data: Any, **kwargs) -> NodeResult:
        """Synchronous wrapper - use run_async for parallel execution."""
        self.log_warning("Synchronous run called on ParallelNode - use run_async")
        return NodeResult(success=False, error="Use run_async for parallel execution")
