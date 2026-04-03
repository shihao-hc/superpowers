"""
Agent Communication Logger
智能体通信日志系统 - 记录Agent间的消息传递和协作过程
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, asdict
from enum import Enum
import os


class MessageType(Enum):
    """消息类型枚举"""

    TASK_ASSIGNMENT = "task_assignment"  # 任务分配
    TASK_COMPLETION = "task_completion"  # 任务完成
    DELEGATION = "delegation"  # 委托
    QUERY = "query"  # 查询
    RESPONSE = "response"  # 响应
    ERROR = "error"  # 错误
    STATUS_UPDATE = "status_update"  # 状态更新
    RESULT交付 = "result_delivery"  # 结果交付


@dataclass
class CommunicationMessage:
    """通信消息数据类"""

    message_id: str
    timestamp: str
    sender: str
    receiver: str
    message_type: str
    content: Dict[str, Any]
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> dict:
        return asdict(self)


class AgentCommunicationLogger:
    """
    Agent间通信日志记录器

    功能:
    1. 记录所有Agent间的消息传递
    2. 追踪任务分配和完成状态
    3. 生成通信报告
    4. 支持调试和审计
    """

    def __init__(self, log_dir: str = "logs/agent_communication"):
        self.log_dir = log_dir
        os.makedirs(log_dir, exist_ok=True)

        # 配置日志
        self.logger = logging.getLogger("AgentCommunication")
        self.logger.setLevel(logging.DEBUG)

        # 文件处理器
        log_file = os.path.join(
            log_dir, f"communication_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
        )
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_handler.setLevel(logging.DEBUG)

        # 格式化器
        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)s | %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
        )
        file_handler.setFormatter(formatter)
        self.logger.addHandler(file_handler)

        # 消息历史
        self.message_history: List[CommunicationMessage] = []

    def log_message(
        self,
        sender: str,
        receiver: str,
        message_type: MessageType,
        content: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        记录一条通信消息

        Args:
            sender: 发送方Agent名称
            receiver: 接收方Agent名称
            message_type: 消息类型
            content: 消息内容
            metadata: 可选元数据

        Returns:
            message_id: 消息唯一ID
        """
        message_id = f"msg_{len(self.message_history) + 1:06d}_{datetime.now().strftime('%H%M%S')}"

        message = CommunicationMessage(
            message_id=message_id,
            timestamp=datetime.now().isoformat(),
            sender=sender,
            receiver=receiver,
            message_type=message_type.value,
            content=content,
            metadata=metadata or {},
        )

        self.message_history.append(message)

        # 写入日志
        log_entry = {
            "message_id": message_id,
            "timestamp": message.timestamp,
            "from": sender,
            "to": receiver,
            "type": message_type.value,
            "content_preview": str(content)[:100] + "..."
            if len(str(content)) > 100
            else str(content),
        }

        self.logger.info(json.dumps(log_entry, ensure_ascii=False))

        return message_id

    def log_task_assignment(
        self, assigner: str, assignee: str, task_description: str, task_id: str
    ) -> str:
        """记录任务分配"""
        return self.log_message(
            sender=assigner,
            receiver=assignee,
            message_type=MessageType.TASK_ASSIGNMENT,
            content={
                "task_id": task_id,
                "description": task_description,
                "status": "assigned",
            },
            metadata={"task_type": "delegation"},
        )

    def log_task_completion(
        self,
        worker: str,
        supervisor: str,
        task_id: str,
        result: Any,
        duration_seconds: Optional[float] = None,
    ) -> str:
        """记录任务完成"""
        return self.log_message(
            sender=worker,
            receiver=supervisor,
            message_type=MessageType.TASK_COMPLETION,
            content={
                "task_id": task_id,
                "result_preview": str(result)[:200] + "..."
                if len(str(result)) > 200
                else str(result),
                "status": "completed",
            },
            metadata={
                "duration_seconds": duration_seconds,
                "result_type": type(result).__name__,
            },
        )

    def log_error(
        self,
        agent: str,
        error_type: str,
        error_message: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """记录错误"""
        return self.log_message(
            sender=agent,
            receiver="system",
            message_type=MessageType.ERROR,
            content={
                "error_type": error_type,
                "error_message": error_message,
                "context": context or {},
            },
        )

    def get_communication_summary(self) -> Dict[str, Any]:
        """获取通信摘要"""
        if not self.message_history:
            return {"total_messages": 0}

        # 统计各类型消息数量
        type_counts = {}
        agent_activity = {}

        for msg in self.message_history:
            # 消息类型统计
            msg_type = msg.message_type
            type_counts[msg_type] = type_counts.get(msg_type, 0) + 1

            # Agent活动统计
            agent_activity[msg.sender] = agent_activity.get(msg.sender, 0) + 1
            agent_activity[msg.receiver] = agent_activity.get(msg.receiver, 0) + 1

        return {
            "total_messages": len(self.message_history),
            "message_types": type_counts,
            "agent_activity": agent_activity,
            "time_range": {
                "start": self.message_history[0].timestamp,
                "end": self.message_history[-1].timestamp,
            },
        }

    def export_history(self, filepath: Optional[str] = None) -> str:
        """导出通信历史到JSON文件"""
        if filepath is None:
            filepath = os.path.join(
                self.log_dir, f"history_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            )

        history_dict = {
            "export_time": datetime.now().isoformat(),
            "total_messages": len(self.message_history),
            "messages": [msg.to_dict() for msg in self.message_history],
            "summary": self.get_communication_summary(),
        }

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(history_dict, f, ensure_ascii=False, indent=2)

        return filepath


# 全局通信记录器实例
_global_logger: Optional[AgentCommunicationLogger] = None


def get_communication_logger() -> AgentCommunicationLogger:
    """获取全局通信记录器实例"""
    global _global_logger
    if _global_logger is None:
        _global_logger = AgentCommunicationLogger()
    return _global_logger


def log_agent_communication(
    sender: str, receiver: str, message_type: MessageType, content: Dict[str, Any]
) -> str:
    """便捷函数：记录Agent通信"""
    logger = get_communication_logger()
    return logger.log_message(sender, receiver, message_type, content)
