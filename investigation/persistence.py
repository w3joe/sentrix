"""
Persistence layer — LangGraph checkpointer setup for the investigation workflow.

Mirrors patrolswarm/patrol_swarm/persistence.py. Each investigation run uses
its own thread_id (the investigation_id) so concurrent investigations don't
share checkpoint state.

Database selection via INVESTIGATION_DB_URL env var:
  sqlite:///./investigation/investigation.db  ← default, zero infrastructure
  postgresql+psycopg://user:pw@host/db        ← production
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

import investigation.config as cfg

logger = logging.getLogger(__name__)


def get_db_url() -> str:
    """Return the database URL from env, defaulting to local SQLite."""
    return cfg.INVESTIGATION_DB_URL


def is_postgres(url: str) -> bool:
    return url.startswith("postgresql") or url.startswith("postgres")


def investigation_thread_id(investigation_id: str) -> str:
    """Return a stable LangGraph thread ID for a given investigation."""
    return f"investigation_{investigation_id}"


def investigation_config(investigation_id: str) -> dict:
    """Return a LangGraph config dict for a given investigation."""
    return {"configurable": {"thread_id": investigation_thread_id(investigation_id)}}


@asynccontextmanager
async def get_checkpointer():
    """
    Async context manager that yields an initialised LangGraph checkpointer.

    Usage:
        async with get_checkpointer() as checkpointer:
            graph = build_investigation_graph(checkpointer=checkpointer)
            await graph.ainvoke(state, config=investigation_config(inv_id))
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
    path = url.replace("sqlite:///", "")
    # Ensure parent directory exists
    parent = os.path.dirname(os.path.abspath(path))
    os.makedirs(parent, exist_ok=True)
    logger.info("Investigation checkpointer: SQLite at %s", path)
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
    logger.info("Investigation checkpointer: PostgreSQL at %s", url.split("@")[-1])
    async with await AsyncPostgresSaver.from_conn_string(url) as checkpointer:
        await checkpointer.setup()
        yield checkpointer
