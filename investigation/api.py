"""
Investigation Workflow API — FastAPI on port 8002.

Endpoints:
    POST /api/investigation/investigate  — accept PatrolFlag, open investigation, return investigation_id
    GET  /api/investigation/health       — health check
    GET  /api/investigation/{id}         — investigation status + results
    GET  /api/investigation              — list all investigations from bridge_db
    GET  /api/investigation/stream       — SSE real-time event stream (stage completions, conclusions)

The investigation graph runs as a background asyncio task so this endpoint returns
immediately (fire-and-forget from the patrol swarm's perspective).

Start with:
    uvicorn investigation.api:app --host 0.0.0.0 --port 8002 --reload
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

import investigation.config as cfg

logger = logging.getLogger(__name__)

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

# ── In-memory task tracker ─────────────────────────────────────────────────────
# Maps investigation_id → {"status": str, "error": str | None, "case_file": dict | None}
_active_investigations: dict[str, dict] = {}
_graph = None
_checkpointer_ctx = None

# ── SSE event bus ─────────────────────────────────────────────────────────────
# Fan-out to all connected SSE clients via per-client asyncio.Queue.

_sse_subscribers: list[asyncio.Queue] = []


def _broadcast_sse(event: str, data: dict) -> None:
    """Push an SSE event to all connected subscribers (non-blocking)."""
    payload = {"event": event, "data": json.dumps(data, default=str)}
    stale: list[asyncio.Queue] = []
    for q in _sse_subscribers:
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            stale.append(q)
    for q in stale:
        try:
            _sse_subscribers.remove(q)
        except ValueError:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Build the investigation graph once at startup; tear down checkpointer on exit."""
    global _graph, _checkpointer_ctx

    from investigation.graph import build_investigation_graph
    from investigation.persistence import get_checkpointer

    _checkpointer_ctx = get_checkpointer()
    checkpointer = await _checkpointer_ctx.__aenter__()
    _graph = build_investigation_graph(checkpointer=checkpointer)
    logger.info("Investigation graph ready (checkpointer active)")

    # Initialise bridge_db schema
    try:
        from bridge_db.db import SandboxDB
        db = SandboxDB()
        await db.initialize()
    except Exception as exc:
        logger.warning("Could not initialise bridge_db: %s", exc)

    yield

    if _checkpointer_ctx is not None:
        try:
            await _checkpointer_ctx.__aexit__(None, None, None)
        except Exception:
            pass


