import os
import httpx
from shihao_finance.agent.channels.base import BaseChannel


class TelegramChannel(BaseChannel):
    """Telegram渠道"""
    
    def __init__(self, token: str = None, chat_id: str = None):
        self.token = token or os.getenv("TELEGRAM_BOT_TOKEN")
        self.chat_id = chat_id or os.getenv("TELEGRAM_CHAT_ID")
        self.api_url = f"https://api.telegram.org/bot{self.token}" if self.token else None
    
    async def send(self, message: str, priority: str = "normal") -> bool:
        """发送消息到Telegram"""
        if not self.token or not self.chat_id:
            print("[Telegram] Token or Chat ID not configured")
            return False
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.api_url}/sendMessage",
                    json={
                        "chat_id": self.chat_id,
                        "text": message,
                        "parse_mode": "Markdown"
                    },
                    timeout=10
                )
                return response.status_code == 200
        except Exception as e:
            print(f"[Telegram] Send failed: {e}")
            return False
    
    async def receive(self):
        """Telegram接收需要webhook/polling，暂不实现"""
        return None


class DiscordChannel(BaseChannel):
    """Discord渠道"""
    
    def __init__(self, webhook_url: str = None):
        self.webhook_url = webhook_url or os.getenv("DISCORD_WEBHOOK_URL")
    
    async def send(self, message: str, priority: str = "normal") -> bool:
        """发送消息到Discord"""
        if not self.webhook_url:
            print("[Discord] Webhook URL not configured")
            return False
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.webhook_url,
                    json={"content": message},
                    timeout=10
                )
                return response.status_code in [200, 204]
        except Exception as e:
            print(f"[Discord] Send failed: {e}")
            return False
    
    async def receive(self):
        return None


class WeChatChannel(BaseChannel):
    """微信渠道 (企业微信/公众号)"""
    
    def __init__(self, webhook_key: str = None):
        self.webhook_key = webhook_key or os.getenv("WECHAT_WEBHOOK_KEY")
    
    async def send(self, message: str, priority: str = "normal") -> bool:
        """发送消息到企业微信"""
        if not self.webhook_key:
            print("[WeChat] Webhook key not configured")
            return False
        
        try:
            url = f"https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key={self.webhook_key}"
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json={"msgtype": "text", "text": {"content": message}},
                    timeout=10
                )
                return response.status_code == 200
        except Exception as e:
            print(f"[WeChat] Send failed: {e}")
            return False
    
    async def receive(self):
        return None


class EmailChannel(BaseChannel):
    """Email渠道"""
    
    def __init__(self, smtp_host: str = None, smtp_port: int = 587,
                 username: str = None, password: str = None,
                 from_addr: str = None, to_addrs: list = None):
        self.smtp_host = smtp_host or os.getenv("SMTP_HOST")
        self.smtp_port = smtp_port or int(os.getenv("SMTP_PORT", "587"))
        self.username = username or os.getenv("SMTP_USERNAME")
        self.password = password or os.getenv("SMTP_PASSWORD")
        self.from_addr = from_addr or os.getenv("SMTP_FROM", self.username)
        self.to_addrs = to_addrs or os.getenv("SMTP_TO", "").split(",")
    
    async def send(self, message: str, priority: str = "normal") -> bool:
        """发送邮件"""
        if not self.smtp_host or not self.username:
            print("[Email] SMTP not configured")
            return False
        
        try:
            import aiosmtplib
            from email.mime.text import MIMEText
            
            msg = MIMEText(message, "plain", "utf-8")
            msg["Subject"] = f"[ShiHao Finance] {priority.upper()} Notification"
            msg["From"] = self.from_addr
            msg["To"] = ", ".join(self.to_addrs)
            
            await aiosmtplib.send(
                message=msg,
                hostname=self.smtp_host,
                port=self.smtp_port,
                username=self.username,
                password=self.password,
                start_tls=True
            )
            return True
        except Exception as e:
            print(f"[Email] Send failed: {e}")
            return False
    
    async def receive(self):
        return None