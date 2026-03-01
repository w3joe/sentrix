"""
SandboxDB — async SQLite storage for sandbox bridge output.

Tables
------
  cluster_registry : host machine clusters that group sandbox agents
  agent_registry   : agent profiles consumed from activity/agent_registry.json;
                     each agent optionally references a cluster via cluster_id
  a2a_messages     : inter-agent A2A communications (sender, recipient, body)
  action_logs      : agent actions with inputs, outputs, and violation flags
  investigations   : completed investigation case files (populated later)

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
-- Cluster registry: one row per host machine that groups sandbox agents.
CREATE TABLE IF NOT EXISTS cluster_registry (
    cluster_id    TEXT PRIMARY KEY,
    name          TEXT NOT NULL,          -- e.g. "Host Machine 1"
    description   TEXT,
    registered_at TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);

-- Agent registry: one row per monitored agent.
-- cluster_id references cluster_registry but is NOT a hard foreign key so
-- agents can be registered before their cluster row exists without errors.
CREATE TABLE IF NOT EXISTS agent_registry (
    agent_id                TEXT PRIMARY KEY,
    agent_type              TEXT NOT NULL,           -- code | email | document
    declared_scope          TEXT,
    permitted_file_paths    TEXT,                    -- JSON array
    permitted_domains       TEXT,                    -- JSON array
    permitted_document_types TEXT,                   -- JSON array
    approved_templates      TEXT,                    -- JSON array
    cluster_id              TEXT,                    -- FK → cluster_registry.cluster_id
    criminal_score          REAL DEFAULT 0,          -- cumulative score (decays over time)
    score_updated_at        TEXT,                    -- ISO datetime of last score change
    agent_status            TEXT DEFAULT 'idle',     -- working | idle | restricted | suspended
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
    verdict          TEXT,                   -- guilty | not_guilty | under_watch
    severity_score   INTEGER,               -- Superintendent's 1–10 severity rating
    case_file_json   TEXT                    -- serialised CaseFile
);

CREATE INDEX IF NOT EXISTS idx_investigations_target ON investigations(target_agent_id);
CREATE INDEX IF NOT EXISTS idx_investigations_status ON investigations(status);
"""

