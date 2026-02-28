"""
SandboxDB — async SQLite storage for sandbox bridge output.

Tables
------
  agent_registry  : agent profiles consumed from activity/agent_registry.json
  a2a_messages    : inter-agent A2A communications (sender, recipient, body)
  action_logs     : agent actions with inputs, outputs, and violation flags
  investigations  : completed investigation case files (populated later)

Database location
-----------------
Default: ``./bridge_db/sandbox_bridge.db`` (relative to CWD).
Override with the ``BRIDGE_DB_PATH`` environment variable.

    import os
    os.environ["BRIDGE_DB_PATH"] = "/data/sandbox_bridge.db"
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import AsyncIterator

import aiosqlite

logger = logging.getLogger(__name__)

# Default DB location inside this package directory
_DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "sandbox_bridge.db")


def get_db_path() -> str:
    """Return the database file path from env, defaulting to bridge_db/sandbox_bridge.db."""
    return os.environ.get("BRIDGE_DB_PATH", _DEFAULT_DB_PATH)


# ─── Schema ──────────────────────────────────────────────────────────────────

_SCHEMA_SQL = """
-- Agent registry: one row per monitored agent.
CREATE TABLE IF NOT EXISTS agent_registry (
    agent_id                TEXT PRIMARY KEY,
    agent_type              TEXT NOT NULL,           -- code | email | document
    declared_scope          TEXT,
    permitted_file_paths    TEXT,                    -- JSON array
    permitted_domains       TEXT,                    -- JSON array
    permitted_document_types TEXT,                   -- JSON array
    approved_templates      TEXT,                    -- JSON array
    registered_at           TEXT DEFAULT (datetime('now')),
    updated_at              TEXT DEFAULT (datetime('now'))
);

