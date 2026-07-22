"""Platform manager - Unified interface for all platform adapters."""

from typing import Optional, Type

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


class PlatformManager:
    """
    Unified manager for all platform adapters.

    Provides:
    - Auto platform detection
    - Adapter registration
    - Unified extraction interface
    """

    _adapters: dict[PlatformType, Type[BasePlatformAdapter]] = {
        PlatformType.DOUYIN: DouyinAdapter,
        PlatformType.BILIBILI: BilibiliAdapter,
        PlatformType.XIAOHONGSHU: XiaohongshuAdapter,
        PlatformType.WECHAT_PUBLIC: WechatAdapter,
    }

    def __init__(
        self,
        credentials: Optional[PlatformCredentials] = None,
    ):
        """
        Initialize platform manager.

        Args:
            credentials: Optional shared credentials
        """
        self.credentials = credentials
        self._instances: dict[PlatformType, BasePlatformAdapter] = {}

    def get_adapter(
        self,
        platform: PlatformType,
        config: Optional[PlatformConfig] = None,
    ) -> BasePlatformAdapter:
        """
        Get adapter for platform.

        Args:
            platform: Platform type
            config: Optional platform config

        Returns:
            Platform adapter instance
        """
        if platform not in self._adapters:
            raise ValueError(f"Unsupported platform: {platform}")

        if platform not in self._instances:
            adapter_class = self._adapters[platform]
            self._instances[platform] = adapter_class(
                config=config,
                credentials=self.credentials,
            )

        return self._instances[platform]

    def detect_and_get(self, url: str) -> BasePlatformAdapter:
        """
        Detect platform and get appropriate adapter.

        Args:
            url: Content URL

        Returns:
            Platform adapter
        """
        platform = BasePlatformAdapter.detect_platform(url)

        if platform == PlatformType.UNKNOWN:
            raise ValueError(f"Unknown platform for URL: {url}")

        return self.get_adapter(platform)

    async def extract_post(
        self,
        url: str,
        config: Optional[PlatformConfig] = None,
    ) -> PlatformPost:
        """
        Extract post from URL, auto-detecting platform.

        Args:
            url: Content URL
            config: Optional platform config

        Returns:
            PlatformPost with extracted data
        """
        adapter = self.detect_and_get(url)
        return await adapter.extract_post(url)

    async def extract_user_posts(
        self,
        platform: PlatformType,
        user_id: str,
        limit: int = 20,
    ) -> list[PlatformPost]:
        """
        Extract posts from user profile.

        Args:
            platform: Platform type
            user_id: User identifier
            limit: Maximum posts

        Returns:
            List of PlatformPost objects
        """
        adapter = self.get_adapter(platform)
        return await adapter.extract_user_posts(user_id, limit)

    @classmethod
    def register_adapter(
        cls,
        platform: PlatformType,
        adapter_class: Type[BasePlatformAdapter],
    ) -> None:
        """
        Register a custom platform adapter.

        Args:
            platform: Platform type
            adapter_class: Adapter class
        """
        if not issubclass(adapter_class, BasePlatformAdapter):
            raise TypeError("Adapter must inherit from BasePlatformAdapter")

        cls._adapters[platform] = adapter_class

    @classmethod
    def get_supported_platforms(cls) -> list[str]:
        """
        Get list of supported platform names.

        Returns:
            List of platform names
        """
        return [pt.value for pt in cls._adapters.keys()]


def extract_from_url(url: str) -> PlatformPost:
    """
    Quick extraction from URL.

    Args:
        url: Content URL

    Returns:
        PlatformPost with extracted data
    """
    import asyncio

    manager = PlatformManager()

    async def _extract():
        return await manager.extract_post(url)

    return asyncio.run(_extract())
