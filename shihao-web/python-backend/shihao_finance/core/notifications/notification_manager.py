"""
多渠道通知系统 (基于daily_stock_analysis)

Supports multiple notification channels:
- Email (SMTP)
- 企业微信 (WeChat Work)
- 飞书 (Feishu/Lark)
- Telegram
- Discord
- 钉钉 (DingTalk)
- Pushover

Based on daily_stock_analysis multi-channel notification design.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field
import asyncio
import json
from loguru import logger

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

try:
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    HAS_EMAIL = True
except ImportError:
    HAS_EMAIL = False


class ChannelType(Enum):
    """Notification channel types."""
    EMAIL = "email"
    WECHAT_WORK = "wechat_work"    # 企业微信
    FEISHU = "feishu"              # 飞书
    TELEGRAM = "telegram"
    DISCORD = "discord"
    DINGTALK = "dingtalk"          # 钉钉
    PUSHOVER = "pushover"


class NotificationPriority(Enum):
    """Notification priority levels."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class Notification(BaseModel):
    """Notification message."""
    title: str
    content: str
    priority: NotificationPriority = NotificationPriority.NORMAL
    channels: List[ChannelType] = []
    metadata: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.now)


class NotificationResult(BaseModel):
    """Result of sending notification."""
    channel: ChannelType
    success: bool
    message: str
    timestamp: datetime = Field(default_factory=datetime.now)


class BaseChannel(ABC):
    """Abstract base class for notification channels."""
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.enabled = self.config.get("enabled", True)
    
    @abstractmethod
    async def send(self, notification: Notification) -> NotificationResult:
        """Send notification through this channel."""
        pass
    
    @property
    @abstractmethod
    def channel_type(self) -> ChannelType:
        """Channel type."""
        pass
    
    def validate_config(self) -> bool:
        """Validate channel configuration."""
        return True


class EmailChannel(BaseChannel):
    """Email notification channel (SMTP)."""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.smtp_host = self.config.get("smtp_host", "smtp.gmail.com")
        self.smtp_port = self.config.get("smtp_port", 587)
        self.username = self.config.get("username", "")
        self.password = self.config.get("password", "")
        self.from_email = self.config.get("from_email", self.username)
        self.to_emails = self.config.get("to_emails", [])
    
    @property
    def channel_type(self) -> ChannelType:
        return ChannelType.EMAIL
    
    def validate_config(self) -> bool:
        return all([self.smtp_host, self.username, self.password, self.to_emails])
    
    async def send(self, notification: Notification) -> NotificationResult:
        if not HAS_EMAIL:
            return NotificationResult(
                channel=self.channel_type,
                success=False,
                message="email library not available"
            )
        
        try:
            msg = MIMEMultipart()
            msg['From'] = self.from_email
            msg['To'] = ', '.join(self.to_emails)
            msg['Subject'] = f"[ShiHao] {notification.title}"
            
            # Add priority header
            if notification.priority == NotificationPriority.URGENT:
                msg['X-Priority'] = '1'
            
            body = f"""
            <html>
            <body>
                <h2>{notification.title}</h2>
                <p>{notification.content.replace(chr(10), '<br>')}</p>
                <hr>
                <small>Sent at {notification.timestamp.strftime('%Y-%m-%d %H:%M:%S')}</small>
            </body>
            </html>
            """
            
            msg.attach(MIMEText(body, 'html'))
            
            # Send email
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.username, self.password)
                server.send_message(msg)
            
            return NotificationResult(
                channel=self.channel_type,
                success=True,
                message="Email sent successfully"
            )
            
        except Exception as e:
            logger.error(f"Email send failed: {e}")
            return NotificationResult(
                channel=self.channel_type,
                success=False,
                message=str(e)
            )


