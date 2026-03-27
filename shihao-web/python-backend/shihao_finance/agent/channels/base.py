from abc import ABC, abstractmethod
from typing import Optional


class BaseChannel(ABC):
    """渠道基类"""
    
    @abstractmethod
    async def send(self, message: str, priority: str = "normal") -> bool:
        """发送消息"""
        pass
    
    @abstractmethod
    async def receive(self) -> Optional[dict]:
        """接收消息"""
        pass