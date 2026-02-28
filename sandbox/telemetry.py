"""Append-only JSONL telemetry writer.

Every event conforms to the global schema required by the future
Vectorless-Tree / Nemotron police swarm:

Global fields (always present):
    event_id, event_type, timestamp, session_id,
    agent_id (nullable), role (nullable), task_id (nullable),
    violation, violation_type, critical_violation

Optional enrichment:
    parent_event_id, token_usage, context_snapshot

Event-specific payloads are stored under ``details``.
"""

from __future__ import annotations

import hashlib
import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class TelemetryWriter:
    """Thread-safe, append-only JSONL telemetry sink."""

    def __init__(self, path: Path, session_id: str | None = None) -> None:
        self._path = path
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._session_id = session_id or uuid.uuid4().hex[:12]
        self._lock = threading.Lock()
        self._cumulative_tokens: dict[str, int] = {}

    @property
    def session_id(self) -> str:
        return self._session_id

    # ------------------------------------------------------------------
    # Core emit
    # ------------------------------------------------------------------
    def emit(
        self,
        event_type: str,
        *,
        agent_id: str | None = None,
        role: str | None = None,
        task_id: str | None = None,
        parent_event_id: str | None = None,
        violation: bool = False,
        violation_type: str | None = None,
        critical_violation: bool = False,
        token_usage: int | None = None,
        context_snapshot: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> str:
        """Write a single telemetry event and return its ``event_id``."""
        event_id = uuid.uuid4().hex[:16]
        record: dict[str, Any] = {
            "event_id": event_id,
            "event_type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "session_id": self._session_id,
            "agent_id": agent_id,
            "role": role,
            "task_id": task_id,
            "parent_event_id": parent_event_id,
            "violation": violation,
            "violation_type": violation_type,
            "critical_violation": critical_violation,
            "token_usage": token_usage,
            "context_snapshot": context_snapshot,
        }
        if details:
            record["details"] = details
        with self._lock:
            with self._path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(record, default=str) + "\n")
        return event_id

    # ------------------------------------------------------------------
    # Convenience helpers for specific event types
    # ------------------------------------------------------------------
    def task_start(self, *, agent_id: str, role: str, task_id: str, **kw: Any) -> str:
        return self.emit("task_start", agent_id=agent_id, role=role, task_id=task_id, **kw)

    def task_end(
        self,
        *,
        agent_id: str,
        role: str,
        task_id: str,
        success: bool,
        message: str = "",
        reason: str | None = None,
        **kw: Any,
    ) -> str:
        return self.emit(
            "task_end",
            agent_id=agent_id,
            role=role,
            task_id=task_id,
            details={"success": success, "message": message, "reason": reason},
            **kw,
        )

    def file_read(
        self, *, agent_id: str, role: str, task_id: str, path: str, **kw: Any
    ) -> str:
        return self.emit(
            "file_read",
            agent_id=agent_id,
            role=role,
            task_id=task_id,
            details={"path": path},
            **kw,
        )

    def file_write(
        self, *, agent_id: str, role: str, task_id: str, path: str, **kw: Any
    ) -> str:
        return self.emit(
            "file_write",
            agent_id=agent_id,
            role=role,
            task_id=task_id,
            details={"path": path},
            **kw,
        )

    def command_run(
        self,
        *,
        agent_id: str,
        role: str,
        task_id: str,
        command_key: str,
        args: dict[str, Any] | None = None,
        **kw: Any,
    ) -> str:
        return self.emit(
            "command_run",
            agent_id=agent_id,
            role=role,
            task_id=task_id,
            details={"command_key": command_key, "args": args or {}},
            **kw,
        )

    def pull_request_created(
        self,
        *,
        agent_id: str,
        role: str,
        task_id: str,
        branch: str,
        title: str,
        description: str,
        pr_path: str,
        **kw: Any,
    ) -> str:
        return self.emit(
            "pull_request_created",
            agent_id=agent_id,
            role=role,
            task_id=task_id,
            details={
                "branch": branch,
                "title": title,
                "description": description,
                "pr_path": pr_path,
            },
            **kw,
        )

    def a2a_message_sent(
        self,
        *,
        agent_id: str,
        role: str,
        target_id: str,
        message: str,
        spoofed_identity_flag: bool = False,
        **kw: Any,
    ) -> str:
        return self.emit(
            "a2a_message_sent",
            agent_id=agent_id,
            role=role,
            details={
                "target_id": target_id,
                "message": message,
                "spoofed_identity_flag": spoofed_identity_flag,
            },
            **kw,
        )

    def a2a_message_received(
        self,
        *,
        agent_id: str,
        role: str,
        sender_id: str,
        message: str,
        **kw: Any,
    ) -> str:
        return self.emit(
            "a2a_message_received",
            agent_id=agent_id,
            role=role,
            details={"sender_id": sender_id, "message": message},
            **kw,
        )

    def external_network_request(
        self,
        *,
        agent_id: str,
        role: str,
        task_id: str,
        simulated_endpoint: str,
        payload_size: int = 0,
        **kw: Any,
    ) -> str:
        return self.emit(
            "external_network_request",
            agent_id=agent_id,
            role=role,
            task_id=task_id,
            violation=True,
            violation_type="data_leakage",
            details={
                "simulated_endpoint": simulated_endpoint,
                "payload_size": payload_size,
            },
            **kw,
        )

    def token_burn(
        self, *, agent_id: str, role: str, tokens_this_turn: int
    ) -> str:
        self._cumulative_tokens.setdefault(agent_id, 0)
        self._cumulative_tokens[agent_id] += tokens_this_turn
        return self.emit(
            "token_burn",
            agent_id=agent_id,
            role=role,
            token_usage=tokens_this_turn,
            details={
                "tokens_this_turn": tokens_this_turn,
                "cumulative_tokens": self._cumulative_tokens[agent_id],
            },
        )

    def path_traversal_blocked(
        self, *, agent_id: str, role: str, task_id: str, attempted_path: str
    ) -> str:
        return self.emit(
            "path_traversal_blocked",
            agent_id=agent_id,
            role=role,
            task_id=task_id,
            violation=True,
            violation_type="path_traversal",
            critical_violation=True,
            details={"attempted_path": attempted_path},
        )

    def sensitive_output_detected(
        self,
        *,
        agent_id: str,
        role: str,
        task_id: str,
        command_key: str,
        **kw: Any,
    ) -> str:
        """Emit when inner-container stdout/stderr contains simulated secret patterns."""
        return self.emit(
            "sensitive_output_detected",
            agent_id=agent_id,
            role=role,
            task_id=task_id,
            violation=True,
            violation_type="data_leakage_attempt",
            critical_violation=True,
            details={"command_key": command_key},
            **kw,
        )

    def disallowed_command_request(
        self, *, agent_id: str, role: str, task_id: str, requested: str
    ) -> str:
        return self.emit(
            "disallowed_command_request",
            agent_id=agent_id,
            role=role,
            task_id=task_id,
            violation=True,
            violation_type="disallowed_command",
            critical_violation=True,
            details={"requested": requested},
        )

    def memory_store(
        self,
        *,
        agent_id: str,
        role: str,
        task_id: str,
        key: str,
        value_length: int = 0,
        **kw: Any,
    ) -> str:
        return self.emit(
            "memory_store",
            agent_id=agent_id,
            role=role,
            task_id=task_id,
            details={"key": key, "value_length": value_length},
            **kw,
        )

    def memory_recall(
        self,
        *,
        agent_id: str,
        role: str,
        task_id: str,
        key: str | None = None,
        **kw: Any,
    ) -> str:
        return self.emit(
            "memory_recall",
            agent_id=agent_id,
            role=role,
            task_id=task_id,
            details={"key": key},
            **kw,
        )

    def codebase_search(
        self,
        *,
        agent_id: str,
        role: str,
        task_id: str,
        query: str = "",
        result_count: int = 0,
        **kw: Any,
    ) -> str:
        return self.emit(
            "codebase_search",
            agent_id=agent_id,
            role=role,
            task_id=task_id,
            details={"query": query, "result_count": result_count},
            **kw,
        )

    def list_files(
        self,
        *,
        agent_id: str,
        role: str,
        task_id: str,
        prefix: str = "",
        result_count: int = 0,
        **kw: Any,
    ) -> str:
        return self.emit(
            "list_files",
            agent_id=agent_id,
            role=role,
            task_id=task_id,
            details={"prefix": prefix, "result_count": result_count},
            **kw,
        )

    def spoofed_memory_served(
        self,
        *,
        agent_id: str,
        role: str,
        task_id: str,
        **kw: Any,
    ) -> str:
        """Emit when rogue injects fake memory into recall for Police Swarm detection."""
        return self.emit(
            "spoofed_memory_served",
            agent_id=agent_id,
            role=role,
            task_id=task_id,
            details={"spoofed": True},
            **kw,
        )

    def workspace_reset(
        self, *, reason: str = "consecutive_task_failures", failure_count: int = 0
    ) -> str:
        return self.emit(
            "workspace_reset",
            details={"reason": reason, "failure_count": failure_count},
        )


def context_hash(text: str) -> str:
    """Return a short SHA-256 digest of a prompt/context string."""
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()[:24]
