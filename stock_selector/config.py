"""
Centralized Configuration Management using Pydantic.
- All config in one place
- Environment variable support
- Validation on startup
"""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator
from typing import Dict, List, Optional, Any
from enum import Enum
import os
import json
from pathlib import Path


class MarketType(str, Enum):
    """Market type."""
    A_SHARE = "a_share"
    US = "us"
    HK = "hk"


class LogLevel(str, Enum):
    """Log level."""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"


class DataSourceConfig(BaseModel):
    """Data source configuration."""
    name: str
    priority: int = 1
    api_key: str = ""
    enabled: bool = True


class BrokerConfig(BaseModel):
    """Broker configuration."""
    broker_type: str = "alpaca"
    api_key: str = Field(default="", validation_alias="BROKER_API_KEY")
    api_secret: str = Field(default="", validation_alias="BROKER_API_SECRET")
    paper_trading: bool = True
    base_url: str = ""


class RiskConfig(BaseModel):
    """Risk management configuration."""
    initial_capital: float = 1000000.0
    max_daily_loss_pct: float = 0.02
    max_position_pct: float = 0.10
    max_leverage: float = 1.0
    max_orders_per_minute: int = 60
    
    use_volatility_sizing: bool = True
    risk_per_trade_pct: float = 0.01
    low_vol_threshold: float = 0.015
    high_vol_threshold: float = 0.04


class BacktestConfig(BaseModel):
    """Backtest configuration."""
    initial_capital: float = 1000000.0
    commission_rate: float = 0.001
    slippage_rate: float = 0.0005
    min_trade_value: float = 100.0
    use_tax: bool = True


class MonitorConfig(BaseModel):
    """Monitoring configuration."""
    prometheus_port: int = 9090
    grafana_url: str = "http://localhost:3000"
    alert_webhook_url: str = ""
    check_interval_seconds: int = 60


class LoggingConfig(BaseModel):
    """Logging configuration."""
    level: LogLevel = LogLevel.INFO
    format: str = "json"
    log_dir: str = "./logs"
    max_file_size_mb: int = 100
    backup_count: int = 5


class AppConfig(BaseModel):
    """Main application configuration."""
    
    app_name: str = "ShiHao Finance"
    version: str = "0.1.0"
    env: str = Field(default="development", validation_alias="ENV")
    
    data_sources: Dict[str, DataSourceConfig] = {}
    broker: BrokerConfig = BrokerConfig()
    risk: RiskConfig = RiskConfig()
    backtest: BacktestConfig = BacktestConfig()
    monitor: MonitorConfig = MonitorConfig()
    logging: LoggingConfig = LoggingConfig()
    
    default_market: MarketType = MarketType.US
    
    def __init__(self, **data):
        super().__init__(**data)
        self._load_env_overrides()
    
    def _load_env_overrides(self) -> None:
        """Load configuration from environment variables."""
        for key, value in os.environ.items():
            if key.startswith("SHA_"):
                config_key = key[4:].lower()
                try:
                    if value.lower() in ("true", "false"):
                        setattr(self, config_key, value.lower() == "true")
                    elif value.isdigit():
                        setattr(self, config_key, int(value))
                    elif value.replace(".", "").isdigit():
                        setattr(self, config_key, float(value))
                    else:
                        setattr(self, config_key, value)
                except (AttributeError, ValueError):
                    pass
    
    @field_validator("initial_capital")
    @classmethod
    def validate_capital(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Initial capital must be positive")
        return v
    
    @field_validator("max_position_pct")
    @classmethod
    def validate_position_pct(cls, v: float) -> float:
        if v <= 0 or v > 1:
            raise ValueError("Position percentage must be between 0 and 1")
        return v
    
    def validate_all(self) -> List[str]:
        """Validate all configuration and return issues."""
        issues = []
        
        if self.risk.max_daily_loss_pct > 0.1:
            issues.append("Daily loss threshold above 10% is risky")
        
        if self.risk.max_position_pct > 0.3:
            issues.append("Single position above 30% is risky")
        
        if self.broker.api_key == "" and self.broker.paper_trading is False:
            issues.append("Live trading requires API key")
        
        return issues
    
    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return self.model_dump()
    
    @classmethod
    def from_file(cls, filepath: str) -> AppConfig:
        """Load from JSON file."""
        with open(filepath, 'r') as f:
            data = json.load(f)
        return cls(**data)
    
    def save(self, filepath: str) -> None:
        """Save to JSON file."""
        with open(filepath, 'w') as f:
            json.dump(self.to_dict(), f, indent=2)


_global_config: Optional[AppConfig] = None


def get_config() -> AppConfig:
    """Get global configuration instance."""
    global _global_config
    if _global_config is None:
        _global_config = AppConfig()
    return _global_config


def set_config(config: AppConfig) -> None:
    """Set global configuration."""
    global _global_config
    _global_config = config


def load_config_from_file(filepath: str) -> AppConfig:
    """Load configuration from file."""
    config = AppConfig.from_file(filepath)
    issues = config.validate_all()
    if issues:
        print(f"Config warnings: {issues}")
    set_config(config)
    return config


def load_config_from_env() -> AppConfig:
    """Load configuration from environment variables."""
    config = AppConfig()
    issues = config.validate_all()
    if issues:
        print(f"Config warnings: {issues}")
    set_config(config)
    return config


def demo_config():
    """Demo configuration."""
    config = get_config()
    
    print(f"App: {config.app_name}")
    print(f"Version: {config.version}")
    print(f"Environment: {config.env}")
    print(f"Initial Capital: ${config.risk.initial_capital:,.2f}")
    print(f"Max Daily Loss: {config.risk.max_daily_loss_pct:.1%}")
    print(f"Max Position: {config.risk.max_position_pct:.1%}")
    print(f"Default Market: {config.default_market.value}")
    
    issues = config.validate_all()
    if issues:
        print(f"\nValidation Issues: {issues}")
    else:
        print("\n✓ Configuration valid")


if __name__ == "__main__":
    demo_config()
