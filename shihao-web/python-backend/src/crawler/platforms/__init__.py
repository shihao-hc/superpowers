"""Social media platform adapters.

Supports extraction from:
- Douyin (抖音)
- Bilibili (B站)
- Xiaohongshu (小红书)
- WeChat Public (微信公众号)
"""

from .base_adapter import (
    BasePlatformAdapter,
    PlatformType,
    PlatformConfig,
    PlatformCredentials,
    PlatformPost,
)
from .douyin_adapter import DouyinAdapter
from .bilibili_adapter import BilibiliAdapter
from .xiaohongshu_adapter import XiaohongshuAdapter
from .wechat_adapter import WechatAdapter
from .manager import PlatformManager, extract_from_url

__all__ = [
    # Base
    "BasePlatformAdapter",
    "PlatformType",
    "PlatformConfig",
    "PlatformCredentials",
    "PlatformPost",
    # Adapters
    "DouyinAdapter",
    "BilibiliAdapter",
    "XiaohongshuAdapter",
    "WechatAdapter",
    # Manager
    "PlatformManager",
    "extract_from_url",
]
