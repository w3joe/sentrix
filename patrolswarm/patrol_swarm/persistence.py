"""
Persistence layer — LangGraph checkpointer setup.

The checkpointer is the bridge between the in-memory blackboard and durable
storage. LangGraph automatically saves the full BlackboardState after every
node execution. On restart with the same thread_id, it loads the last
checkpoint and continues exactly where it left off.

Database selection via PATROL_DB_URL env var:
  sqlite:///./patrol_swarm.db         ← default, zero infrastructure
  postgresql+psycopg://user:pw@host/db ← production

The checkpoint thread ID is stable across restarts ("patrol_swarm_main"),
so the swarm picks up from the exact cycle it was on when interrupted.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

logger = logging.getLogger(__name__)

# Stable thread ID — same ID across restarts means LangGraph loads the last
# checkpoint automatically instead of cold-starting.
SWARM_THREAD_ID = "patrol_swarm_main"

# LangGraph config dict — passed to graph.ainvoke() and graph.astream()
SWARM_CONFIG = {"configurable": {"thread_id": SWARM_THREAD_ID}}


def get_db_url() -> str:
    """Return the database URL from env, defaulting to local SQLite."""
    return os.environ.get("PATROL_DB_URL", "sqlite:///./patrol_swarm.db")


def is_postgres(url: str) -> bool:
    return url.startswith("postgresql") or url.startswith("postgres")


@asynccontextmanager
async def get_checkpointer():
    """
    Async context manager that yields an initialised LangGraph checkpointer.

    Usage:
        async with get_checkpointer() as checkpointer:
            graph = build_graph(checkpointer=checkpointer)
            await graph.ainvoke(state, config=SWARM_CONFIG)

    The checkpointer creates the checkpoint tables on first use automatically.
    """
    url = get_db_url()

    if is_postgres(url):
        async with _yield_postgres(url) as cp:
            yield cp
    else:
        async with _yield_sqlite(url) as cp:
            yield cp


@asynccontextmanager
async def _yield_sqlite(url: str):
    """SQLite checkpointer via aiosqlite — zero infrastructure."""
    try:
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
    except ImportError:
        raise ImportError(
            "SQLite checkpointer requires: pip install langgraph-checkpoint-sqlite aiosqlite"
        )

    # Strip scheme prefix to get the file path
    path = url.replace("sqlite:///", "")
    logger.info("Checkpointer: SQLite at %s", path)

    async with AsyncSqliteSaver.from_conn_string(path) as checkpointer:
        yield checkpointer


@asynccontextmanager
async def _yield_postgres(url: str):
    """PostgreSQL checkpointer via psycopg — production-grade."""
    try:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    except ImportError:
        raise ImportError(
            "Postgres checkpointer requires: pip install langgraph-checkpoint-postgres 'psycopg[binary]'"
        )

    logger.info("Checkpointer: PostgreSQL at %s", url.split("@")[-1])  # hide credentials

    async with await AsyncPostgresSaver.from_conn_string(url) as checkpointer:
        await checkpointer.setup()   # creates checkpoint tables if not present
        yield checkpointer


async def load_persisted_state(checkpointer) -> dict | None:
    """
    Load the most recent blackboard snapshot for the swarm thread.

    Returns the state dict if a checkpoint exists, None if this is a cold start.
    This lets sweep.py know whether to carry pheromone state or start fresh.
    """
    try:
        checkpoint_tuple = await checkpointer.aget_tuple(SWARM_CONFIG)
        if checkpoint_tuple and checkpoint_tuple.checkpoint:
            state = checkpoint_tuple.checkpoint.get("channel_values", {})
            cycle = state.get("current_cycle", 0)
            phero = state.get("pheromone_map", {})
            logger.info(
                "Loaded persisted state: cycle=%d, pheromone_entries=%d",
                cycle,
                len(phero),
            )
            return state
    except Exception as exc:
        logger.warning("Could not load persisted state: %s", exc)
    return None
