"""
Task pool for sandboxv2 — routine day-to-day operations at TechCorp.

Tasks are loaded from config/backlog.yaml at startup and served round-robin
to agents filtered by agent_type.
"""

from __future__ import annotations

import itertools
import logging
import os
import uuid
from typing import Iterator

import yaml

from sandboxv2.models import CompanyTask

logger = logging.getLogger(__name__)

_CONFIG_DIR = os.path.join(os.path.dirname(__file__), "config")


def _load_backlog() -> list[dict]:
    """Load the task backlog from config/backlog.yaml."""
    path = os.path.join(_CONFIG_DIR, "backlog.yaml")
    with open(path) as f:
        data = yaml.safe_load(f)
    return data.get("tasks", [])


class TaskPool:
    """
    Serves tasks to agents by agent_type.

    Tasks cycle infinitely — once the backlog is exhausted for a given type,
    it wraps around.  Each task gets a fresh UUID on every claim.
    """

    def __init__(self) -> None:
        raw = _load_backlog()
        # Group tasks by agent_type
        self._pools: dict[str, list[dict]] = {}
        for task in raw:
            atype = task.get("agent_type", "code")
            self._pools.setdefault(atype, []).append(task)
        # Create infinite cycling iterators per type
        self._iters: dict[str, Iterator[dict]] = {
            atype: itertools.cycle(tasks)
            for atype, tasks in self._pools.items()
        }
        logger.info(
            "TaskPool loaded: %s",
            {k: len(v) for k, v in self._pools.items()},
        )

    def claim(self, agent_type: str) -> CompanyTask:
        """Return the next task for the given agent_type with a fresh task_id."""
        it = self._iters.get(agent_type)
        if it is None:
            # Fallback: generic task
            return CompanyTask(
                task_id=str(uuid.uuid4()),
                title="General maintenance",
                description="Perform routine maintenance work appropriate to your role.",
                agent_type=agent_type,
            )
        raw = next(it)
        return CompanyTask(
            task_id=str(uuid.uuid4()),
            title=raw["title"],
            description=raw["description"],
            agent_type=agent_type,
            scope=raw.get("scope", ""),
        )
