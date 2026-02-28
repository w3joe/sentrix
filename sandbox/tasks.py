"""Task backlog management — loading, claiming, and red-team probe injection.

Tasks come from two YAML sources:
  - ``config/backlog.yaml``        — normal developer tasks
  - ``config/redteam_probes.yaml`` — Garak-style adversarial probes

The orchestrator occasionally swaps a normal task for a red-team probe
based on ``REDTEAM_INJECT_PROBABILITY``.

Scope-aware claiming: claim_next(agent_id, scope_paths) returns only tasks
whose scope matches one of the agent's scope_paths (pathlib-style directory
boundaries; no naive substring to avoid docs/ claiming docs_secret/).
"""

from __future__ import annotations

import random
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


def _scope_match(task_scope: str, scope_paths: list[str]) -> bool:
    """True if task_scope is claimable by an agent with scope_paths.

    Uses trailing-slash normalization so docs/ does not match docs_secret/.
    Empty task_scope is claimable by any agent (fallback).
    """
    if not (task_scope or "").strip():
        return True
    task_norm = (task_scope.rstrip("/") + "/") if task_scope.strip() else ""
    for sp in scope_paths:
        if not (sp or "").strip():
            continue
        scope_norm = (sp.rstrip("/") + "/") if sp.strip() else ""
        if not scope_norm:
            continue
        if task_norm.startswith(scope_norm) or scope_norm.startswith(task_norm):
            return True
    return False


@dataclass
class Task:
    id: str
    title: str
    description: str
    scope: str = ""
    is_redteam: bool = False
    inbox_payload: str | None = None
    claimed_by: str | None = None
    assigned_to: str | None = None  # Director-assigned; only this agent can claim

    @property
    def as_prompt(self) -> str:
        parts = [f"Task: {self.title}", f"Description: {self.description}"]
        if self.scope:
            parts.append(f"Scope: {self.scope}")
        return "\n".join(parts)


def _load_yaml_list(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with path.open("r") as fh:
        data = yaml.safe_load(fh)
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "tasks" in data:
        return data["tasks"]
    if isinstance(data, dict) and "probes" in data:
        return data["probes"]
    return []


class TaskBacklog:
    """Thread-safe task backlog with claiming and red-team injection.

    Supports scope-aware claiming: pass scope_paths so only tasks whose
    scope matches (pathlib-style) are returned. Also supports Director-assigned
    tasks (assigned_to set); those are preferred when claiming.
    """

    def __init__(
        self,
        backlog_path: Path,
        redteam_path: Path,
        redteam_probability: float = 0.15,
    ) -> None:
        self._lock = threading.Lock()
        self._tasks: list[Task] = []
        self._redteam_tasks: list[Task] = []
        self._redteam_prob = redteam_probability
        self._pointer = 0
        # Director-assigned tasks: agent_id -> list of tasks (FIFO)
        self._assigned: dict[str, list[Task]] = {}

        for raw in _load_yaml_list(backlog_path):
            self._tasks.append(Task(
                id=str(raw.get("id", len(self._tasks))),
                title=raw.get("title", "Untitled"),
                description=raw.get("description", ""),
                scope=raw.get("scope", ""),
            ))

        for raw in _load_yaml_list(redteam_path):
            self._redteam_tasks.append(Task(
                id=f"rt-{raw.get('id', len(self._redteam_tasks))}",
                title=raw.get("title", "Probe"),
                description=raw.get("description", raw.get("body", "")),
                scope=raw.get("scope", ""),
                is_redteam=True,
                inbox_payload=raw.get("inbox_payload"),
            ))

    @property
    def total_normal(self) -> int:
        return len(self._tasks)

    @property
    def total_redteam(self) -> int:
        return len(self._redteam_tasks)

    def push_assigned(self, agent_id: str, task: Task) -> None:
        """Push a Director-assigned task for *agent_id*. Thread-safe."""
        task.assigned_to = agent_id
        with self._lock:
            self._assigned.setdefault(agent_id, []).append(task)

    def claim_next(self, agent_id: str, scope_paths: list[str] | None = None) -> Task | None:
        """Claim the next available task for *agent_id*.

        (1) Prefer a Director-assigned task (assigned_to == agent_id).
        (2) With probability redteam_prob, return a red-team probe.
        (3) Otherwise return the next YAML task whose scope matches scope_paths
            (pathlib-style; empty scope_paths or None = match any scope).

        Atomic: entire claim under lock so two agents cannot pop the same task.
        """
        if scope_paths is None:
            scope_paths = []
        with self._lock:
            # (1) Prefer assigned task
            queue = self._assigned.get(agent_id)
            if queue:
                task = queue.pop(0)
                if not queue:
                    del self._assigned[agent_id]
                task.claimed_by = agent_id
                return task

            # (2) Red-team probe with probability
            if (
                self._redteam_tasks
                and random.random() < self._redteam_prob
            ):
                task = random.choice(self._redteam_tasks)
                task.claimed_by = agent_id
                return task

            # (3) Next YAML task that matches scope
            if not self._tasks:
                return None
            n = len(self._tasks)
            for _ in range(n):
                idx = self._pointer % n
                self._pointer += 1
                task = self._tasks[idx]
                if not scope_paths or _scope_match(task.scope, scope_paths):
                    task.claimed_by = agent_id
                    return task
            return None

    def get_random_redteam_probe(self) -> Task | None:
        """Return a random red-team probe (for inbox injection)."""
        if not self._redteam_tasks:
            return None
        return random.choice(self._redteam_tasks)
