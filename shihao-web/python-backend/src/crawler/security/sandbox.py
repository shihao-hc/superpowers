"""Command sandbox and rate limiting for crawler security."""

import asyncio
import logging
import os
import re
import shlex
import subprocess
import time
from collections import deque
from dataclasses import dataclass
from enum import Enum
from typing import Optional, List

logger = logging.getLogger(__name__)


class SandBoxError(Exception):
    """Sandbox execution error."""

    pass


class RateLimitError(Exception):
    """Rate limit exceeded error."""

    pass


class CommandCategory(Enum):
    """Allowed command categories."""

    FILE_READ = "file_read"
    FILE_LIST = "file_list"
    NETWORK_INFO = "network_info"
    SYSTEM_INFO = "system_info"
    CUSTOM = "custom"


@dataclass
class CommandRule:
    """Command execution rule."""

    pattern: str
    category: CommandCategory
    allowed: bool = True
    args_allowed: bool = True
    description: str = ""


class CommandSandbox:
    """Secure command execution sandbox.

    Features:
    - Whitelist-based command validation
    - Argument sanitization
    - Execution timeout
    - Resource limits
    - Audit logging
    """

    ALLOWED_COMMANDS = {
        "ls": CommandRule(r"^ls\s+([-\w/]+)?$", CommandCategory.FILE_LIST),
        "cat": CommandRule(r"^cat\s+([-\w/.]+)$", CommandCategory.FILE_READ),
        "head": CommandRule(r"^head\s+([-\w/.]+)$", CommandCategory.FILE_READ),
        "tail": CommandRule(r"^tail\s+([-\w/.]+)$", CommandCategory.FILE_READ),
        "find": CommandRule(r"^find\s+", CommandCategory.FILE_LIST),
        "grep": CommandRule(r"^grep\s+", CommandCategory.FILE_READ),
        "pwd": CommandRule(r"^pwd$", CommandCategory.FILE_LIST),
        "echo": CommandRule(r"^echo\s+", CommandCategory.SYSTEM_INFO),
        "date": CommandRule(r"^date$", CommandCategory.SYSTEM_INFO),
        "whoami": CommandRule(r"^whoami$", CommandCategory.SYSTEM_INFO),
        "uname": CommandRule(r"^uname\s*", CommandCategory.SYSTEM_INFO),
        "curl": CommandRule(r"^curl\s+", CommandCategory.NETWORK_INFO),
        "wget": CommandRule(r"^wget\s+", CommandCategory.NETWORK_INFO),
    }

    COMMAND_PATHS = {
        "ls": "/bin/ls",
        "cat": "/bin/cat",
        "head": "/usr/bin/head",
        "tail": "/usr/bin/tail",
        "find": "/usr/bin/find",
        "grep": "/bin/grep",
        "pwd": "/bin/pwd",
        "echo": "/bin/echo",
        "date": "/bin/date",
        "whoami": "/usr/bin/whoami",
        "uname": "/bin/uname",
        "curl": "/usr/bin/curl",
        "wget": "/usr/bin/wget",
    }

    DANGEROUS_PATTERNS = [
        r"\$\(",  # Command substitution $(...)
        r"`",  # Backtick execution
        r"\|\s*\w",  # Pipe to command
        r"[;&|`$]",  # Shell metacharacters
        r"\brsync\b",
        r"\bscp\b",
        r"\bssh\b",
        r"\bsftp\b",
        r"\bnc\b",
        r"\bnetcat\b",
        r"\bwget\b.*-O\s*-",
        r"\bcurl\b.*-o\s*/",
        r"\bsudo\b",
        r"\bchmod\b",
        r"\bchown\b",
        r"\bmkfs\b",
        r"\bmount\b",
        r"\bumount\b",
        r"\breboot\b",
        r"\bshutdown\b",
        r"\brm\s+-rf",
        r"\bdd\b",
        r"\bfdisk\b",
        r"\bparted\b",
        r"\blvcreate\b",
        r"\blvextend\b",
    ]

    MAX_COMMAND_LENGTH = 500
    MAX_AUDIT_LOG_SIZE = 10000

    def __init__(
        self,
        timeout: float = 30.0,
        max_output_size: int = 1024 * 1024,
        working_dir: str = "/tmp",
        max_memory_mb: int = 256,
    ):
        self.timeout = timeout
        self.max_output_size = max_output_size
        self.working_dir = working_dir
        self.max_memory = max_memory_mb * 1024 * 1024
        self._audit_log: deque = deque(maxlen=self.MAX_AUDIT_LOG_SIZE)

    def validate_command(self, command: str) -> tuple[bool, Optional[str]]:
        """Validate command against security rules.

        Args:
            command: Command string to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        command = command.strip()
        if not command:
            return False, "Empty command"

        if len(command) > self.MAX_COMMAND_LENGTH:
            return False, f"Command too long (max {self.MAX_COMMAND_LENGTH} chars)"

        for pattern in self.DANGEROUS_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                return False, f"Dangerous pattern detected: {pattern}"

        if ".." in command:
            return False, "Path traversal not allowed"

        parts = command.split()
        if not parts:
            return False, "Empty command"

        cmd_name = parts[0]
        if cmd_name not in self.ALLOWED_COMMANDS:
            return False, f"Command not allowed: {cmd_name}"

        rule = self.ALLOWED_COMMANDS[cmd_name]
        if not rule.allowed:
            return False, f"Command disabled: {cmd_name}"

        if cmd_name in ("cat", "head", "tail"):
            if not self._validate_file_path(command):
                return False, "Invalid file path"

        return True, None

    def _validate_file_path(self, command: str) -> bool:
        """Validate file path in file read commands."""
        parts = command.split()
        if len(parts) < 2:
            return True
        path = parts[-1]
        normalized = path.replace("../", "").replace("..", "")
        return "/" not in normalized or normalized.count("/") <= 1

    def _sanitize_command(self, command: str) -> str:
        """Remove sensitive data from command for audit logging."""
        import re

        sensitive_patterns = [
            (r"--password[=\s]\S+", "--password=***"),
            (r"-p\s+\S+", "-p ***"),
            (r"Bearer\s+\S+", "Bearer ***"),
            (r"api[_-]?key[=\s]\S+", "api_key=***"),
            (r"secret[=\s]\S+", "secret=***"),
        ]
        sanitized = command
        for pattern, replacement in sensitive_patterns:
            sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)
        return sanitized

    async def execute(self, command: str) -> str:
        """Execute command in sandbox.

        Args:
            command: Validated command to execute

        Returns:
            Command output

        Raises:
            SandBoxError: If execution fails
        """
        is_valid, error = self.validate_command(command)
        if not is_valid:
            raise SandBoxError(f"Command validation failed: {error}")

        self._audit_log.append(
            {
                "command": self._sanitize_command(command),
                "timestamp": time.time(),
                "status": "started",
            }
        )

        try:
            result = await self._run_command(command)
            self._audit_log[-1]["status"] = "success"
            return result
        except Exception as e:
            self._audit_log[-1]["status"] = "failed"
            self._audit_log[-1]["error"] = str(e)
            raise SandBoxError(f"Execution failed: {e}") from e

    async def _run_command(self, command: str) -> str:
        """Run command with resource limits using list form (no shell)."""
        try:
            parts = command.split()
            if not parts:
                raise SandBoxError("Empty command")

            cmd_name = parts[0]
            cmd_path = self.COMMAND_PATHS.get(cmd_name)

            if not cmd_path or not os.path.exists(cmd_path):
                cmd_path = cmd_name

            cmd_args = [cmd_path] + parts[1:]

            result = subprocess.run(
                cmd_args,
                shell=False,
                capture_output=True,
                text=True,
                timeout=self.timeout,
                cwd=self.working_dir,
                env={
                    "PATH": "/usr/bin:/bin:/usr/local/bin",
                    "HOME": self.working_dir,
                },
            )

            if result.stderr:
                logger.warning(f"Command stderr: {result.stderr}")

            output = result.stdout[: self.max_output_size]
            return output

        except subprocess.TimeoutExpired:
            raise SandBoxError(f"Command timeout after {self.timeout}s")
        except FileNotFoundError:
            raise SandBoxError(f"Command not found: {cmd_name}")
        except Exception as e:
            raise SandBoxError(f"Execution error: {e}")

    def get_audit_log(self) -> list[dict]:
        """Get execution audit log."""
        return self._audit_log.copy()

    def clear_audit_log(self):
        """Clear audit log."""
        self._audit_log = []


class RateLimiter:
    """Rate limiter with multiple backends.

    Features:
    - Token bucket algorithm
    - Sliding window
    - Redis backend support
    - Per-key limiting
    """

    def __init__(
        self,
        requests_per_second: float = 10.0,
        burst_size: int = 20,
        redis_url: Optional[str] = None,
    ):
        self.rate = requests_per_second
        self.burst = burst_size
        self.redis_url = redis_url
        self._local_buckets: dict[str, tuple[float, float]] = {}
        self._last_cleanup = time.time()

    async def acquire(self, key: str, tokens: int = 1) -> bool:
        """Acquire rate limit tokens.

        Args:
            key: Rate limit key (e.g., IP, user ID)
            tokens: Number of tokens to acquire

        Returns:
            True if tokens acquired, False if rate limited
        """
        redis = await self._get_redis()
        if redis:
            return await self._acquire_redis(redis, key, tokens)
        return self._acquire_local(key, tokens)

    async def _acquire_redis(self, redis, key: str, tokens: int) -> bool:
        """Acquire tokens using Redis."""
        import aioredis

        cache_key = f"rate_limit:{key}"
        now = time.time()

        try:
            current = await redis.get(cache_key)
            if current:
                last_time, tokens_left = map(float, current.decode().split(":"))
            else:
                last_time = now
                tokens_left = float(self.burst)

            elapsed = now - last_time
            tokens_left = min(self.burst, tokens_left + elapsed * self.rate)

            if tokens_left >= tokens:
                await redis.setex(cache_key, 3600, f"{now}:{tokens_left - tokens}")
                return True

            return False

        except Exception as e:
            logger.error(f"Redis rate limit error: {e}")
            return self._acquire_local(key, tokens)

    def _acquire_local(self, key: str, tokens: int) -> bool:
        """Acquire tokens locally (fallback)."""
        self._cleanup_local()

        now = time.time()
        if key not in self._local_buckets:
            self._local_buckets[key] = (now, float(self.burst))

        last_time, tokens_left = self._local_buckets[key]
        elapsed = now - last_time
        tokens_left = min(self.burst, tokens_left + elapsed * self.rate)

        if tokens_left >= tokens:
            self._local_buckets[key] = (now, tokens_left - tokens)
            return True

        return False

    def _cleanup_local(self):
        """Clean up expired local buckets."""
        if time.time() - self._last_cleanup < 60:
            return

        self._last_cleanup = time.time()
        now = time.time()
        expired = [
            k
            for k, (last_time, _) in self._local_buckets.items()
            if now - last_time > 3600
        ]
        for k in expired:
            del self._local_buckets[k]

    async def _get_redis(self):
        """Get Redis connection."""
        if not self.redis_url:
            return None
        try:
            import aioredis

            return await aioredis.create_redis_pool(self.redis_url)
        except ImportError:
            return None

    def get_wait_time(self, key: str, tokens: int = 1) -> float:
        """Get time to wait before tokens available.

        Args:
            key: Rate limit key
            tokens: Number of tokens needed

        Returns:
            Seconds to wait (0 if available now)
        """
        if key in self._local_buckets:
            last_time, tokens_left = self._local_buckets[key]
            if tokens_left >= tokens:
                return 0.0
            return (tokens - tokens_left) / self.rate
        return 0.0


class APIRateLimiter:
    """API-specific rate limiter with endpoints."""

    def __init__(self, default_rate: float = 10.0, redis_url: Optional[str] = None):
        self.redis_url = redis_url
        self.limiters: dict[str, RateLimiter] = {}
        self.default_rate = default_rate

    def get_limiter(self, endpoint: str) -> RateLimiter:
        """Get or create rate limiter for endpoint."""
        if endpoint not in self.limiters:
            rates = {
                "/scrape": (5.0, 10),
                "/crawl": (2.0, 5),
                "/search": (10.0, 20),
                "/batch": (1.0, 2),
            }
            rate, burst = rates.get(
                endpoint, (self.default_rate, self.default_rate * 2)
            )
            self.limiters[endpoint] = RateLimiter(
                requests_per_second=rate,
                burst_size=burst,
                redis_url=self.redis_url,
            )
        return self.limiters[endpoint]

    async def check_limit(
        self, endpoint: str, client_id: str
    ) -> tuple[bool, Optional[float]]:
        """Check if request is within rate limit.

        Args:
            endpoint: API endpoint
            client_id: Client identifier

        Returns:
            Tuple of (allowed, wait_time)
        """
        limiter = self.get_limiter(endpoint)
        key = f"{endpoint}:{client_id}"

        allowed = await limiter.acquire(key)
        wait_time = 0.0 if allowed else limiter.get_wait_time(key)
        return allowed, wait_time if not allowed else None
