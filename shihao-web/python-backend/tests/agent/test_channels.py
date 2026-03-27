import pytest
from shihao_finance.agent.channels.base import BaseChannel
from shihao_finance.agent.channels.hub import NotificationHub


class MockChannel(BaseChannel):
    """测试用Mock渠道"""
    
    def __init__(self):
        self.sent_messages = []
    
    async def send(self, message: str, priority: str = "normal") -> bool:
        self.sent_messages.append({"message": message, "priority": priority})
        return True
    
    async def receive(self):
        return None


class TestChannels:
    def test_notification_hub(self):
        """测试通知中心"""
        hub = NotificationHub()
        mock = MockChannel()
        
        hub.register("mock", mock)
        assert "mock" in hub.channels
    
    @pytest.mark.asyncio
    async def test_send_notification(self):
        """测试发送通知"""
        hub = NotificationHub()
        mock = MockChannel()
        hub.register("mock", mock)
        
        await hub.send(
            title="测试",
            content="测试内容",
            channels=["mock"]
        )
        
        assert len(mock.sent_messages) == 1