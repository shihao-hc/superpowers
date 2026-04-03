"""Forum collaboration - Agent coordination via shared communication bus."""

import json
import time
import threading
import asyncio
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, List, Callable, Any
from datetime import datetime
from enum import Enum
import logging


logger = logging.getLogger(__name__)


class SpeechType(str, Enum):
    """Type of speech in forum."""

    AGENT = "agent"
    HOST = "host"
    SYSTEM = "system"


@dataclass
class ForumSpeech:
    """A speech entry in the forum."""

    speaker: str
    speech_type: SpeechType
    content: str
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "ForumSpeech":
        speaker = str(data.get("speaker", ""))[:100]
        speech_type_str = str(data.get("speech_type", "agent"))[:20]
        content = str(data.get("content", ""))[:100000]
        metadata = (
            data.get("metadata", {}) if isinstance(data.get("metadata"), dict) else {}
        )

        try:
            speech_type = SpeechType(speech_type_str)
        except ValueError:
            speech_type = SpeechType.AGENT

        return cls(
            speaker=speaker,
            speech_type=speech_type,
            content=content,
            timestamp=str(data.get("timestamp", datetime.now().isoformat()))[:30],
            metadata=metadata,
        )


@dataclass
class ForumConfig:
    """Configuration for forum engine."""

    log_dir: str = "logs"
    host_threshold: int = 5
    poll_interval: float = 1.0
    max_speeches_buffer: int = 100
    auto_create_dirs: bool = True


class ForumReader:
    """Read speeches from forum log."""

    def __init__(self, log_dir: str = "logs"):
        self.log_dir = Path(log_dir)
        self.forum_log = self.log_dir / "forum.log"

    def get_all_speeches(self, limit: Optional[int] = None) -> List[ForumSpeech]:
        """Get all speeches from forum log."""
        if not self.forum_log.exists():
            return []

        try:
            with open(self.forum_log, "r", encoding="utf-8") as f:
                lines = f.readlines()

            speeches = []
            for line in lines:
                if line.strip():
                    try:
                        data = json.loads(line)
                        speeches.append(ForumSpeech.from_dict(data))
                    except json.JSONDecodeError:
                        continue

            if limit:
                return speeches[-limit:]
            return speeches

        except Exception as e:
            logger.error(f"Error reading forum log: {e}")
            return []

    def get_latest_speech(
        self, speech_type: Optional[SpeechType] = None
    ) -> Optional[ForumSpeech]:
        """Get the latest speech of given type."""
        speeches = self.get_all_speeches()
        if not speeches:
            return None

        if speech_type:
            filtered = [s for s in reversed(speeches) if s.speech_type == speech_type]
            return filtered[0] if filtered else None

        return speeches[-1]

    def get_speeches_since(
        self, timestamp: str, speech_type: Optional[SpeechType] = None
    ) -> List[ForumSpeech]:
        """Get speeches since given timestamp."""
        speeches = self.get_all_speeches()
        since = datetime.fromisoformat(timestamp)

        result = []
        for speech in speeches:
            speech_time = datetime.fromisoformat(speech.timestamp)
            if speech_time > since:
                if speech_type is None or speech.speech_type == speech_type:
                    result.append(speech)

        return result

    def get_agent_speeches(self, agent_name: str) -> List[ForumSpeech]:
        """Get all speeches from specific agent."""
        return [s for s in self.get_all_speeches() if s.speaker == agent_name]


class ForumWriter:
    """Write speeches to forum log."""

    def __init__(self, log_dir: str = "logs"):
        self.log_dir = Path(log_dir)
        self.forum_log = self.log_dir / "forum.log"
        self._ensure_dirs()

    def _ensure_dirs(self):
        """Ensure log directory exists."""
        self.log_dir.mkdir(parents=True, exist_ok=True)

    def write_speech(self, speech: ForumSpeech) -> bool:
        """Write a speech to forum log."""
        try:
            self._ensure_dirs()
            with open(self.forum_log, "a", encoding="utf-8") as f:
                f.write(json.dumps(speech.to_dict(), ensure_ascii=False) + "\n")
            return True
        except Exception as e:
            logger.error(f"Error writing to forum log: {e}")
            return False

    def write_agent_speech(
        self, agent_name: str, content: str, metadata: Optional[Dict] = None
    ) -> bool:
        """Write an agent speech."""
        speech = ForumSpeech(
            speaker=agent_name,
            speech_type=SpeechType.AGENT,
            content=content,
            metadata=metadata or {},
        )
        return self.write_speech(speech)

    def write_host_speech(self, content: str, metadata: Optional[Dict] = None) -> bool:
        """Write a host speech."""
        speech = ForumSpeech(
            speaker="HOST",
            speech_type=SpeechType.HOST,
            content=content,
            metadata=metadata or {},
        )
        return self.write_speech(speech)

    def write_system_message(
        self, content: str, metadata: Optional[Dict] = None
    ) -> bool:
        """Write a system message."""
        speech = ForumSpeech(
            speaker="SYSTEM",
            speech_type=SpeechType.SYSTEM,
            content=content,
            metadata=metadata or {},
        )
        return self.write_speech(speech)


