"""Execution module - Tree-based execution engine inspired by EasySpider."""

from .nodes import (
    NodeType,
    LoopType,
    JudgeType,
    ExtractType,
    ContentType,
    Node,
    LoopNode,
    BranchNode,
    ExtractNode,
    OperationNode,
)
from .executor import ExecutionEngine, ExecutionContext, ExecutionResult, ExecutionState
from .checkpoint import CheckpointManager, Checkpoint

__all__ = [
    "NodeType",
    "LoopType",
    "JudgeType",
    "ExtractType",
    "ContentType",
    "Node",
    "LoopNode",
    "BranchNode",
    "ExtractNode",
    "OperationNode",
    "ExecutionEngine",
    "ExecutionContext",
    "ExecutionResult",
    "ExecutionState",
    "CheckpointManager",
    "Checkpoint",
]
