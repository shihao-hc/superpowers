"""
ShiHao Agent 配置管理
统一配置管理 - 使用 Pydantic Settings
"""

import os
from typing import Optional, List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AgentSettings(BaseSettings):
    """Agent 核心配置"""

    model_config = SettingsConfigDict(
        env_prefix="AGENT_", env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    llm_provider: str = Field(default="ollama", description="LLM provider")
    llm_model: str = Field(default="llama3.2", description="LLM model")
    ollama_base_url: str = Field(
        default="http://localhost:11434", description="Ollama base URL"
    )
    openai_api_key: Optional[str] = Field(default=None, description="OpenAI API key")
    openai_base_url: str = Field(
        default="https://api.openai.com/v1", description="OpenAI base URL"
    )

    max_tokens: int = Field(default=100000, description="最大 token 数")
    max_iterations: int = Field(default=10, description="最大迭代次数")
    max_concurrent: int = Field(default=5, description="最大并发数")

    daily_budget: float = Field(default=10.0, description="每日预算 (美元)")
    session_id: Optional[str] = Field(default=None, description="会话 ID")
    user_id: Optional[str] = Field(default=None, description="用户 ID")

    permission_mode: str = Field(
        default="default", description="权限模式: default/plan/auto"
    )
    environment: str = Field(
        default="production", description="环境: production/development"
    )

    max_subagents: int = Field(default=10, description="最大子代理数")
    archival_db_path: Optional[str] = Field(default=None, description="归档数据库路径")


class DatabaseSettings(BaseSettings):
    """数据库配置"""

    model_config = SettingsConfigDict(env_prefix="DB_", extra="ignore")

    mongo_uri: str = Field(
        default="mongodb://localhost:27017", description="MongoDB URI"
    )
    mongo_db: str = Field(default="shihao_finance", description="数据库名")

    redis_host: str = Field(default="localhost", description="Redis host")
    redis_port: int = Field(default=6379, description="Redis port")
    redis_db: int = Field(default=0, description="Redis database")


class SecuritySettings(BaseSettings):
    """安全配置"""

    model_config = SettingsConfigDict(env_prefix="SECURITY_", extra="ignore")

    allowed_commands: List[str] = Field(
        default=[
            "ls",
            "cat",
            "head",
            "tail",
            "grep",
            "find",
            "pwd",
            "echo",
            "date",
            "wc",
            "sort",
            "uniq",
        ],
        description="允许的 shell 命令白名单",
    )
    max_command_timeout: int = Field(default=30, description="命令超时秒数")
    max_commit_message_length: int = Field(default=500, description="提交信息最大长度")

    cors_origins: List[str] = Field(default=["*"], description="CORS 允许的源")
    cors_allow_credentials: bool = Field(default=True, description="允许凭证")


class LoggingSettings(BaseSettings):
    """日志配置"""

    model_config = SettingsConfigDict(env_prefix="LOG_", extra="ignore")

    level: str = Field(default="INFO", description="日志级别")
    format: str = Field(
        default="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        description="日志格式",
    )
    rotation: str = Field(default="500 MB", description="日志轮转")
    retention: str = Field(default="30 days", description="日志保留时间")
    output: str = Field(default="console", description="输出方式: console/file/both")


class Settings:
    """统一配置管理"""

    def __init__(self):
        self.agent = AgentSettings()
        self.database = DatabaseSettings()
        self.security = SecuritySettings()
        self.logging = LoggingSettings()

    def get_llm_config(self) -> dict:
        """获取 LLM 配置"""
        return {
            "provider": self.agent.llm_provider,
            "model": self.agent.llm_model,
            "base_url": self.agent.ollama_base_url,
            "api_key": self.agent.openai_api_key,
        }

    def get_all_config(self) -> dict:
        """获取所有配置"""
        return {
            "agent": self.agent.model_dump(),
            "database": self.database.model_dump(),
            "security": self.security.model_dump(),
            "logging": self.logging.model_dump(),
        }


settings = Settings()
