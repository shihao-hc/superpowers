"""
Agent Marketplace Ecosystem
Agent市场生态 - Agent共享、交易和协作市场
"""

import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from threading import Lock
from enum import Enum
import hashlib


class ListingType(Enum):
    """上架类型"""

    AGENT = "agent"  # Agent
    TOOL = "tool"  # 工具
    TEMPLATE = "template"  # 模板
    SKILL = "skill"  # 技能


class ListingStatus(Enum):
    """上架状态"""

    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    REMOVED = "removed"


class TransactionType(Enum):
    """交易类型"""

    PURCHASE = "purchase"  # 购买
    RENTAL = "rental"  # 租赁
    FREE = "free"  # 免费
    EXCHANGE = "exchange"  # 交换


@dataclass
class MarketplaceListing:
    """市场上架商品"""

    listing_id: str
    seller_id: str
    listing_type: str
    title: str
    description: str

    # 商品数据
    item_data: Dict[str, Any] = field(default_factory=dict)
    item_version: str = "1.0.0"

    # 价格信息
    price: float = 0.0
    currency: str = "credits"
    transaction_type: str = TransactionType.FREE.value

    # 状态
    status: str = ListingStatus.DRAFT.value

    # 统计
    downloads: int = 0
    purchases: int = 0
    rating: float = 0.0
    review_count: int = 0

    # 元数据
    category: str = ""
    tags: List[str] = field(default_factory=list)
    screenshots: List[str] = field(default_factory=list)

    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> dict:
        return {
            "listing_id": self.listing_id,
            "seller_id": self.seller_id,
            "listing_type": self.listing_type,
            "title": self.title,
            "description": self.description,
            "item_data": self.item_data,
            "item_version": self.item_version,
            "price": self.price,
            "currency": self.currency,
            "transaction_type": self.transaction_type,
            "status": self.status,
            "downloads": self.downloads,
            "purchases": self.purchases,
            "rating": self.rating,
            "review_count": self.review_count,
            "category": self.category,
            "tags": self.tags,
            "screenshots": self.screenshots,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class MarketplaceReview:
    """市场评价"""

    review_id: str
    listing_id: str
    user_id: str
    rating: int  # 1-5
    title: str
    content: str
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    helpful_count: int = 0

    def to_dict(self) -> dict:
        return {
            "review_id": self.review_id,
            "listing_id": self.listing_id,
            "user_id": self.user_id,
            "rating": self.rating,
            "title": self.title,
            "content": self.content,
            "created_at": self.created_at,
            "helpful_count": self.helpful_count,
        }


@dataclass
class UserWallet:
    """用户钱包"""

    user_id: str
    balance: float = 1000.0  # 初始积分
    currency: str = "credits"
    transaction_history: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "balance": self.balance,
            "currency": self.currency,
            "transaction_history": self.transaction_history[-50:],  # 只保留最近50条
        }


