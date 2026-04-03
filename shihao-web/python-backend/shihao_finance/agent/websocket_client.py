"""
WebSocket 状态机 - Claude Code 模式
基于 Claude Code 源码分析的弹性 WebSocket 客户端
"""

import asyncio
import json
import logging
from typing import Optional, Callable, Any
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class ConnectionStatus(Enum):
    """连接状态"""

    IDLE = "idle"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"


@dataclass
class WSMessage:
    """WebSocket 消息"""

    type: str
    data: Optional[dict] = None
    error: Optional[str] = None


class ResilientWebSocket:
    """弹性 WebSocket 客户端"""

    def __init__(
        self,
        url: str,
        auto_reconnect: bool = True,
        max_reconnect_attempts: int = 5,
        ping_interval: int = 30,
        message_handler: Optional[Callable] = None,
    ):
        self.url = url
        self.auto_reconnect = auto_reconnect
        self.max_reconnect_attempts = max_reconnect_attempts
        self.ping_interval = ping_interval
        self.message_handler = message_handler

        self.status = ConnectionStatus.IDLE
        self._ws = None
        self._reconnect_attempts = 0
        self._ping_task = None
        self._reconnect_task = None
        self._closing = False

    async def connect(self):
        """连接"""
        if self._ws:
            await self.disconnect()

        self.status = ConnectionStatus.CONNECTING
        self._closing = False

        try:
            from urllib.parse import urlparse

            parsed = urlparse(self.url)
            host = parsed.hostname or "localhost"
            port = parsed.port or (80 if parsed.scheme == "ws" else 443)

            if not host or "." not in host:
                raise ValueError(f"Invalid WebSocket host: {host}")

            self._ws = await asyncio.wait_for(
                asyncio.create_task(
                    asyncio.get_event_loop().create_connection(
                        lambda: WebSocketProtocol(self),
                        host,
                        port,
                    )
                ),
                timeout=10,
            )
            self.status = ConnectionStatus.CONNECTED
            self._reconnect_attempts = 0
            self._start_ping()
            logger.info(f"WebSocket connected: {self.url}")
        except Exception as e:
            logger.error(f"WebSocket connection failed: {e}")
            self.status = ConnectionStatus.ERROR
            await self._attempt_reconnect()

    async def disconnect(self):
        """断开连接"""
        self._closing = True
        self._stop_ping()
        self._cancel_reconnect()

        if self._ws:
            try:
                self._ws.close()
            except:
                pass
            self._ws = None

        self.status = ConnectionStatus.IDLE
        logger.info("WebSocket disconnected")

    def send(self, message: dict):
        """发送消息"""
        if self._ws and self.status == ConnectionStatus.CONNECTED:
            try:
                self._ws.send(json.dumps(message))
            except Exception as e:
                logger.error(f"Failed to send message: {e}")

    def send_ping(self):
        """发送心跳"""
        self.send({"type": "ping"})

    def _handle_message(self, data: dict):
        """处理消息"""
        msg = WSMessage(
            type=data.get("type", ""), data=data.get("data"), error=data.get("error")
        )

        if self.message_handler:
            self.message_handler(msg)

    def _start_ping(self):
        """启动心跳"""
        if self._ping_task:
            self._ping_task.cancel()

        async def ping_loop():
            while self.status == ConnectionStatus.CONNECTED:
                await asyncio.sleep(self.ping_interval)
                if self.status == ConnectionStatus.CONNECTED:
                    self.send_ping()

        self._ping_task = asyncio.create_task(ping_loop())

    def _stop_ping(self):
        """停止心跳"""
        if self._ping_task:
            self._ping_task.cancel()
            self._ping_task = None

    async def _attempt_reconnect(self):
        """尝试重连"""
        if not self.auto_reconnect or self._closing:
            return

        if self._reconnect_attempts >= self.max_reconnect_attempts:
            logger.warning("Max reconnect attempts reached")
            self.status = ConnectionStatus.DISCONNECTED
            return

        self._reconnect_attempts += 1
        delay = min(1000 * (2 ** (self._reconnect_attempts - 1)), 30000) / 1000

        logger.info(f"Reconnecting in {delay}s (attempt {self._reconnect_attempts})")

        await asyncio.sleep(delay)

        if not self._closing:
            await self.connect()

    def _cancel_reconnect(self):
        """取消重连"""
        if self._reconnect_task:
            self._reconnect_task.cancel()
            self._reconnect_task = None

    def get_status(self) -> ConnectionStatus:
        """获取状态"""
        return self.status

    def is_connected(self) -> bool:
        """是否已连接"""
        return self.status == ConnectionStatus.CONNECTED


class WebSocketProtocol:
    """WebSocket 协议处理器 (简化版)"""

    def __init__(self, client: ResilientWebSocket):
        self.client = client

    def connection_made(self, transport):
        self.transport = transport

    def data_received(self, data):
        try:
            message = json.loads(data.decode())
            self.client._handle_message(message)
        except:
            pass

    def connection_lost(self, exc):
        if not self.client._closing:
            self.client.status = ConnectionStatus.DISCONNECTED
            asyncio.create_task(self.client._attempt_reconnect())


class AsyncWebSocketClient:
    """异步 WebSocket 客户端 (更简单的实现)"""

    def __init__(
        self,
        on_message: Optional[Callable] = None,
        on_status_change: Optional[Callable] = None,
    ):
        self.on_message = on_message
        self.on_status_change = on_status_change
        self._reader = None
        self._writer = None
        self._running = False
        self._ping_task = None

    async def connect(self, host: str, port: int, path: str = ""):
        """连接"""
        self._reader, self._writer = await asyncio.open_connection(host, port)

        ws_key = " SmD HyY+"

        request = (
            f"GET {path or '/'} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {ws_key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n"
            f"\r\n"
        )

        self._writer.write(request.encode())
        await self._writer.drain()

        response = await self._reader.read(1024)

        self._running = True

        if self.on_status_change:
            self.on_status_change(ConnectionStatus.CONNECTED)

        asyncio.create_task(self._receive_loop())

    async def _receive_loop(self):
        """接收循环"""
        while self._running:
            try:
                data = await asyncio.wait_for(self._reader.read(1024), timeout=30)
                if not data:
                    break

                if self.on_message:
                    try:
                        message = json.loads(data.decode())
                        self.on_message(message)
                    except:
                        pass

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Receive error: {e}")
                break

        if self.on_status_change:
            self.on_status_change(ConnectionStatus.DISCONNECTED)

    async def send(self, message: dict):
        """发送消息"""
        if self._writer:
            data = json.dumps(message).encode()
            self._writer.write(data)
            await self._writer.drain()

    async def close(self):
        """关闭"""
        self._running = False
        if self._writer:
            self._writer.close()
            await self._writer.wait_closed()


def create_websocket_client(
    url: str, message_handler: Optional[Callable] = None, auto_reconnect: bool = True
) -> ResilientWebSocket:
    """创建 WebSocket 客户端"""
    return ResilientWebSocket(
        url=url, auto_reconnect=auto_reconnect, message_handler=message_handler
    )