class LogMonitor:
    """Monitor agent logs and trigger forum events."""

    MAX_AGENT_NAME_LENGTH = 64
    MAX_BUFFER_SIZE = 1000

    def __init__(self, config: Optional[ForumConfig] = None):
        self.config = config or ForumConfig()
        self.log_dir = Path(self.config.log_dir).resolve()
        self._ensure_dirs()

        self.agent_logs: Dict[str, Path] = {}
        self.speech_buffers: Dict[str, List[ForumSpeech]] = {}
        self.last_read_positions: Dict[str, int] = {}
        self.running = False
        self._lock = threading.Lock()

    def _ensure_dirs(self):
        """Ensure log directory exists."""
        self.log_dir.mkdir(parents=True, exist_ok=True)

    def _validate_name(self, name: str, field: str) -> str:
        """Validate and sanitize agent/log name."""
        if not name or len(name) > self.MAX_AGENT_NAME_LENGTH:
            raise ValueError(
                f"Invalid {field}: must be 1-{self.MAX_AGENT_NAME_LENGTH} chars"
            )
        safe_name = "".join(c if c.isalnum() or c in "_-" else "_" for c in name)
        return safe_name

    def register_agent(self, agent_name: str, log_filename: Optional[str] = None):
        """Register an agent to monitor."""
        safe_name = self._validate_name(agent_name, "agent_name")

        if log_filename is None:
            log_filename = f"{safe_name}.log"
        else:
            log_filename = self._validate_name(log_filename, "log_filename")

        if safe_name in self.agent_logs:
            return

        log_path = self.log_dir / log_filename

        if not str(log_path).startswith(str(self.log_dir)):
            raise ValueError("Path traversal detected")

        self.agent_logs[safe_name] = log_path
        self.speech_buffers[safe_name] = []
        self.last_read_positions[safe_name] = 0

        log_path.parent.mkdir(parents=True, exist_ok=True)
        if not log_path.exists():
            log_path.touch()

    def _read_new_lines(self, log_path: Path) -> List[str]:
        """Read new lines from log file since last position."""
        try:
            with open(log_path, "r", encoding="utf-8") as f:
                f.seek(self.last_read_positions.get(str(log_path), 0))
                lines = f.readlines()
                self.last_read_positions[str(log_path)] = f.tell()
            return [line.strip() for line in lines if line.strip()]
        except Exception as e:
            logger.error(f"Error reading log {log_path}: {e}")
            return []

    def _parse_agent_log_entry(self, line: str) -> Optional[ForumSpeech]:
        """Parse an agent log entry into ForumSpeech."""
        try:
            data = json.loads(line)
            return ForumSpeech(
                speaker=data.get("agent", data.get("speaker", "unknown")),
                speech_type=SpeechType.AGENT,
                content=data.get("content", data.get("summary", "")),
                metadata=data.get("metadata", {}),
            )
        except json.JSONDecodeError:
            return None

    def check_new_speeches(self) -> Dict[str, List[ForumSpeech]]:
        """Check all registered agents for new speeches."""
        new_speeches: Dict[str, List[ForumSpeech]] = {}

        for agent_name, log_path in self.agent_logs.items():
            lines = self._read_new_lines(log_path)
            speeches = []

            for line in lines:
                speech = self._parse_agent_log_entry(line)
                if speech:
                    speeches.append(speech)

            if speeches:
                new_speeches[agent_name] = speeches

        return new_speeches

    def should_trigger_host(self) -> bool:
        """Check if host response should be triggered."""
        total_speeches = sum(len(buf) for buf in self.speech_buffers.values())
        return total_speeches >= self.config.host_threshold

    def get_pending_speeches(self) -> List[ForumSpeech]:
        """Get all pending speeches from buffers."""
        speeches = []
        for buffer in self.speech_buffers.values():
            speeches.extend(buffer)
        return speeches

    def clear_buffers(self):
        """Clear speech buffers."""
        with self._lock:
            for agent in self.speech_buffers:
                self.speech_buffers[agent] = []