class AgentMarketplaceEcosystem:
    """
    Agent市场生态系统

    功能:
    1. Agent/工具/模板市场
    2. 购买和租赁
    3. 评价系统
    4. 积分系统
    5. 推荐算法
    """

    def __init__(self, storage_dir: str = "marketplace"):
        self.storage_dir = storage_dir
        os.makedirs(storage_dir, exist_ok=True)

        # 商品存储
        self.listings: Dict[str, MarketplaceListing] = {}

        # 评价存储
        self.reviews: Dict[str, MarketplaceReview] = {}

        # 用户钱包
        self.wallets: Dict[str, UserWallet] = {}

        self._lock = Lock()

    def _generate_id(self, prefix: str) -> str:
        """生成唯一ID"""
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        random_hash = hashlib.md5(f"{prefix}_{timestamp}".encode()).hexdigest()[:8]
        return f"{prefix}_{timestamp}_{random_hash}"

    def _get_or_create_wallet(self, user_id: str) -> UserWallet:
        """获取或创建用户钱包"""
        if user_id not in self.wallets:
            self.wallets[user_id] = UserWallet(user_id=user_id)
        return self.wallets[user_id]

    def create_listing(
        self,
        seller_id: str,
        listing_type: ListingType,
        title: str,
        description: str,
        item_data: Dict[str, Any],
        price: float = 0.0,
        transaction_type: TransactionType = TransactionType.FREE,
        category: str = "",
        tags: Optional[List[str]] = None,
    ) -> str:
        """创建上架商品"""
        with self._lock:
            listing_id = self._generate_id("listing")

            listing = MarketplaceListing(
                listing_id=listing_id,
                seller_id=seller_id,
                listing_type=listing_type.value,
                title=title,
                description=description,
                item_data=item_data,
                price=price,
                transaction_type=transaction_type.value,
                category=category,
                tags=tags or [],
            )

            self.listings[listing_id] = listing

            return listing_id

    def publish_listing(self, listing_id: str) -> bool:
        """发布商品"""
        with self._lock:
            listing = self.listings.get(listing_id)
            if not listing:
                return False

            listing.status = ListingStatus.ACTIVE.value
            listing.updated_at = datetime.now().isoformat()

            return True

    def purchase_listing(self, listing_id: str, buyer_id: str) -> Dict[str, Any]:
        """购买商品"""
        with self._lock:
            listing = self.listings.get(listing_id)
            if not listing:
                return {"success": False, "error": "商品不存在"}

            if listing.status != ListingStatus.ACTIVE.value:
                return {"success": False, "error": "商品未上架"}

            if listing.seller_id == buyer_id:
                return {"success": False, "error": "不能购买自己的商品"}

            # 获取钱包
            buyer_wallet = self._get_or_create_wallet(buyer_id)
            seller_wallet = self._get_or_create_wallet(listing.seller_id)

            # 检查余额
            if listing.transaction_type != TransactionType.FREE.value:
                if buyer_wallet.balance < listing.price:
                    return {"success": False, "error": "积分不足"}

                # 扣除买家积分
                buyer_wallet.balance -= listing.price
                buyer_wallet.transaction_history.append(
                    {
                        "type": "purchase",
                        "amount": -listing.price,
                        "target": listing_id,
                        "timestamp": datetime.now().isoformat(),
                    }
                )

                # 增加卖家积分
                seller_wallet.balance += listing.price * 0.85  # 平台抽成15%
                seller_wallet.transaction_history.append(
                    {
                        "type": "sale",
                        "amount": listing.price * 0.85,
                        "source": listing_id,
                        "timestamp": datetime.now().isoformat(),
                    }
                )

            # 更新统计
            if listing.transaction_type == TransactionType.FREE.value:
                listing.downloads += 1
            else:
                listing.purchases += 1

            listing.updated_at = datetime.now().isoformat()

            return {
                "success": True,
                "item_data": listing.item_data,
                "remaining_balance": buyer_wallet.balance,
            }

    def add_review(
        self, listing_id: str, user_id: str, rating: int, title: str, content: str
    ) -> str:
        """添加评价"""
        with self._lock:
            review_id = self._generate_id("review")

            review = MarketplaceReview(
                review_id=review_id,
                listing_id=listing_id,
                user_id=user_id,
                rating=max(1, min(5, rating)),
                title=title,
                content=content,
            )

            self.reviews[review_id] = review

            # 更新商品评分
            listing = self.listings.get(listing_id)
            if listing:
                listing_reviews = [
                    r for r in self.reviews.values() if r.listing_id == listing_id
                ]
                total_rating = sum(r.rating for r in listing_reviews)
                listing.rating = total_rating / len(listing_reviews)
                listing.review_count = len(listing_reviews)

            return review_id

    def get_listing(self, listing_id: str) -> Optional[Dict[str, Any]]:
        """获取商品详情"""
        listing = self.listings.get(listing_id)
        if not listing:
            return None

        data = listing.to_dict()

        # 添加评价
        listing_reviews = [
            r.to_dict() for r in self.reviews.values() if r.listing_id == listing_id
        ]
        data["reviews"] = listing_reviews[:10]  # 只返回最近10条

        return data

    def search_listings(
        self,
        query: str = "",
        listing_type: Optional[ListingType] = None,
        category: Optional[str] = None,
        min_rating: float = 0.0,
        sort_by: str = "rating",  # rating, downloads, newest, price_low, price_high
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """搜索商品"""
        with self._lock:
            results = []

            for listing in self.listings.values():
                if listing.status != ListingStatus.ACTIVE.value:
                    continue

                # 过滤条件
                if listing_type and listing.listing_type != listing_type.value:
                    continue
                if category and listing.category != category:
                    continue
                if listing.rating < min_rating:
                    continue
                if (
                    query
                    and query.lower() not in listing.title.lower()
                    and query.lower() not in listing.description.lower()
                ):
                    continue

                results.append(
                    {
                        "listing_id": listing.listing_id,
                        "title": listing.title,
                        "description": listing.description[:200],
                        "listing_type": listing.listing_type,
                        "price": listing.price,
                        "transaction_type": listing.transaction_type,
                        "rating": listing.rating,
                        "review_count": listing.review_count,
                        "downloads": listing.downloads + listing.purchases,
                        "category": listing.category,
                        "tags": listing.tags,
                    }
                )

            # 排序
            if sort_by == "rating":
                results.sort(key=lambda x: x["rating"], reverse=True)
            elif sort_by == "downloads":
                results.sort(key=lambda x: x["downloads"], reverse=True)
            elif sort_by == "newest":
                results.sort(key=lambda x: x["listing_id"], reverse=True)
            elif sort_by == "price_low":
                results.sort(key=lambda x: x["price"])
            elif sort_by == "price_high":
                results.sort(key=lambda x: x["price"], reverse=True)

            return results[:limit]

    def get_recommendations(self, user_id: str, limit: int = 5) -> List[Dict[str, Any]]:
        """获取个性化推荐"""
        # 简化版：返回高评分商品
        return self.search_listings(min_rating=4.0, sort_by="rating", limit=limit)

    def get_wallet_balance(self, user_id: str) -> Dict[str, Any]:
        """获取钱包余额"""
        wallet = self._get_or_create_wallet(user_id)
        return wallet.to_dict()

    def add_credits(self, user_id: str, amount: float, reason: str = "奖励") -> bool:
        """增加积分"""
        with self._lock:
            wallet = self._get_or_create_wallet(user_id)
            wallet.balance += amount
            wallet.transaction_history.append(
                {
                    "type": "credit",
                    "amount": amount,
                    "reason": reason,
                    "timestamp": datetime.now().isoformat(),
                }
            )
            return True

    def get_statistics(self) -> Dict[str, Any]:
        """获取市场统计"""
        with self._lock:
            active_listings = [
                l
                for l in self.listings.values()
                if l.status == ListingStatus.ACTIVE.value
            ]

            # 类型分布
            type_distribution = {}
            for listing in active_listings:
                type_distribution[listing.listing_type] = (
                    type_distribution.get(listing.listing_type, 0) + 1
                )

            # 总交易量
            total_transactions = sum(l.downloads + l.purchases for l in active_listings)

            return {
                "total_listings": len(self.listings),
                "active_listings": len(active_listings),
                "total_reviews": len(self.reviews),
                "total_users": len(self.wallets),
                "total_transactions": total_transactions,
                "type_distribution": type_distribution,
                "average_rating": sum(l.rating for l in active_listings)
                / len(active_listings)
                if active_listings
                else 0,
            }

    def save(self, filename: Optional[str] = None) -> str:
        """保存市场数据"""
        if filename is None:
            filename = f"marketplace_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

        filepath = os.path.join(self.storage_dir, filename)

        with self._lock:
            data = {
                "listings": {k: v.to_dict() for k, v in self.listings.items()},
                "reviews": {k: v.to_dict() for k, v in self.reviews.items()},
                "wallets": {k: v.to_dict() for k, v in self.wallets.items()},
            }

            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

        return filepath


# 全局市场实例
_global_marketplace: Optional[AgentMarketplaceEcosystem] = None


def get_marketplace() -> AgentMarketplaceEcosystem:
    """获取全局市场实例"""
    global _global_marketplace
    if _global_marketplace is None:
        _global_marketplace = AgentMarketplaceEcosystem()
    return _global_marketplace