class WeChatWorkChannel(BaseChannel):
    """企业微信 notification channel (Webhook)."""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.webhook_url = self.config.get("webhook_url", "")
    
    @property
    def channel_type(self) -> ChannelType:
        return ChannelType.WECHAT_WORK
    
    def validate_config(self) -> bool:
        return bool(self.webhook_url)
    
    async def send(self, notification: Notification) -> NotificationResult:
        if not HAS_HTTPX:
            return NotificationResult(
                channel=self.channel_type,
                success=False,
                message="httpx library not available"
            )
        
        if not self.webhook_url:
            return NotificationResult(
                channel=self.channel_type,
                success=False,
                message="Webhook URL not configured"
            )
        
        try:
            # WeChat Work markdown message
            data = {
                "msgtype": "markdown",
                "markdown": {
                    "content": f"## {notification.title}\n\n{notification.content}"
                }
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(self.webhook_url, json=data)
                
                if response.status_code == 200:
                    return NotificationResult(
                        channel=self.channel_type,
                        success=True,
                        message="WeChat Work notification sent"
                    )
                else:
                    return NotificationResult(
                        channel=self.channel_type,
                        success=False,
                        message=f"HTTP {response.status_code}"
                    )
                    
        except Exception as e:
            logger.error(f"WeChat Work send failed: {e}")
            return NotificationResult(
                channel=self.channel_type,
                success=False,
                message=str(e)
            )


class FeishuChannel(BaseChannel):
    """飞书 (Feishu/Lark) notification channel (Webhook)."""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.webhook_url = self.config.get("webhook_url", "")
        self.secret = self.config.get("secret", "")  # Optional signing secret
    
    @property
    def channel_type(self) -> ChannelType:
        return ChannelType.FEISHU
    
    def validate_config(self) -> bool:
        return bool(self.webhook_url)
    
    async def send(self, notification: Notification) -> NotificationResult:
        if not HAS_HTTPX:
            return NotificationResult(
                channel=self.channel_type,
                success=False,
                message="httpx library not available"
            )
        
        try:
            # Feishu interactive card message
            data = {
                "msg_type": "interactive",
                "card": {
                    "header": {
                        "title": {
                            "tag": "plain_text",
                            "content": notification.title
                        },
                        "template": "red" if notification.priority == NotificationPriority.URGENT else "blue"
                    },
                    "elements": [
                        {
                            "tag": "markdown",
                            "content": notification.content
                        },
                        {
                            "tag": "note",
                            "elements": [
                                {
                                    "tag": "plain_text",
                                    "content": f"Sent at {notification.timestamp.strftime('%Y-%m-%d %H:%M:%S')}"
                                }
                            ]
                        }
                    ]
                }
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(self.webhook_url, json=data)
                
                return NotificationResult(
                    channel=self.channel_type,
                    success=response.status_code == 200,
                    message="Feishu notification sent" if response.status_code == 200 else f"HTTP {response.status_code}"
                )
                    
        except Exception as e:
            logger.error(f"Feishu send failed: {e}")
            return NotificationResult(
                channel=self.channel_type,
                success=False,
                message=str(e)
            )


class TelegramChannel(BaseChannel):
    """Telegram notification channel."""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.bot_token = self.config.get("bot_token", "")
        self.chat_id = self.config.get("chat_id", "")
    
    @property
    def channel_type(self) -> ChannelType:
        return ChannelType.TELEGRAM
    
    def validate_config(self) -> bool:
        return all([self.bot_token, self.chat_id])
    
    async def send(self, notification: Notification) -> NotificationResult:
        if not HAS_HTTPX:
            return NotificationResult(
                channel=self.channel_type,
                success=False,
                message="httpx library not available"
            )
        
        try:
            url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
            
            # Escape markdown
            text = f"*{notification.title}*\n\n{notification.content}"
            
            data = {
                "chat_id": self.chat_id,
                "text": text,
                "parse_mode": "Markdown"
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=data)
                
                return NotificationResult(
                    channel=self.channel_type,
                    success=response.status_code == 200,
                    message="Telegram notification sent" if response.status_code == 200 else f"HTTP {response.status_code}"
                )
                    
        except Exception as e:
            logger.error(f"Telegram send failed: {e}")
            return NotificationResult(
                channel=self.channel_type,
                success=False,
                message=str(e)
            )


class DiscordChannel(BaseChannel):
    """Discord notification channel (Webhook)."""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.webhook_url = self.config.get("webhook_url", "")
    
    @property
    def channel_type(self) -> ChannelType:
        return ChannelType.DISCORD
    
    def validate_config(self) -> bool:
        return bool(self.webhook_url)
    
    async def send(self, notification: Notification) -> NotificationResult:
        if not HAS_HTTPX:
            return NotificationResult(
                channel=self.channel_type,
                success=False,
                message="httpx library not available"
            )
        
        try:
            # Discord embed message
            color = 0xFF0000 if notification.priority == NotificationPriority.URGENT else 0x00FF00
            
            data = {
                "embeds": [{
                    "title": notification.title,
                    "description": notification.content,
                    "color": color,
                    "timestamp": notification.timestamp.isoformat()
                }]
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(self.webhook_url, json=data)
                
                return NotificationResult(
                    channel=self.channel_type,
                    success=response.status_code == 204,
                    message="Discord notification sent" if response.status_code == 204 else f"HTTP {response.status_code}"
                )
                    
        except Exception as e:
            logger.error(f"Discord send failed: {e}")
            return NotificationResult(
                channel=self.channel_type,
                success=False,
                message=str(e)
            )


class DingTalkChannel(BaseChannel):
    """钉钉 (DingTalk) notification channel (Webhook)."""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.webhook_url = self.config.get("webhook_url", "")
        self.secret = self.config.get("secret", "")
    
    @property
    def channel_type(self) -> ChannelType:
        return ChannelType.DINGTALK
    
    def validate_config(self) -> bool:
        return bool(self.webhook_url)
    
    async def send(self, notification: Notification) -> NotificationResult:
        if not HAS_HTTPX:
            return NotificationResult(
                channel=self.channel_type,
                success=False,
                message="httpx library not available"
            )
        
        try:
            # DingTalk markdown message
            data = {
                "msgtype": "markdown",
                "markdown": {
                    "title": notification.title,
                    "text": f"### {notification.title}\n\n{notification.content}"
                }
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(self.webhook_url, json=data)
                
                return NotificationResult(
                    channel=self.channel_type,
                    success=response.status_code == 200,
                    message="DingTalk notification sent" if response.status_code == 200 else f"HTTP {response.status_code}"
                )
                    
        except Exception as e:
            logger.error(f"DingTalk send failed: {e}")
            return NotificationResult(
                channel=self.channel_type,
                success=False,
                message=str(e)
            )


class NotificationManager:
    """
    多渠道通知管理器 (Multi-Channel Notification Manager)
    
    Based on daily_stock_analysis notification system design.
    Supports sending notifications to multiple channels simultaneously.
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        
        # Initialize channels
        self.channels: Dict[ChannelType, BaseChannel] = {}
        
        channel_configs = self.config.get("channels", {})
        
        # Always initialize available channels
        self.channels[ChannelType.EMAIL] = EmailChannel(channel_configs.get("email", {}))
        self.channels[ChannelType.WECHAT_WORK] = WeChatWorkChannel(channel_configs.get("wechat_work", {}))
        self.channels[ChannelType.FEISHU] = FeishuChannel(channel_configs.get("feishu", {}))
        self.channels[ChannelType.TELEGRAM] = TelegramChannel(channel_configs.get("telegram", {}))
        self.channels[ChannelType.DISCORD] = DiscordChannel(channel_configs.get("discord", {}))
        self.channels[ChannelType.DINGTALK] = DingTalkChannel(channel_configs.get("dingtalk", {}))
        
        logger.info(f"NotificationManager initialized with {len(self.channels)} channels")
    
    async def send(
        self,
        notification: Notification,
        channels: List[ChannelType] = None
    ) -> List[NotificationResult]:
        """
        Send notification to specified channels.
        
        If channels is None, send to all enabled channels.
        """
        results = []
        
        # Determine target channels
        if channels:
            target_channels = [self.channels[c] for c in channels if c in self.channels]
        else:
            target_channels = [c for c in self.channels.values() if c.enabled and c.validate_config()]
        
        # Send to all channels concurrently
        tasks = [channel.send(notification) for channel in target_channels]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Convert exceptions to failed results
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                final_results.append(NotificationResult(
                    channel=target_channels[i].channel_type,
                    success=False,
                    message=str(result)
                ))
            else:
                final_results.append(result)
        
        return final_results
    
    async def send_alert(
        self,
        symbol: str,
        title: str,
        message: str,
        priority: NotificationPriority = NotificationPriority.NORMAL,
        channels: List[ChannelType] = None
    ) -> List[NotificationResult]:
        """Convenience method for sending stock alerts."""
        notification = Notification(
            title=f"[{symbol}] {title}",
            content=message,
            priority=priority,
            channels=channels or []
        )
        return await self.send(notification, channels)
    
    async def send_daily_report(
        self,
        report_content: str,
        channels: List[ChannelType] = None
    ) -> List[NotificationResult]:
        """Send daily analysis report."""
        notification = Notification(
            title="📊 每日股票分析报告",
            content=report_content,
            priority=NotificationPriority.NORMAL,
            channels=channels or []
        )
        return await self.send(notification, channels)
    
    def get_available_channels(self) -> List[Dict[str, Any]]:
        """Get list of available and configured channels."""
        available = []
        for channel_type, channel in self.channels.items():
            available.append({
                "type": channel_type.value,
                "enabled": channel.enabled,
                "configured": channel.validate_config()
            })
        return available
    
    def enable_channel(self, channel_type: ChannelType):
        """Enable a notification channel."""
        if channel_type in self.channels:
            self.channels[channel_type].enabled = True
    
    def disable_channel(self, channel_type: ChannelType):
        """Disable a notification channel."""
        if channel_type in self.channels:
            self.channels[channel_type].enabled = False