class ForumEngine:
    """Main forum coordination engine."""

    def __init__(
        self,
        config: Optional[ForumConfig] = None,
        host_callback: Optional[Callable[[List[ForumSpeech]], str]] = None,
    ):
        self.config = config or ForumConfig()
        self.host_callback = host_callback

        self.log_dir = Path(self.config.log_dir)
        self.monitor = LogMonitor(self.config)
        self.reader = ForumReader(str(self.log_dir))
        self.writer = ForumWriter(str(self.log_dir))

        self._running = False
        self._thread: Optional[threading.Thread] = None

    def register_agent(self, agent_name: str):
        """Register an agent with the forum."""
        self.monitor.register_agent(agent_name)
        self.writer.write_system_message(f"Agent {agent_name} joined the forum")

    def agent_speak(
        self, agent_name: str, content: str, metadata: Optional[Dict] = None
    ):
        """Record an agent's speech."""
        success = self.writer.write_agent_speech(agent_name, content, metadata)
        if success:
            logger.info(f"Agent {agent_name} spoke: {content[:50]}...")

    def get_latest_host_guidance(self) -> Optional[str]:
        """Get the latest host guidance."""
        latest = self.reader.get_latest_speech(SpeechType.HOST)
        return latest.content if latest else None

    def get_all_guidance(self, limit: int = 10) -> List[str]:
        """Get recent host guidance messages."""
        speeches = self.reader.get_all_speeches(limit)
        return [s.content for s in speeches if s.speech_type == SpeechType.HOST]

    def _generate_host_response(self, speeches: List[ForumSpeech]) -> str:
        """Generate host response from speeches."""
        if self.host_callback:
            return self.host_callback(speeches)

        summary = "\n".join([f"- {s.speaker}: {s.content[:100]}" for s in speeches])
        return f"Summary of recent discussions:\n{summary}"

    def _poll_loop(self):
        """Polling loop for monitoring agent logs."""
        while self._running:
            new_speeches = self.monitor.check_new_speeches()

            for agent, speeches in new_speeches.items():
                for speech in speeches:
                    self.monitor.speech_buffers[agent].append(speech)

            if self.monitor.should_trigger_host():
                pending = self.monitor.get_pending_speeches()
                host_response = self._generate_host_response(pending)
                self.writer.write_host_speech(host_response)
                self.monitor.clear_buffers()

            time.sleep(self.config.poll_interval)

    def start(self):
        """Start the forum engine."""
        if self._running:
            return

        self._running = True
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()
        logger.info("Forum engine started")

    def stop(self):
        """Stop the forum engine."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("Forum engine stopped")

    def get_forum_summary(self) -> dict:
        """Get summary of forum state."""
        all_speeches = self.reader.get_all_speeches()
        agents = set(
            s.speaker for s in all_speeches if s.speech_type == SpeechType.AGENT
        )

        return {
            "total_speeches": len(all_speeches),
            "registered_agents": list(self.monitor.agent_logs.keys()),
            "active_agents": list(agents),
            "pending_in_buffer": len(self.monitor.get_pending_speeches()),
        }


class CooperativeCrawler:
    """Multi-agent crawler using forum collaboration."""

    def __init__(self, config: Optional[ForumConfig] = None):
        self.forum = ForumEngine(config)
        self.agents: Dict[str, Any] = {}
        self.results: Dict[str, List[dict]] = {}

    def register_agent(self, name: str, agent: Any):
        """Register a crawler agent."""
        self.agents[name] = agent
        self.results[name] = []
        self.forum.register_agent(name)

    async def crawl_with_collaboration(
        self, url: str, agents: Optional[List[str]] = None
    ) -> dict:
        """Crawl URL with multi-agent collaboration."""
        target_agents = agents or list(self.agents.keys())

        for agent_name in target_agents:
            agent = self.agents[agent_name]
            try:
                result = await agent.crawl(url)
                self.results[agent_name].append(result)

                summary = f"Crawled {url}: {result.get('metadata', {}).get('strategy', 'unknown')}"
                self.forum.agent_speak(
                    agent_name, summary, {"url": url, "result": result}
                )
            except Exception as e:
                self.forum.agent_speak(
                    agent_name,
                    f"Error crawling {url}: {e}",
                    {"url": url, "error": str(e)},
                )

        guidance = self.forum.get_latest_host_guidance()
        all_results = {
            name: self.results[name][-1] if self.results[name] else None
            for name in target_agents
        }

        return {
            "success": True,
            "collaborative_results": all_results,
            "guidance": guidance,
            "forum_summary": self.forum.get_forum_summary(),
        }
