"""
Task Progress Tracker
任务进度追踪系统 - 实时追踪Agent任务执行进度
"""

import json
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Callable
from dataclasses import dataclass, field, asdict
from enum import Enum
from threading import Thread, Event, Lock
from concurrent.futures import ThreadPoolExecutor
import os


class TaskStatus(Enum):
    """任务状态枚举"""

    PENDING = "pending"  # 等待中
    ASSIGNED = "assigned"  # 已分配
    IN_PROGRESS = "in_progress"  # 进行中
    PAUSED = "paused"  # 暂停
    COMPLETED = "completed"  # 已完成
    FAILED = "failed"  # 失败
    CANCELLED = "cancelled"  # 已取消


class TaskPriority(Enum):
    """任务优先级枚举"""

    CRITICAL = 1  # 紧急
    HIGH = 2  # 高
    MEDIUM = 3  # 中
    LOW = 4  # 低


@dataclass
class TaskProgress:
    """任务进度数据类"""

    task_id: str
    task_name: str
    description: str
    assigned_agent: str
    status: str = TaskStatus.PENDING.value
    priority: int = TaskPriority.MEDIUM.value
    progress_percent: float = 0.0
    current_step: str = ""
    total_steps: int = 1
    completed_steps: int = 0
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    estimated_duration: Optional[float] = None  # 秒
    actual_duration: Optional[float] = None
    result: Optional[Any] = None
    error: Optional[str] = None
    subtasks: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)

    def update_progress(self, step: str, completed: int, total: int):
        """更新进度"""
        self.current_step = step
        self.completed_steps = completed
        self.total_steps = total
        self.progress_percent = (completed / total * 100) if total > 0 else 0


