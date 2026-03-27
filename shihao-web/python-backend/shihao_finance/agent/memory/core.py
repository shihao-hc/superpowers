from dataclasses import dataclass, field
from typing import Optional
import hashlib

@dataclass
class MemoryBlock:
    """记忆块"""
    label: str
    value: str
    max_tokens: int = 2000
    description: str = ""
    
    def validate(self):
        """验证Token限制 (简化: 按字符数估算)"""
        if len(self.value) > self.max_tokens * 4:  # 粗略估算
            raise ValueError(f"Block {self.label} exceeds max tokens")
    
    def to_dict(self) -> dict:
        return {
            "label": self.label,
            "value": self.value,
            "max_tokens": self.max_tokens,
            "description": self.description
        }

class CoreMemory:
    """
    核心记忆 - 常驻Agent上下文
    
    类似于操作系统的RAM，始终可见，存储高优先级信息。
    """
    
    DEFAULT_PERSONA = """
    你是拾号金融AI，一个专业的量化交易助手。
    你擅长：
    - A股和美股市场分析
    - 基本面和技术面研究
    - 风险评估和仓位管理
    - 量化策略开发和回测
    
    你的性格：
    - 理性、客观、数据驱动
    - 风险意识强，不盲目追涨
    - 持续学习，从错误中改进
    """
    
    DEFAULT_RISK_PROFILE = """
    风险等级：中等
    最大单仓位：20%
    最大回撤容忍：15%
    止损规则：单股-10%，整体-8%
    禁止操作：杠杆、期权、ST股
    """
    
    DEFAULT_USER_PREFERENCES = """
    偏好行业：科技、新能源、消费
    关注股票：600519, 300750, 000858
    交易时间偏好：避开开盘前30分钟
    通知偏好：重要事件即时通知
    """
    
    def __init__(self):
        self.blocks: dict[str, MemoryBlock] = {
            "persona": MemoryBlock(
                label="persona",
                value=self.DEFAULT_PERSONA.strip(),
                max_tokens=2000,
                description="Agent人格定义"
            ),
            "risk_profile": MemoryBlock(
                label="risk_profile",
                value=self.DEFAULT_RISK_PROFILE.strip(),
                max_tokens=1000,
                description="风险偏好配置"
            ),
            "user_preferences": MemoryBlock(
                label="user_preferences",
                value=self.DEFAULT_USER_PREFERENCES.strip(),
                max_tokens=1000,
                description="用户偏好"
            )
        }
    
    @property
    def persona(self):
        return self.blocks.get("persona")
    
    @property
    def risk_profile(self):
        return self.blocks.get("risk_profile")
    
    @property
    def user_preferences(self):
        return self.blocks.get("user_preferences")
    
    def get_block(self, label: str) -> Optional[str]:
        """获取记忆块内容"""
        block = self.blocks.get(label)
        return block.value if block else None
    
    def update_block(self, label: str, value: str, description: str = None):
        """更新记忆块"""
        if label not in self.blocks:
            self.blocks[label] = MemoryBlock(
                label=label,
                value=value,
                description=description or ""
            )
        else:
            self.blocks[label].value = value
            if description:
                self.blocks[label].description = description
        
        self.blocks[label].validate()
    
    def list_blocks(self) -> list[str]:
        """列出所有记忆块标签"""
        return list(self.blocks.keys())
    
    def compile(self) -> str:
        """编译所有记忆块为上下文字符串"""
        parts = []
        for label, block in self.blocks.items():
            parts.append(f"[{label.upper()}]\n{block.value}")
        return "\n\n".join(parts)
    
    def export(self) -> dict:
        """导出为字典"""
        return {label: block.to_dict() for label, block in self.blocks.items()}
    
    @classmethod
    def from_dict(cls, data: dict) -> "CoreMemory":
        """从字典创建"""
        memory = cls()
        for label, block_data in data.items():
            memory.blocks[label] = MemoryBlock(**block_data)
        return memory
    
    def get_hash(self) -> str:
        """获取内容哈希 (用于变更检测)"""
        content = self.compile()
        return hashlib.md5(content.encode()).hexdigest()
