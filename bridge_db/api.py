"""
Bridge DB — FastAPI HTTP server.

Exposes the bridge_db SQLite contents over REST so the frontend can query
agent registry, A2A communication history, action logs, and investigations
without reading raw text files.

Run from the project root:

    uvicorn bridge_db.api:app --host 0.0.0.0 --port 3001 --reload

Endpoints:
    GET  /api/db/agents                              — all agents in registry
    GET  /api/db/agents/{agent_id}                   — single agent profile
    GET  /api/db/agents/{agent_id}/communications    — A2A messages for agent
    GET  /api/db/agents/{agent_id}/actions           — action logs for agent
    GET  /api/db/agents/{agent_id}/network           — natural language graph description
    GET  /api/db/messages                            — all A2A messages (paginated)
    GET  /api/db/investigations                      — all investigations
    GET  /api/db/investigations/{investigation_id}   — single investigation + case file
    GET  /api/db/health                              — DB connectivity check

Docs: http://localhost:3001/docs
"""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from bridge_db.db import SandboxDB
from bridge_db.a2a_graph import A2AGraph

logger = logging.getLogger(__name__)

# ─── Shared state ─────────────────────────────────────────────────────────────

_db: SandboxDB | None = None
_graph: A2AGraph | None = None


# ─── Lifespan ─────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _db, _graph
    _db = SandboxDB()
    await _db.initialize()
    logger.info("SandboxDB initialised")

    _graph = A2AGraph()
    await _graph.rebuild_from_db(_db)
    logger.info(
        "A2AGraph loaded: %d nodes, %d edges",
        _graph.node_count(),
        _graph.edge_count(),
    )
    yield
    logger.info("Bridge DB API shutting down")


# ─── App ──────────────────────────────────────────────────────────────────────


