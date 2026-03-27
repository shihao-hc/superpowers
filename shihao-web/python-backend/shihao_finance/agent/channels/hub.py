import asyncio
from typing import Optional
from shihao_finance.agent.channels.base import BaseChannel


class NotificationHub:
    """通知分发中心"""
    
    def __init__(self):
        self.channels: dict[str, BaseChannel] = {}
        self.priority_rules = {
            "critical": ["telegram", "discord", "wechat", "email"],
            "high": ["telegram", "discord"],
            "normal": ["telegram"],
            "low": ["email"]
        }
    
    def register(self, name: str, channel: BaseChannel):
        """注册渠道"""
        self.channels[name] = channel
    
    async def send(self, title: str, content: str,
                   priority: str = "normal",
                   channels: list[str] = None) -> dict:
        """发送通知"""
        
        target_channels = channels or self.priority_rules.get(priority, [])
        
        results = {}
        tasks = []
        
        for channel_name in target_channels:
            if channel_name in self.channels:
                tasks.append(
                    self._send_to_channel(channel_name, f"{title}\n\n{content}", priority)
                )
        
        if tasks:
            outcomes = await asyncio.gather(*tasks, return_exceptions=True)
            for channel_name, outcome in zip(target_channels, outcomes):
                results[channel_name] = not isinstance(outcome, Exception)
        
        return results
    
    async def _send_to_channel(self, channel_name: str, message: str, priority: str):
        """发送到单个渠道"""
        try:
            return await self.channels[channel_name].send(message, priority)
        except Exception as e:
            print(f"[NotificationHub] {channel_name} failed: {e}")
            raise