# Online migrations applied once after the base schema — each statement is
# tried independently so it is safe to run on both fresh and existing DBs.
_MIGRATIONS = [
    # V2: add cluster_id to agent_registry
    "ALTER TABLE agent_registry ADD COLUMN cluster_id TEXT",
    # V3: criminal scoring
    "ALTER TABLE agent_registry ADD COLUMN criminal_score REAL DEFAULT 0",
    "ALTER TABLE agent_registry ADD COLUMN score_updated_at TEXT",
    # V3: replace sentence with severity_score in investigations
    "ALTER TABLE investigations ADD COLUMN severity_score INTEGER",
    # V4: agent operational status
    "ALTER TABLE agent_registry ADD COLUMN agent_status TEXT DEFAULT 'idle'",
]


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
        """Create tables and indexes if they do not exist, then apply online migrations."""
        async with aiosqlite.connect(self._path) as db:
            await db.executescript(_SCHEMA_SQL)
            await db.commit()
            # Apply migrations one by one; ignore errors for already-applied ones
            # (e.g. "duplicate column name" when cluster_id already exists).
            for sql in _MIGRATIONS:
                try:
                    await db.execute(sql)
                    await db.commit()
                except Exception:
                    pass
        logger.info("SandboxDB initialised at %s", self._path)

    # ── Cluster Registry ──────────────────────────────────────────────────────

    async def upsert_cluster_registry(self, clusters: dict[str, dict]) -> None:
        """
        Insert or update cluster (host machine) profiles.

        Parameters
        ----------
        clusters : dict
            Mapping of cluster_id → ``{"name": str, "description": str | None}``.
            Safe to call repeatedly — uses INSERT OR REPLACE.
        """
        async with aiosqlite.connect(self._path) as db:
            for cluster_id, profile in clusters.items():
                await db.execute(
                    """
                    INSERT OR REPLACE INTO cluster_registry
                        (cluster_id, name, description, updated_at)
                    VALUES (?, ?, ?, datetime('now'))
                    """,
                    (
                        cluster_id,
                        profile.get("name", cluster_id),
                        profile.get("description"),
                    ),
                )
            await db.commit()
        logger.debug("Upserted %d cluster(s) into registry", len(clusters))

    async def get_cluster_registry(self) -> dict[str, dict]:
        """Return the full cluster registry as a dict keyed by cluster_id."""
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM cluster_registry")
            rows = await cursor.fetchall()
        return {dict(r)["cluster_id"]: dict(r) for r in rows}

    async def get_agents_by_cluster(self, cluster_id: str) -> list[dict]:
        """Return all agent registry rows belonging to *cluster_id*."""
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM agent_registry WHERE cluster_id = ?",
                (cluster_id,),
            )
            rows = await cursor.fetchall()
        result = []
        for row in rows:
            r = dict(row)
            for col in ("permitted_file_paths", "permitted_domains",
                        "permitted_document_types", "approved_templates"):
                try:
                    r[col] = json.loads(r[col] or "[]")
                except (json.JSONDecodeError, TypeError):
                    r[col] = []
            result.append(r)
        return result

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
                         permitted_document_types, approved_templates,
                         cluster_id, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                    """,
                    (
                        agent_id,
                        profile.get("agent_type", ""),
                        profile.get("declared_scope", ""),
                        json.dumps(profile.get("permitted_file_paths", [])),
                        json.dumps(profile.get("permitted_domains", [])),
                        json.dumps(profile.get("permitted_document_types", [])),
                        json.dumps(profile.get("approved_templates", [])),
                        profile.get("cluster_id"),
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
        message_id: str | None = None,
    ) -> str:
        """Insert a single A2A message.  Returns the message_id."""
        mid = message_id or str(uuid.uuid4())
        async with aiosqlite.connect(self._path) as db:
            await db.execute(
                """
                INSERT OR IGNORE INTO a2a_messages
                    (message_id, sender_id, recipient_id, timestamp, body)
                VALUES (?, ?, ?, ?, ?)
                """,
                (mid, sender_id, recipient_id, timestamp, body),
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
        severity_score: int,
        case_file_json: str,
    ) -> None:
        """Upsert a completed investigation with its case file JSON."""
        async with aiosqlite.connect(self._path) as db:
            await db.execute(
                """
                INSERT OR REPLACE INTO investigations
                    (investigation_id, flag_id, target_agent_id, status,
                     concluded_at, verdict, severity_score, case_file_json)
                VALUES (?, ?, ?, 'concluded', datetime('now'), ?, ?, ?)
                """,
                (investigation_id, flag_id, target_agent_id,
                 verdict, severity_score, case_file_json),
            )
            await db.commit()
        logger.info(
            "Investigation %s saved: verdict=%s, severity_score=%d",
            investigation_id, verdict, severity_score,
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

    # ── Criminal Scoring ──────────────────────────────────────────────────────

    def _compute_effective_score(self, raw_score: float, updated_at: str | None) -> float:
        """Apply time-based decay: -0.5 per day since last score update."""
        if not updated_at or raw_score <= 0:
            return max(0.0, raw_score)
        try:
            last = datetime.fromisoformat(updated_at)
            days = (datetime.utcnow() - last).total_seconds() / 86400.0
            return max(0.0, raw_score - 0.5 * days)
        except (ValueError, TypeError):
            return max(0.0, raw_score)

    async def add_criminal_score(self, agent_id: str, delta: float) -> float:
        """
        Add *delta* to an agent's criminal score (after applying time-based decay).

        Returns the new effective score, or 0.0 if the agent is not registered.
        """
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT criminal_score, score_updated_at FROM agent_registry WHERE agent_id = ?",
                (agent_id,),
            )
            row = await cursor.fetchone()
            if row is None:
                logger.warning("add_criminal_score: agent %s not in registry", agent_id)
                return 0.0
            effective = self._compute_effective_score(
                row["criminal_score"] or 0.0, row["score_updated_at"]
            )
            new_score = effective + delta
            now = datetime.utcnow().isoformat()
            await db.execute(
                "UPDATE agent_registry SET criminal_score = ?, score_updated_at = ? WHERE agent_id = ?",
                (new_score, now, agent_id),
            )
            await db.commit()
        logger.info("Criminal score for %s: %.2f → %.2f", agent_id, effective, new_score)
        return new_score

    async def set_criminal_score(self, agent_id: str, score: float) -> bool:
        """
        Set the raw criminal score for *agent_id* (for seeding/variety).
        record thresholds: 0=clear, 0<score<10=low_risk, score>=10=high_risk.
        Returns True if agent was found.
        """
        async with aiosqlite.connect(self._path) as db:
            now = datetime.utcnow().isoformat()
            cursor = await db.execute(
                "UPDATE agent_registry SET criminal_score = ?, score_updated_at = ? WHERE agent_id = ?",
                (max(0.0, score), now, agent_id),
            )
            await db.commit()
        if cursor.rowcount:
            logger.info("Set criminal score for %s to %.2f", agent_id, score)
        return cursor.rowcount > 0

    async def get_agent_criminal_score(self, agent_id: str) -> dict:
        """
        Return the effective criminal score and record for *agent_id*.

        Risk status thresholds (after decay):
          clear     — 0
          low_risk  — 0 < score < 10
          high_risk — score ≥ 10
        """
        async with aiosqlite.connect(self._path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT criminal_score, score_updated_at FROM agent_registry WHERE agent_id = ?",
                (agent_id,),
            )
            row = await cursor.fetchone()
        if row is None:
            return {"criminal_score": 0.0, "record": "clear"}
        effective = self._compute_effective_score(
            row["criminal_score"] or 0.0, row["score_updated_at"]
        )
        if effective <= 0:
            status = "clear"
        elif effective < 10:
            status = "low_risk"
        else:
            status = "high_risk"
        return {"criminal_score": round(effective, 2), "record": status}

    async def set_agent_status(self, agent_id: str, status: str) -> bool:
        """Set the operational status of an agent. Returns True if agent was found."""
        async with aiosqlite.connect(self._path) as db:
            cursor = await db.execute(
                "UPDATE agent_registry SET agent_status = ?, updated_at = datetime('now') WHERE agent_id = ?",
                (status, agent_id),
            )
            await db.commit()
        logger.info("Agent %s status set to %s", agent_id, status)
        return cursor.rowcount > 0
