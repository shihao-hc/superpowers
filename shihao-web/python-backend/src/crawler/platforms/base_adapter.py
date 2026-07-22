"""Base platform adapter for social media platforms."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, Any
from enum import Enum


class PlatformType(Enum):
    """Supported platform types."""

    DOUYIN = "douyin"
    BILIBILI = "bilibili"
    XIAOHONGSHU = "xiaohongshu"
    WECHAT = "wechat"
    WECHAT_PUBLIC = "wechat_public"
    WEIBO = "weibo"
    XIGUA = "xigua"
    KUAISHOU = "kuaishou"
    REDDIT = "reddit"
    TWITTER = "twitter"
    UNKNOWN = "unknown"


@dataclass
class PlatformCredentials:
    """Platform authentication credentials."""

    cookies: Optional[dict] = None
    headers: Optional[dict] = None
    token: Optional[str] = None
    app_id: Optional[str] = None
    app_secret: Optional[str] = None


@dataclass
class PlatformPost:
    """Normalized post data from any platform."""

    platform: str
    post_id: str
    url: str

    title: Optional[str] = None
    content: Optional[str] = None
    author: Optional[str] = None
    author_id: Optional[str] = None

    images: list[str] = field(default_factory=list)
    videos: list[str] = field(default_factory=list)

    likes: Optional[int] = None
    comments: Optional[int] = None
    shares: Optional[int] = None
    views: Optional[int] = None

    published_at: Optional[str] = None
    extracted_at: Optional[str] = None

    raw_data: Optional[dict] = None
    metadata: dict = field(default_factory=dict)


@dataclass
class PlatformConfig:
    """Configuration for platform adapter."""

    base_url: str
    api_url: Optional[str] = None
    requires_auth: bool = False
    rate_limit: int = 10
    timeout: int = 30
    retry_count: int = 3


class BasePlatformAdapter(ABC):
    """
    Base class for platform-specific adapters.

    Provides common functionality and interface for
    platform-specific scraping implementations.
    """

    def __init__(
        self,
        config: Optional[PlatformConfig] = None,
        credentials: Optional[PlatformCredentials] = None,
    ):
        """
        Initialize platform adapter.

        Args:
            config: Platform configuration
            credentials: Authentication credentials
        """
        self.config = config
        self.credentials = credentials

    @property
    @abstractmethod
    def platform_type(self) -> PlatformType:
        """Return platform type."""
        ...

    @property
    def platform_name(self) -> str:
        """Return platform name."""
        return self.platform_type.value

    @abstractmethod
    async def extract_post(self, url: str) -> PlatformPost:
        """
        Extract single post from URL.

        Args:
            url: Post URL

        Returns:
            PlatformPost with extracted data
        """
        ...

    @abstractmethod
    async def extract_user_posts(
        self, user_id: str, limit: int = 20
    ) -> list[PlatformPost]:
        """
        Extract posts from user profile.

        Args:
            user_id: User identifier
            limit: Maximum number of posts

        Returns:
            List of PlatformPost objects
        """
        ...

    def _make_headers(self, extra_headers: Optional[dict] = None) -> dict:
        """Build request headers with authentication."""
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json, text/html",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        }

        if self.credentials and self.credentials.headers:
            headers.update(self.credentials.headers)

        if extra_headers:
            headers.update(extra_headers)

        return headers

    def _check_auth(self) -> bool:
        """Check if authentication is available."""
        if not self.config or not self.config.requires_auth:
            return True

        return bool(
            self.credentials and (self.credentials.cookies or self.credentials.token)
        )

    @staticmethod
    def detect_platform(url: str) -> PlatformType:
        """
        Detect platform from URL.

        Args:
            url: Content URL

        Returns:
            PlatformType
        """
        url_lower = url.lower()

        if "douyin.com" in url_lower:
            return PlatformType.DOUYIN
        elif "bilibili.com" in url_lower:
            return PlatformType.BILIBILI
        elif "xiaohongshu.com" in url_lower or "xhslink.com" in url_lower:
            return PlatformType.XIAOHONGSHU
        elif "mp.weixin.qq.com" in url_lower:
            return PlatformType.WECHAT_PUBLIC
        elif "weibo.com" in url_lower:
            return PlatformType.WEIBO
        elif "kuaishou.com" in url_lower:
            return PlatformType.KUAISHOU
        elif "ixigua.com" in url_lower:
            return PlatformType.XIGUA
        elif "reddit.com" in url_lower:
            return PlatformType.REDDIT
        elif "twitter.com" in url_lower or "x.com" in url_lower:
            return PlatformType.TWITTER

        return PlatformType.UNKNOWN