class TaskProgressTracker:
    """
    任务进度追踪器

    功能:
    1. 实时追踪任务执行进度
    2. 生成进度报告
    3. 支持进度回调通知
    4. 任务队列管理
    """

    def __init__(self, log_dir: str = "logs/task_progress"):
        self.log_dir = log_dir
        os.makedirs(log_dir, exist_ok=True)

        # 任务存储
        self.tasks: Dict[str, TaskProgress] = {}
        self.completed_tasks: Dict[str, TaskProgress] = {}

        # 线程安全锁
        self._lock = Lock()

        # 进度回调函数
        self._progress_callbacks: List[Callable[[str, TaskProgress], None]] = []

        # 任务队列
        self.task_queue: List[str] = []

        # 统计信息
        self.stats = {
            "total_tasks": 0,
            "completed_tasks": 0,
            "failed_tasks": 0,
            "total_duration": 0,
        }

    def register_progress_callback(self, callback: Callable[[str, TaskProgress], None]):
        """注册进度回调函数"""
        self._progress_callbacks.append(callback)

    def _notify_progress(self, event: str, task: TaskProgress):
        """通知进度更新"""
        for callback in self._progress_callbacks:
            try:
                callback(event, task)
            except Exception as e:
                print(f"Progress callback error: {e}")

    def create_task(
        self,
        task_name: str,
        description: str,
        assigned_agent: str,
        priority: TaskPriority = TaskPriority.MEDIUM,
        estimated_duration: Optional[float] = None,
        total_steps: int = 1,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """创建新任务"""
        with self._lock:
            task_id = f"task_{len(self.tasks) + len(self.completed_tasks) + 1:06d}"

            task = TaskProgress(
                task_id=task_id,
                task_name=task_name,
                description=description,
                assigned_agent=assigned_agent,
                priority=priority.value,
                estimated_duration=estimated_duration,
                total_steps=total_steps,
                metadata=metadata or {},
            )

            self.tasks[task_id] = task
            self.task_queue.append(task_id)
            self.stats["total_tasks"] += 1

            self._notify_progress("created", task)

            return task_id

    def assign_task(self, task_id: str, agent: str) -> bool:
        """分配任务给Agent"""
        with self._lock:
            if task_id not in self.tasks:
                return False

            task = self.tasks[task_id]
            task.assigned_agent = agent
            task.status = TaskStatus.ASSIGNED.value

            self._notify_progress("assigned", task)

            return True

    def start_task(self, task_id: str) -> bool:
        """开始执行任务"""
        with self._lock:
            if task_id not in self.tasks:
                return False

            task = self.tasks[task_id]
            task.status = TaskStatus.IN_PROGRESS.value
            task.started_at = datetime.now().isoformat()

            self._notify_progress("started", task)

            return True

    def update_task_progress(
        self, task_id: str, step: str, completed: int, total: int
    ) -> bool:
        """更新任务进度"""
        with self._lock:
            if task_id not in self.tasks:
                return False

            task = self.tasks[task_id]
            task.update_progress(step, completed, total)

            self._notify_progress("progress_updated", task)

            return True

    def complete_task(self, task_id: str, result: Any = None) -> bool:
        """完成任务"""
        with self._lock:
            if task_id not in self.tasks:
                return False

            task = self.tasks[task_id]
            task.status = TaskStatus.COMPLETED.value
            task.progress_percent = 100.0
            task.completed_at = datetime.now().isoformat()
            task.result = result

            # 计算实际耗时
            if task.started_at:
                start = datetime.fromisoformat(task.started_at)
                end = datetime.fromisoformat(task.completed_at)
                task.actual_duration = (end - start).total_seconds()

            # 移动到已完成列表
            self.completed_tasks[task_id] = task
            del self.tasks[task_id]

            if task_id in self.task_queue:
                self.task_queue.remove(task_id)

            # 更新统计
            self.stats["completed_tasks"] += 1
            if task.actual_duration:
                self.stats["total_duration"] += task.actual_duration

            self._notify_progress("completed", task)

            return True

    def fail_task(self, task_id: str, error: str) -> bool:
        """标记任务失败"""
        with self._lock:
            if task_id not in self.tasks:
                return False

            task = self.tasks[task_id]
            task.status = TaskStatus.FAILED.value
            task.error = error
            task.completed_at = datetime.now().isoformat()

            # 移动到已完成列表
            self.completed_tasks[task_id] = task
            del self.tasks[task_id]

            if task_id in self.task_queue:
                self.task_queue.remove(task_id)

            # 更新统计
            self.stats["failed_tasks"] += 1

            self._notify_progress("failed", task)

            return True

    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """获取任务状态"""
        with self._lock:
            task = self.tasks.get(task_id) or self.completed_tasks.get(task_id)
            return task.to_dict() if task else None

    def get_active_tasks(self) -> List[Dict[str, Any]]:
        """获取所有进行中的任务"""
        with self._lock:
            return [task.to_dict() for task in self.tasks.values()]

    def get_progress_report(self) -> Dict[str, Any]:
        """生成进度报告"""
        with self._lock:
            active_tasks = list(self.tasks.values())

            # 按优先级分组
            by_priority = {}
            for priority in TaskPriority:
                tasks = [t for t in active_tasks if t.priority == priority.value]
                by_priority[priority.name] = len(tasks)

            # 按Agent分组
            by_agent = {}
            for task in active_tasks:
                agent = task.assigned_agent
                by_agent[agent] = by_agent.get(agent, 0) + 1

            return {
                "timestamp": datetime.now().isoformat(),
                "active_tasks": len(active_tasks),
                "completed_tasks": len(self.completed_tasks),
                "queue_length": len(self.task_queue),
                "by_priority": by_priority,
                "by_agent": by_agent,
                "statistics": self.stats,
                "avg_duration": (
                    self.stats["total_duration"] / self.stats["completed_tasks"]
                    if self.stats["completed_tasks"] > 0
                    else 0
                ),
            }

    def export_progress(self, filepath: Optional[str] = None) -> str:
        """导出进度数据"""
        if filepath is None:
            filepath = os.path.join(
                self.log_dir,
                f"progress_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
            )

        export_data = {
            "export_time": datetime.now().isoformat(),
            "active_tasks": [t.to_dict() for t in self.tasks.values()],
            "completed_tasks": [t.to_dict() for t in self.completed_tasks.values()],
            "report": self.get_progress_report(),
        }

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2)

        return filepath


# 全局任务追踪器实例
_global_tracker: Optional[TaskProgressTracker] = None


def get_task_tracker() -> TaskProgressTracker:
    """获取全局任务追踪器实例"""
    global _global_tracker
    if _global_tracker is None:
        _global_tracker = TaskProgressTracker()
    return _global_tracker


def track_task(
    task_name: str,
    description: str,
    assigned_agent: str,
    priority: TaskPriority = TaskPriority.MEDIUM,
) -> str:
    """便捷函数：创建并追踪任务"""
    tracker = get_task_tracker()
    return tracker.create_task(
        task_name=task_name,
        description=description,
        assigned_agent=assigned_agent,
        priority=priority,
    )