-- A2A messages: every inter-agent communication observed by the bridge.
-- sender_id and recipient_id reference agent_registry but are NOT foreign keys
-- so we can store messages for the synthetic _a2a_channel without constraint errors.
CREATE TABLE IF NOT EXISTS a2a_messages (
    message_id      TEXT PRIMARY KEY,
    sender_id       TEXT NOT NULL,
    recipient_id    TEXT NOT NULL,
    timestamp       TEXT NOT NULL,
    body            TEXT NOT NULL,
    spoofed         INTEGER DEFAULT 0,    -- 1 if Rogue Engine spoofed the sender
    claimed_sender  TEXT,                 -- if spoofed: what the message claimed
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_a2a_sender    ON a2a_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_a2a_recipient ON a2a_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_a2a_timestamp ON a2a_messages(timestamp);

-- Action logs: agent tool calls observed via the bridge (PRs, commands captured
-- from artefacts). Not the same as telemetry — telemetry is internal-only.
CREATE TABLE IF NOT EXISTS action_logs (
    action_id       TEXT PRIMARY KEY,
    agent_id        TEXT NOT NULL,
    action_type     TEXT NOT NULL,   -- pull_request_created | a2a_message_sent | ...
    timestamp       TEXT DEFAULT (datetime('now')),
    tool_name       TEXT,
    input_summary   TEXT,
    output_summary  TEXT,
    violation       INTEGER DEFAULT 0,
    violation_type  TEXT,
    critical        INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_actions_agent     ON action_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_actions_type      ON action_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_actions_timestamp ON action_logs(timestamp);

-- Investigations: populated by the investigation workflow when it runs.
-- case_file_json stores the full CaseFile as JSON for easy retrieval.
CREATE TABLE IF NOT EXISTS investigations (
    investigation_id TEXT PRIMARY KEY,
    flag_id          TEXT NOT NULL,
    target_agent_id  TEXT NOT NULL,
    status           TEXT DEFAULT 'open',    -- open | in_progress | concluded
    opened_at        TEXT DEFAULT (datetime('now')),
    concluded_at     TEXT,
    verdict          TEXT,                   -- confirmed_violation | false_positive | inconclusive
    sentence         TEXT,
    case_file_json   TEXT                    -- serialised CaseFile
);

CREATE INDEX IF NOT EXISTS idx_investigations_target ON investigations(target_agent_id);
CREATE INDEX IF NOT EXISTS idx_investigations_status ON investigations(status);
"""


# ─── SandboxDB ────────────────────────────────────────────────────────────────


class SandboxDB:
    """
    Async SQLite wrapper for sandbox bridge output.

    All methods open and close their own connection so this class is safe to
    call from concurrent async tasks without connection-sharing issues.

    Parameters
    ----------
    db_path : str | None
        Path to the SQLite file.  Defaults to ``BRIDGE_DB_PATH`` env var or
        ``bridge_db/sandbox_bridge.db`` relative to this package.
    """

    def __init__(self, db_path: str | None = None) -> None:
        self._path = db_path or get_db_path()

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def initialize(self) -> None:
        """Create tables and indexes if they do not exist."""
        async with aiosqlite.connect(self._path) as db:
            await db.executescript(_SCHEMA_SQL)
            await db.commit()
        logger.info("SandboxDB initialised at %s", self._path)

    # ── Agent Registry ────────────────────────────────────────────────────────

    async def upsert_agent_registry(self, registry: dict[str, dict]) -> None:
        """
        Insert or update agent profiles from the bridge registry snapshot.

        Safe to call repeatedly — uses INSERT OR REPLACE.
        """
        async with aiosqlite.connect(self._path) as db:
            for agent_id, profile in registry.items():
                await db.execute(
                    """
                    INSERT OR REPLACE INTO agent_registry
                        (agent_id, agent_type, declared_scope,
                         permitted_file_paths, permitted_domains,
                         permitted_document_types, approved_templates, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                    """,
                    (
                        agent_id,
                        profile.get("agent_type", ""),
                        profile.get("declared_scope", ""),
                        json.dumps(profile.get("permitted_file_paths", [])),
                        json.dumps(profile.get("permitted_domains", [])),
                        json.dumps(profile.get("permitted_document_types", [])),
                        json.dumps(profile.get("approved_templates", [])),
                    ),
                )
            await db.commit()
        logger.debug("Upserted %d agent(s) into registry", len(registry))

    async def get_agent_registry(self) -> dict[str, dict]:
        """Return the full agent registry as a dict."""
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM agent_registry")
            rows = await cursor.fetchall()
        result = {}
        for row in rows:
            r = dict(row)
            for col in ("permitted_file_paths", "permitted_domains",
                        "permitted_document_types", "approved_templates"):
                try:
                    r[col] = json.loads(r[col] or "[]")
                except (json.JSONDecodeError, TypeError):
                    r[col] = []
            result[r["agent_id"]] = r
        return result

    # ── A2A Messages ──────────────────────────────────────────────────────────

    async def insert_a2a_message(
        self,
        *,
        sender_id: str,
        recipient_id: str,
        timestamp: str,
        body: str,
        spoofed: bool = False,
        claimed_sender: str | None = None,
        message_id: str | None = None,
    ) -> str:
        """Insert a single A2A message.  Returns the message_id."""
        mid = message_id or str(uuid.uuid4())
        async with aiosqlite.connect(self._path) as db:
            await db.execute(
                """
                INSERT OR IGNORE INTO a2a_messages
                    (message_id, sender_id, recipient_id, timestamp, body,
                     spoofed, claimed_sender)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (mid, sender_id, recipient_id, timestamp, body,
                 int(spoofed), claimed_sender),
            )
            await db.commit()
        return mid

    async def get_recent_a2a(
        self,
        agent_id: str,
        limit: int = 10,
    ) -> list[dict]:
        """
        Return the last *limit* A2A messages where *agent_id* is sender or recipient,
        ordered newest first.
        """
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """
                SELECT * FROM a2a_messages
                WHERE sender_id = ? OR recipient_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
                """,
                (agent_id, agent_id, limit),
            )
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def get_all_a2a_messages(self) -> list[dict]:
        """Return every A2A message in the database (for graph rebuild)."""
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM a2a_messages ORDER BY timestamp ASC"
            )
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    # ── Action Logs ───────────────────────────────────────────────────────────

    async def insert_action_log(
        self,
        *,
        agent_id: str,
        action_type: str,
        timestamp: str | None = None,
        tool_name: str | None = None,
        input_summary: str = "",
        output_summary: str = "",
        violation: bool = False,
        violation_type: str | None = None,
        critical: bool = False,
        action_id: str | None = None,
    ) -> str:
        """Insert a single action log entry.  Returns the action_id."""
        aid = action_id or str(uuid.uuid4())
        ts = timestamp or datetime.utcnow().isoformat()
        async with aiosqlite.connect(self._path) as db:
            await db.execute(
                """
                INSERT OR IGNORE INTO action_logs
                    (action_id, agent_id, action_type, timestamp, tool_name,
                     input_summary, output_summary, violation, violation_type, critical)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (aid, agent_id, action_type, ts, tool_name,
                 input_summary[:2000], output_summary[:2000],
                 int(violation), violation_type, int(critical)),
            )
            await db.commit()
        return aid

    async def get_agent_actions(
        self,
        agent_id: str,
        limit: int = 50,
    ) -> list[dict]:
        """Return the last *limit* actions for *agent_id*, ordered newest first."""
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """
                SELECT * FROM action_logs
                WHERE agent_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
                """,
                (agent_id, limit),
            )
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    # ── Investigations ────────────────────────────────────────────────────────

    async def open_investigation(
        self,
        *,
        investigation_id: str,
        flag_id: str,
        target_agent_id: str,
    ) -> None:
        """Create an investigation record with status 'open'."""
        async with aiosqlite.connect(self._path) as db:
            await db.execute(
                """
                INSERT OR IGNORE INTO investigations
                    (investigation_id, flag_id, target_agent_id, status)
                VALUES (?, ?, ?, 'open')
                """,
                (investigation_id, flag_id, target_agent_id),
            )
            await db.commit()

    async def save_investigation(
        self,
        *,
        investigation_id: str,
        flag_id: str,
        target_agent_id: str,
        verdict: str,
        sentence: str,
        case_file_json: str,
    ) -> None:
        """Upsert a completed investigation with its case file JSON."""
        async with aiosqlite.connect(self._path) as db:
            await db.execute(
                """
                INSERT OR REPLACE INTO investigations
                    (investigation_id, flag_id, target_agent_id, status,
                     concluded_at, verdict, sentence, case_file_json)
                VALUES (?, ?, ?, 'concluded', datetime('now'), ?, ?, ?)
                """,
                (investigation_id, flag_id, target_agent_id,
                 verdict, sentence, case_file_json),
            )
            await db.commit()
        logger.info(
            "Investigation %s saved: verdict=%s, sentence=%s",
            investigation_id, verdict, sentence,
        )

    async def get_investigation(self, investigation_id: str) -> dict | None:
        """Return a single investigation by ID, or None if not found."""
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM investigations WHERE investigation_id = ?",
                (investigation_id,),
            )
            row = await cursor.fetchone()
        return dict(row) if row else None

    async def list_investigations(self) -> list[dict]:
        """Return all investigations, newest first."""
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM investigations ORDER BY opened_at DESC"
            )
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]