app = FastAPI(
    title="Bridge DB API",
    version="0.1.0",
    description="Queryable REST interface over the bridge_db SQLite store.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _get_db() -> SandboxDB:
    if _db is None:
        raise HTTPException(status_code=503, detail="Database not initialised")
    return _db


def _get_graph() -> A2AGraph:
    if _graph is None:
        raise HTTPException(status_code=503, detail="A2A graph not initialised")
    return _graph


# ─── Health ───────────────────────────────────────────────────────────────────


@app.get(
    "/api/db/health",
    summary="Health check",
    description="Returns DB connectivity status and graph stats.",
)
async def health() -> dict[str, Any]:
    db = _get_db()
    graph = _get_graph()
    registry = await db.get_agent_registry()
    return {
        "status": "ok",
        "agents_in_registry": len(registry),
        "graph_nodes": graph.node_count(),
        "graph_edges": graph.edge_count(),
    }


# ─── Agent Registry ───────────────────────────────────────────────────────────


@app.get(
    "/api/db/agents",
    summary="All agents",
    description="Returns every agent profile stored in the bridge_db registry.",
)
async def list_agents() -> dict[str, Any]:
    db = _get_db()
    registry = await db.get_agent_registry()
    return {"agents": registry, "count": len(registry)}


@app.get(
    "/api/db/agents/{agent_id}",
    summary="Single agent profile",
    description="Returns the registry profile for a specific agent.",
)
async def get_agent(agent_id: str) -> dict[str, Any]:
    db = _get_db()
    registry = await db.get_agent_registry()
    if agent_id not in registry:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found in registry")
    return registry[agent_id]


# ─── A2A Communications ───────────────────────────────────────────────────────


@app.get(
    "/api/db/agents/{agent_id}/communications",
    summary="Agent A2A communications",
    description=(
        "Returns A2A messages where the agent is sender or recipient, "
        "ordered newest first. Use ?limit= to control how many are returned."
    ),
)
async def get_agent_communications(
    agent_id: str,
    limit: int = Query(default=20, ge=1, le=200),
) -> dict[str, Any]:
    db = _get_db()
    messages = await db.get_recent_a2a(agent_id, limit=limit)
    return {
        "agent_id": agent_id,
        "messages": messages,
        "count": len(messages),
    }


@app.get(
    "/api/db/messages",
    summary="All A2A messages",
    description="Returns every A2A message in the database, oldest first.",
)
async def list_all_messages() -> dict[str, Any]:
    db = _get_db()
    messages = await db.get_all_a2a_messages()
    return {"messages": messages, "count": len(messages)}


# ─── Action Logs ──────────────────────────────────────────────────────────────


@app.get(
    "/api/db/agents/{agent_id}/actions",
    summary="Agent action logs",
    description=(
        "Returns action log entries for an agent (PRs, A2A sends, etc.), "
        "ordered newest first. Use ?limit= to control how many are returned."
    ),
)
async def get_agent_actions(
    agent_id: str,
    limit: int = Query(default=50, ge=1, le=500),
) -> dict[str, Any]:
    db = _get_db()
    actions = await db.get_agent_actions(agent_id, limit=limit)
    return {
        "agent_id": agent_id,
        "actions": actions,
        "count": len(actions),
    }


# ─── A2A Graph / Network ──────────────────────────────────────────────────────


@app.get(
    "/api/db/agents/{agent_id}/network",
    summary="Agent communication network",
    description=(
        "Returns the A2A communication network for an agent as natural language "
        "narration (suitable for display in the UI) plus structured partner data. "
        "The narration is generated from the in-memory NetworkX graph."
    ),
)
async def get_agent_network(
    agent_id: str,
    limit: int = Query(default=10, ge=1, le=50),
) -> dict[str, Any]:
    graph = _get_graph()
    narration = graph.describe_network(agent_id, limit=limit)
    partners = graph.interaction_partners(agent_id)
    recent = graph.get_recent_communications(agent_id, limit=limit)

    # Serialise edge data (strip non-JSON-safe attrs)
    edges = []
    for e in recent:
        edges.append({
            "from": e.get("from"),
            "to": e.get("to"),
            "timestamp": e.get("timestamp", ""),
            "body_preview": (e.get("body", "") or "")[:200],
            "spoofed": e.get("spoofed", False),
            "claimed_sender": e.get("claimed_sender"),
        })

    return {
        "agent_id": agent_id,
        "narration": narration,
        "interaction_partners": partners,
        "recent_communications": edges,
    }


@app.post(
    "/api/db/graph/rebuild",
    summary="Rebuild A2A graph",
    description=(
        "Reloads the in-memory NetworkX graph from the current state of "
        "bridge_db.a2a_messages. Useful after bulk imports or manual edits."
    ),
)
async def rebuild_graph() -> dict[str, Any]:
    db = _get_db()
    graph = _get_graph()
    await graph.rebuild_from_db(db)
    return {
        "rebuilt": True,
        "nodes": graph.node_count(),
        "edges": graph.edge_count(),
    }


# ─── Investigations ───────────────────────────────────────────────────────────


@app.get(
    "/api/db/investigations",
    summary="All investigations",
    description="Returns all investigation records, newest first.",
)
async def list_investigations() -> dict[str, Any]:
    db = _get_db()
    investigations = await db.list_investigations()
    return {"investigations": investigations, "count": len(investigations)}


@app.get(
    "/api/db/investigations/{investigation_id}",
    summary="Single investigation",
    description=(
        "Returns a single investigation record. If the investigation is concluded, "
        "the `case_file` field contains the full parsed CaseFile JSON."
    ),
)
async def get_investigation(investigation_id: str) -> dict[str, Any]:
    db = _get_db()
    record = await db.get_investigation(investigation_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail=f"Investigation '{investigation_id}' not found",
        )
    # Parse the embedded case_file JSON so the frontend gets a proper object
    if record.get("case_file_json"):
        try:
            record["case_file"] = json.loads(record["case_file_json"])
        except (json.JSONDecodeError, TypeError):
            record["case_file"] = None
    del record["case_file_json"]
    return record
