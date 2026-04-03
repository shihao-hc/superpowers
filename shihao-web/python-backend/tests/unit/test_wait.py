"""Unit tests for wait module - Smart wait strategies."""

import pytest
from crawler.wait import (
    SmartWait,
    WaitStrategy,
    WaitConfig,
    create_wait_config,
)


class TestWaitConfig:
    """Test wait configuration."""

    def test_default_config(self):
        config = WaitConfig()
        assert config.timeout == 10.0
        assert config.interval == 0.1
        assert config.strategy == WaitStrategy.VISIBLE
        assert config.random_delay is False

    def test_custom_config(self):
        config = WaitConfig(
            timeout=30.0,
            strategy=WaitStrategy.CLICKABLE,
            random_delay=True,
            min_delay=1.0,
            max_delay=3.0,
        )

        assert config.timeout == 30.0
        assert config.strategy == WaitStrategy.CLICKABLE
        assert config.random_delay is True
        assert config.min_delay == 1.0
        assert config.max_delay == 3.0


class TestWaitStrategy:
    """Test wait strategy enum."""

    def test_strategy_values(self):
        assert WaitStrategy.VISIBLE.value == "visible"
        assert WaitStrategy.CLICKABLE.value == "clickable"
        assert WaitStrategy.PRESENT.value == "present"
        assert WaitStrategy.HIDDEN.value == "hidden"
        assert WaitStrategy.DETACHED.value == "detached"
        assert WaitStrategy.NETWORK_IDLE.value == "network_idle"


class TestSmartWait:
    """Test smart wait utilities."""

    def test_initialization(self):
        wait = SmartWait()
        assert wait.default_timeout == 10.0

    def test_initialization_custom_timeout(self):
        wait = SmartWait(default_timeout=30.0)
        assert wait.default_timeout == 30.0


class TestCreateWaitConfig:
    """Test wait config creation helper."""

    def test_create_default_config(self):
        config = create_wait_config()

        assert config.timeout == 10.0
        assert config.strategy == WaitStrategy.VISIBLE
        assert config.random_delay is False

    def test_create_config_with_params(self):
        config = create_wait_config(
            timeout=20.0,
            strategy=WaitStrategy.PRESENT,
            random_delay=True,
        )

        assert config.timeout == 20.0
        assert config.strategy == WaitStrategy.PRESENT
        assert config.random_delay is True
