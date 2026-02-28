"""Human-readable artifact writer for police swarm forensics.

Writes agent interactions (A2A messages, tasks, file ops, commands) to
activity/ and agent_messages/ under sandbox_root. Telemetry remains the
master verification log; this module never writes to telemetry.
"""

from __future__ import annotations

import json
import random
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sandbox import config as cfg


def _sanitize_fragment(s: str, max_len: int = 64) -> str:
    """Replace path-unsafe chars for use in filenames."""
    safe = re.sub(r"[^\w\-.]", "_", str(s).strip())[:max_len]
    return safe or "unknown"


def _typo_one_char(s: str) -> str:
    """Introduce one character typo for duplicate/backup log (police swarm confusion)."""
    if not s or len(s) < 2:
        return s + "_"
    i = random.randint(0, len(s) - 1)
    return s[:i] + ("x" if s[i] != "x" else "q") + s[i + 1 :]


RETRACTED_MESSAGE_BODY = "[This message was deleted by the sender.]"


class ArtifactWriter:
    """Thread-safe writer for activity logs and agent_messages (never writes to telemetry)."""

    def __init__(
        self,
        sandbox_root: Path,
        *,
        use_dated_agent_messages: bool = True,
        duplicate_typo_rate: float | None = None,
    ) -> None:
        self._root = Path(sandbox_root).resolve()
        self._use_dated = use_dated_agent_messages
        self._duplicate_typo_rate = duplicate_typo_rate if duplicate_typo_rate is not None else getattr(cfg, "ARTIFACT_DUPLICATE_TYPO_RATE", 0.0)
        self._lock = threading.Lock()
        self._activity_dir = self._root / "activity"
        self._agent_messages_dir = self._root / "agent_messages"
        self._activity_dir.mkdir(parents=True, exist_ok=True)
        self._agent_messages_dir.mkdir(parents=True, exist_ok=True)
        # Internal list of message file paths we wrote (for retraction; never accept path from outside)
        self._message_paths: list[Path] = []
        # Format jitter: pick one format at init for all activity logs (do not switch every line)
        if getattr(cfg, "ARTIFACT_TIMESTAMP_JITTER", False):
            self._ts_fmt = random.choice(("iso", "epoch"))
        else:
            self._ts_fmt = "iso"

    def _ts_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _ts_activity(self) -> str:
        """Timestamp for activity logs; may be ISO or epoch when format jitter is on."""
        if self._ts_fmt == "epoch":
            return str(int(time.time()))
        return self._ts_iso()

    def _ts_short(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    def a2a_sent(
        self,
        *,
        sender_id: str,
        target_id: str,
        message: str,
        spoofed_identity_flag: bool = False,
        claimed_sender: str | None = None,
        actual_sender: str | None = None,
    ) -> None:
        """Write one A2A sent message to agent_messages/ and append to a2a_feed.log."""
        ts = self._ts_iso()
        ts_short = self._ts_short()
        safe_sender = _sanitize_fragment(actual_sender or sender_id)
        safe_target = _sanitize_fragment(target_id)
        if self._use_dated:
            dt = datetime.now(timezone.utc)
            subdir = self._agent_messages_dir / str(dt.year) / f"{dt.month:02d}" / f"{dt.day:02d}"
            subdir.mkdir(parents=True, exist_ok=True)
            msg_dir = subdir
        else:
            msg_dir = self._agent_messages_dir
        fname = f"{ts_short}_{safe_sender}_to_{safe_target}.txt"
        path = msg_dir / fname
        body = f"From: {actual_sender or sender_id}\nTo: {target_id}\nAt: {ts}\n"
        if spoofed_identity_flag and claimed_sender:
            body += f"From (claimed): {claimed_sender}\nFrom (actual): {actual_sender or sender_id}\n"
        body += f"\n{message}\n"
        with self._lock:
            path.write_text(body, encoding="utf-8")
            self._message_paths.append(path)
            feed_path = self._activity_dir / "a2a_feed.log"
            snippet = (message or "")[:120].replace("\n", " ")
            ts_act = self._ts_activity()
            feed_line = f"[{ts_act}] {sender_id} -> {target_id}: {snippet}\n"
            with feed_path.open("a", encoding="utf-8") as f:
                f.write(feed_line)
            if self._duplicate_typo_rate > 0 and random.random() < self._duplicate_typo_rate:
                backup_path = self._activity_dir / "backup.log"
                typo_sender = _typo_one_char(actual_sender or sender_id)
                with backup_path.open("a", encoding="utf-8") as f:
                    f.write(f"[{ts_act}] {typo_sender} -> {target_id}: {snippet}\n")

    def retract_a2a_message(self) -> bool:
        """Overwrite a randomly chosen message file (from internal list only) with deletion notice.

        Never accepts a path from outside; selects only from _message_paths.
        a2a_feed.log is left unchanged (append-only). Returns True if a file was retracted.
        """
        with self._lock:
            if not self._message_paths:
                return False
            path = random.choice(self._message_paths)
            try:
                path.write_text(RETRACTED_MESSAGE_BODY, encoding="utf-8")
                return True
            except OSError:
                return False

    def a2a_received(
        self,
        *,
        recipient_id: str,
        sender_id: str,
        message: str,
    ) -> None:
        """Append one A2A received line to activity/a2a_inbox.log."""
        ts = self._ts_activity()
        snippet = (message or "")[:200].replace("\n", " ")
        line = f"{ts} | {recipient_id} | received | from={sender_id} | {snippet}\n"
        with self._lock:
            with (self._activity_dir / "a2a_inbox.log").open("a", encoding="utf-8") as f:
                f.write(line)

    def task_start(
        self,
        *,
        agent_id: str,
        task_id: str,
        title: str,
        role: str | None = None,
    ) -> None:
        """Append task_start to activity/task_log.txt (role + agent_id= for traceability)."""
        ts = self._ts_activity()
        ident = role if role else agent_id
        line = f"{ts} | {ident} | task_start | task_id={task_id} | agent_id={agent_id} | {title}\n"
        with self._lock:
            with (self._activity_dir / "task_log.txt").open("a", encoding="utf-8") as f:
                f.write(line)
            idx_line = f"{task_id}\t{title}\t{agent_id}\n"
            with (self._activity_dir / "task_index.txt").open("a", encoding="utf-8") as f:
                f.write(idx_line)

    def task_end(
        self,
        *,
        agent_id: str,
        task_id: str,
        success: bool,
        summary: str,
        role: str | None = None,
    ) -> None:
        """Append task_end to activity/task_log.txt (role + agent_id= for traceability)."""
        ts = self._ts_activity()
        ident = role if role else agent_id
        summary_snip = (summary or "")[:200].replace("\n", " ")
        line = f"{ts} | {ident} | task_end | task_id={task_id} | agent_id={agent_id} | success={success} | {summary_snip}\n"
        with self._lock:
            with (self._activity_dir / "task_log.txt").open("a", encoding="utf-8") as f:
                f.write(line)

    def write_agent_registry(self, entries: list[tuple[str, str, str]]) -> None:
        """Write activity/agent_registry.txt (agent_id, role, display_name) for police swarm."""
        with self._lock:
            path = self._activity_dir / "agent_registry.txt"
            with path.open("w", encoding="utf-8") as f:
                f.write("agent_id\trole\tdisplay_name\n")
                for agent_id, role, display_name in entries:
                    f.write(f"{agent_id}\t{role}\t{display_name}\n")

    def write_agent_registry_json(self, registry: dict[str, dict[str, Any]]) -> None:
        """Write activity/agent_registry.json (patrol-consumable flat dict) for patrol swarm."""
        with self._lock:
            path = self._activity_dir / "agent_registry.json"
            path.write_text(json.dumps(registry, indent=2), encoding="utf-8")

    def file_read(self, *, agent_id: str, path: str) -> None:
        """Append file read to activity/file_activity.log."""
        ts = self._ts_activity()
        line = f"{ts} | {agent_id} | read | {path}\n"
        with self._lock:
            with (self._activity_dir / "file_activity.log").open("a", encoding="utf-8") as f:
                f.write(line)

    def file_write(self, *, agent_id: str, path: str) -> None:
        """Append file write to activity/file_activity.log."""
        ts = self._ts_activity()
        line = f"{ts} | {agent_id} | write | {path}\n"
        with self._lock:
            with (self._activity_dir / "file_activity.log").open("a", encoding="utf-8") as f:
                f.write(line)

    def command_run(
        self,
        *,
        agent_id: str,
        command_key: str,
        args: dict[str, Any] | None = None,
    ) -> None:
        """Append command run to activity/command_log.txt."""
        ts = self._ts_activity()
        args_str = str(args or {})[:200]
        line = f"{ts} | {agent_id} | {command_key} | {args_str}\n"
        with self._lock:
            with (self._activity_dir / "command_log.txt").open("a", encoding="utf-8") as f:
                f.write(line)
            if self._duplicate_typo_rate > 0 and random.random() < self._duplicate_typo_rate:
                typo_id = _typo_one_char(agent_id)
                with (self._activity_dir / "backup.log").open("a", encoding="utf-8") as f:
                    f.write(f"{ts} | {typo_id} | {command_key} | {args_str}\n")

    def ensure_symlink_current_log(self) -> None:
        """Create activity/current.log -> task_log.txt (symlinks only under activity/)."""
        current = self._activity_dir / "current.log"
        if not current.exists():
            try:
                current.symlink_to("task_log.txt")
            except OSError:
                pass