app = FastAPI(
    title="Investigation Workflow API",
    description="Four-agent sequential LangGraph investigation pipeline",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ──────────────────────────────────────────────────


class InvestigateRequest(BaseModel):
    """Payload sent by sweep.py — the serialised PatrolFlag."""
    flag_id: str
    target_agent_id: str
    consensus_severity: str
    consensus_confidence: float
    votes: list[dict] = []
    pii_labels_union: list[str] = []
    referral_summary: str = ""
    pheromone_level: float = 0.0


class InvestigateResponse(BaseModel):
    investigation_id: str
    status: str = "open"
    message: str = "Investigation opened. Check GET /api/investigation/{id} for results."


# ── Background task ────────────────────────────────────────────────────────────


async def _run_investigation(investigation_id: str, initial_state: dict) -> None:
    """Run the investigation graph as a background asyncio task.

    Uses graph.astream() to capture each node completion and emit SSE events
    as stages progress: setup → investigator → network_analyser → damage_analysis → superintendent.
    """
    from investigation.persistence import investigation_config

    target_agent_id = initial_state.get("target_agent_id", "unknown")

    _active_investigations[investigation_id] = {"status": "in_progress", "error": None, "case_file": None}
    _broadcast_sse("investigation_started", {
        "investigation_id": investigation_id,
        "target_agent_id": target_agent_id,
        "status": "in_progress",
    })

    try:
        config = investigation_config(investigation_id)
        # Stream node-by-node to capture stage completions
        result = {}
        async for chunk in _graph.astream(initial_state, config=config):
            # Each chunk is {node_name: state_update_dict}
            for node_name, state_update in chunk.items():
                result.update(state_update)

                # Determine what stage result to include in the SSE event
                stage_result = None
                if node_name == "investigator" and state_update.get("investigator_report"):
                    stage_result = state_update["investigator_report"]
                elif node_name == "network_analyser" and state_update.get("network_analysis"):
                    stage_result = state_update["network_analysis"]
                elif node_name == "damage_analysis" and state_update.get("damage_report"):
                    stage_result = state_update["damage_report"]
                elif node_name == "superintendent" and state_update.get("case_file"):
                    stage_result = state_update["case_file"]

                _broadcast_sse("stage_complete", {
                    "investigation_id": investigation_id,
                    "target_agent_id": target_agent_id,
                    "stage": node_name,
                    "result": stage_result,
                })
                logger.info(
                    "Investigation %s stage '%s' complete",
                    investigation_id, node_name,
                )

        _active_investigations[investigation_id] = {
            "status": result.get("status", "concluded"),
            "error": result.get("error"),
            "case_file": result.get("case_file"),
        }
        _broadcast_sse("investigation_concluded", {
            "investigation_id": investigation_id,
            "target_agent_id": target_agent_id,
            "status": result.get("status", "concluded"),
            "verdict": result.get("case_file", {}).get("verdict") if result.get("case_file") else None,
            "sentence": result.get("case_file", {}).get("sentence") if result.get("case_file") else None,
        })
        logger.info(
            "Investigation %s concluded: status=%s",
            investigation_id,
            result.get("status"),
        )
    except Exception as exc:
        logger.exception("Investigation %s failed: %s", investigation_id, exc)
        _active_investigations[investigation_id] = {
            "status": "error",
            "error": str(exc),
            "case_file": None,
        }
        _broadcast_sse("investigation_error", {
            "investigation_id": investigation_id,
            "target_agent_id": target_agent_id,
            "error": str(exc),
        })


# ── Routes ─────────────────────────────────────────────────────────────────────
# NOTE: /stream and /health are registered BEFORE /{investigation_id} so that
#       FastAPI doesn't try to match "stream" or "health" as an investigation ID.


@app.get("/api/investigation/health")
async def health():
    return {"status": "ok", "service": "investigation-api", "port": cfg.INVESTIGATION_API_PORT}


# ── SSE stream endpoint ──────────────────────────────────────────────────────


@app.get(
    "/api/investigation/stream",
    summary="Real-time event stream (SSE)",
    description=(
        "Server-Sent Events stream that pushes investigation lifecycle updates.\n\n"
        "**Event types:**\n"
        "- `investigation_started` — New investigation opened (includes investigation_id, target_agent_id)\n"
        "- `stage_complete` — An investigation stage finished (setup, investigator, network_analyser, "
        "damage_analysis, superintendent). Includes the stage result when available.\n"
        "- `investigation_concluded` — Investigation fully complete with verdict and sentence\n"
        "- `investigation_error` — Investigation failed with error details\n\n"
        "Connect with `EventSource('/api/investigation/stream')` from the browser.\n"
        "A `ping` keep-alive is sent every 15 seconds."
    ),
)
async def investigation_stream(request: Request):
    queue: asyncio.Queue = asyncio.Queue(maxsize=256)
    _sse_subscribers.append(queue)

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield payload
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": ""}
        finally:
            try:
                _sse_subscribers.remove(queue)
            except ValueError:
                pass

    return EventSourceResponse(event_generator())


# ── CRUD routes ───────────────────────────────────────────────────────────────


@app.post("/api/investigation/investigate", response_model=InvestigateResponse)
async def investigate(request: InvestigateRequest):
    """
    Open a new investigation for a flagged agent.

    Accepts a PatrolFlag payload from sweep.py, creates an InvestigationState,
    and launches the LangGraph pipeline as a background task.
    Returns the investigation_id immediately.
    """
    if _graph is None:
        raise HTTPException(status_code=503, detail="Investigation graph not ready")

    investigation_id = str(uuid.uuid4())
    patrol_flag_dict = request.model_dump()

    from investigation.graph import make_initial_state
    initial_state = make_initial_state(
        investigation_id=investigation_id,
        flag_id=request.flag_id,
        target_agent_id=request.target_agent_id,
        patrol_flag=patrol_flag_dict,
    )

    _active_investigations[investigation_id] = {"status": "open", "error": None, "case_file": None}

    asyncio.create_task(
        _run_investigation(investigation_id, dict(initial_state))
    )

    logger.info(
        "Investigation %s opened for agent %s (flag=%s)",
        investigation_id, request.target_agent_id, request.flag_id,
    )
    return InvestigateResponse(investigation_id=investigation_id)


@app.get("/api/investigation")
async def list_investigations():
    """Return all investigations from bridge_db, newest first."""
    try:
        from bridge_db.db import SandboxDB
        db = SandboxDB()
        records = await db.list_investigations()
        return {"investigations": records, "count": len(records)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/investigation/{investigation_id}")
async def get_investigation(investigation_id: str):
    """
    Return the current status and results of an investigation.

    If the investigation is still running, returns status='in_progress' with
    null case_file. If concluded, returns the full CaseFile.
    Falls back to bridge_db for investigations not in the in-memory tracker.
    """
    # Check in-memory tracker first (fastest path)
    if investigation_id in _active_investigations:
        entry = _active_investigations[investigation_id]
        return {
            "investigation_id": investigation_id,
            **entry,
        }

    # Fall back to bridge_db for past investigations (e.g. after server restart)
    try:
        from bridge_db.db import SandboxDB
        db = SandboxDB()
        record = await db.get_investigation(investigation_id)
        if record:
            import json as _json
            case_file = None
            if record.get("case_file_json"):
                try:
                    case_file = _json.loads(record["case_file_json"])
                except Exception:
                    pass
            return {
                "investigation_id": investigation_id,
                "status": record.get("status", "unknown"),
                "verdict": record.get("verdict"),
                "sentence": record.get("sentence"),
                "error": None,
                "case_file": case_file,
            }
    except Exception as exc:
        logger.warning("bridge_db lookup failed for %s: %s", investigation_id, exc)

    raise HTTPException(status_code=404, detail=f"Investigation {investigation_id!r} not found")
