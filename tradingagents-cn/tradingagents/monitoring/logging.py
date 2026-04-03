"""
TradingAgents-CN Logging Configuration
使用 Loguru 进行统一日志管理
"""

import sys
import os
from pathlib import Path
from loguru import logger
from datetime import datetime

LOG_DIR = Path(os.getenv("LOG_DIR", ".logs"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_FILE = LOG_DIR / "app.log"
LOG_ROTATION = "1 day"
LOG_RETENTION = "30 days"
LOG_COMPRESSION = "zip"


def setup_logging(
    log_level: str = LOG_LEVEL,
    log_file: Path = LOG_FILE,
    rotation: str = LOG_ROTATION,
    retention: str = LOG_RETENTION,
    compression: str = LOG_COMPRESSION,
    enable_console: bool = True,
    enable_file: bool = True,
) -> logger:
    """
    配置 Loguru 日志系统

    Args:
        log_level: 日志级别 (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_file: 日志文件路径
        rotation: 日志轮转大小
        retention: 日志保留天数
        compression: 日志压缩格式
        enable_console: 是否输出到控制台
        enable_file: 是否输出到文件

    Returns:
        配置好的 logger 实例
    """
    logger.remove()

    log_format = (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
        "<level>{message}</level>"
    )

    if enable_console:
        logger.add(
            sys.stderr,
            format=log_format,
            level=log_level,
            colorize=True,
        )

    if enable_file:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        logger.add(
            log_file,
            format=log_format,
            level=log_level,
            rotation=rotation,
            retention=retention,
            compression=compression,
            enqueue=True,
            backtrace=True,
            diagnose=True,
        )

        error_file = LOG_DIR / "errors.log"
        logger.add(
            error_file,
            format=log_format,
            level="ERROR",
            rotation="50 MB",
            retention="90 days",
            compression="zip",
            enqueue=True,
            filter=lambda record: record["level"].no >= 40,
        )

    return logger


def get_logger(name: str = None) -> logger:
    """
    获取 logger 实例

    Args:
        name: 模块名称 (可选)

    Returns:
        Logger 实例
    """
    if name:
        return logger.bind(name=name)
    return logger


class LoggerMixin:
    """日志混入类，所有组件可继承"""

    @property
    def log(self) -> logger:
        if not hasattr(self, "_logger"):
            name = f"{self.__class__.__module__}.{self.__class__.__name__}"
            self._logger = logger.bind(name=name)
        return self._logger


async def log_async_task(
    task_name: str,
    coro,
    log_args: dict = None,
    log_result: bool = False,
):
    """
    异步任务日志装饰器

    Args:
        task_name: 任务名称
        coro: 协程对象
        log_args: 参数字典
        log_result: 是否记录结果
    """
    log = get_logger()
    start_time = datetime.now()

    log.info(f"Task '{task_name}' started", **(log_args or {}))
    log.debug(f"Task args: {log_args}")

    try:
        result = await coro
        elapsed = (datetime.now() - start_time).total_seconds()
        log.info(f"Task '{task_name}' completed in {elapsed:.2f}s")

        if log_result and result is not None:
            log.debug(f"Task result: {result}")

        return result

    except Exception as e:
        elapsed = (datetime.now() - start_time).total_seconds()
        log.exception(f"Task '{task_name}' failed after {elapsed:.2f}s: {e}")
        raise


setup_logging()
