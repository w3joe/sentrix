"""
Patrol Swarm — FastAPI HTTP server.

Exposes swarm state (patrol pool, assignments, flags, pheromones, sweep history)
over a REST API so a localhost frontend can read live data and trigger sweeps.

Run from the patrolswarm/ directory:

    # Auto-detect most recent sandbox run:
    SANDBOX_RUN=latest uvicorn patrol_swarm.api:app --port 8001 --reload

    # Explicit sandbox run path:
    SANDBOX_RUN=../sandbox_runs/sandbox_20260226_215749_16f339 uvicorn patrol_swarm.api:app --port 8001

Endpoints:
    GET  /api/swarm/status      — patrol pool, data source, current cycle, assignments
    GET  /api/swarm/flags       — all PatrolFlags produced (rolling history)
    GET  /api/swarm/pheromones  — per-agent attention/risk weights
    GET  /api/swarm/sweeps      — SweepResult metrics per cycle
    POST /api/swarm/sweep       — trigger an immediate sweep cycle
    GET  /api/swarm/stream      — SSE real-time event stream (flags, pheromones, sweeps)

Docs: http://localhost:8001/docs
"""

import asyncio
import json
import logging
import sys
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

import patrol_swarm.config as cfg
from patrol_swarm.graph import _PATROL_REGISTRY
from patrol_swarm.persistence import get_checkpointer
from patrol_swarm.sweep import SwarmScheduler

logger = logging.getLogger(__name__)

# ─── Shared in-process state ──────────────────────────────────────────────────

_scheduler: SwarmScheduler | None = None
_data_source: str = ""

# Rolling history — populated by _on_cycle_complete after each sweep
_flag_history: deque[dict] = deque(maxlen=500)
_sweep_history: deque[dict] = deque(maxlen=100)

# ─── SSE event bus ───────────────────────────────────────────────────────────
# Each connected SSE client gets its own asyncio.Queue.  The _on_cycle_complete
# callback fans events out to every subscriber queue.

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
    # Drop clients whose queues are full (they disconnected or are too slow)
    for q in stale:
        try:
            _sse_subscribers.remove(q)
        except ValueError:
            pass


def _on_cycle_complete(flags: list, state: dict) -> None:
    """Callback invoked by SwarmScheduler after every sweep cycle completes."""
    for f in flags:
        flag_dict = f.model_dump(mode="json") if hasattr(f, "model_dump") else dict(f)
        _flag_history.append(flag_dict)
        _broadcast_sse("flag", flag_dict)

    for sr in state.get("sweep_results", []):
        _sweep_history.append(sr)

    # Broadcast sweep completion with latest metrics
    sweep_results = state.get("sweep_results", [])
    latest_sweep = sweep_results[-1] if sweep_results else None
    if latest_sweep:
        _broadcast_sse("sweep_complete", latest_sweep)

    # Broadcast pheromone snapshot
    pheromone_map = state.get("pheromone_map", {})
    if pheromone_map:
        _broadcast_sse("pheromone_update", pheromone_map)


# ─── Sandbox run resolver ─────────────────────────────────────────────────────


def _resolve_sandbox(sandbox_run: str) -> tuple[dict, Any, str]:
    """
    Resolve SANDBOX_RUN to (agent_registry, pending_actions_fn, label).

    Returns:
        agent_registry     : dict of agent_id → profile
        pending_actions_fn : callable() → dict  (live connector or static dict)
        label              : human-readable source name for /api/swarm/status
    """
    from patrol_swarm.sandbox_bridge import SandboxLiveConnector, latest_sandbox_run

    if sandbox_run.lower() == "latest":
        package_dir = Path(__file__).resolve().parent.parent
        candidates = [
            package_dir / "sandbox_runs",
            package_dir.parent / "sandbox_runs",
            package_dir.parent / "sandbox",
        ]
        run_path = None
        for base in candidates:
            run_path = latest_sandbox_run(base)
            if run_path:
                break
        if run_path is None:
            raise RuntimeError(
                "SANDBOX_RUN=latest but no sandbox runs found. "
                "Run the sandbox first or set SANDBOX_RUN to an explicit path."
            )
    else:
        run_path = Path(sandbox_run)
        if not run_path.exists():
            raise RuntimeError(f"SANDBOX_RUN path not found: {run_path}")

    connector = SandboxLiveConnector(run_path)
    agent_registry = connector.get_agent_registry()
    label = f"sandbox:{run_path.name}"
    logger.info("Sandbox connector attached to %s (%d agents)", run_path.name, len(agent_registry))
    return agent_registry, connector.get_pending_actions, label


# ─── App lifespan ─────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the patrol swarm scheduler on startup, stop it on shutdown."""
    global _scheduler, _data_source
    logger.info("Patrol Swarm API starting on %s:%d", cfg.API_HOST, cfg.API_PORT)

    # Resolve data source — SANDBOX_RUN is required
    if not cfg.SANDBOX_RUN:
        logger.error(
            "SANDBOX_RUN env var is not set. "
            "Set it to a sandbox run directory path or 'latest'."
        )
        sys.exit(1)

    try:
        agent_registry, pending_actions_fn, _data_source = _resolve_sandbox(cfg.SANDBOX_RUN)
    except RuntimeError as exc:
        logger.error("Failed to attach sandbox connector: %s", exc)
        sys.exit(1)

    logger.info("Data source: %s | Monitored agents: %d", _data_source, len(agent_registry))

    async with get_checkpointer() as checkpointer:
        _scheduler = SwarmScheduler(
            agent_registry=agent_registry,
            pending_actions_fn=pending_actions_fn,
            checkpointer=checkpointer,
            on_cycle_complete=_on_cycle_complete,
        )
        _scheduler.start()
        logger.info("Swarm scheduler started — patrol pool: %s", list(_PATROL_REGISTRY))
        yield
        _scheduler.stop()
        logger.info("Swarm scheduler stopped.")


# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="Patrol Swarm API",
    version="0.1.0",
    description="Live swarm state and control endpoints for the SWAT Patrol Swarm.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _require_scheduler() -> SwarmScheduler:
    if _scheduler is None:
        raise HTTPException(status_code=503, detail="Swarm scheduler not initialised")
    return _scheduler


# ─── Endpoints ────────────────────────────────────────────────────────────────


@app.get(
    "/api/swarm/status",
    summary="Swarm status",
    description=(
        "Returns the patrol agent pool, current sweep cycle number, "
        "current scan assignments (which patrol agent monitors which target), "
        "monitored agent registry, and active data source."
    ),
)
async def get_status() -> dict[str, Any]:
    scheduler = _require_scheduler()
    state = scheduler._last_state or {}
    return {
        "data_source": _data_source,
        "patrol_pool": _PATROL_REGISTRY,
        "current_cycle": state.get("current_cycle", 0),
        "current_assignments": state.get("current_scan_assignments", {}),
        "monitored_agents": state.get("agent_registry", {}),
        "scheduler_running": scheduler._scheduler.running,
    }


@app.get(
    "/api/swarm/flags",
    summary="Patrol flags",
    description=(
        "Rolling history of all PatrolFlags produced across sweep cycles "
        "(up to the last 500). Each flag represents a quorum referral — "
        "a target agent that reached the investigation threshold."
    ),
)
async def get_flags() -> list[dict]:
    return list(_flag_history)


@app.get(
    "/api/swarm/pheromones",
    summary="Pheromone map",
    description=(
        "Per-agent pheromone levels (0.0–1.0+). Higher values mean the swarm "
        "is paying more attention to that agent. Decays at 0.85× per cycle; "
        "increases by 0.4 on each non-CLEAN vote."
    ),
)
async def get_pheromones() -> dict[str, float]:
    scheduler = _require_scheduler()
    state = scheduler._last_state or {}
    return state.get("pheromone_map", {})


@app.get(
    "/api/swarm/sweeps",
    summary="Sweep history",
    description=(
        "Rolling history of SweepResult metrics for each completed cycle "
        "(up to the last 100). Includes cycle number, agents scanned, "
        "signals/votes/flags produced, and wall-clock duration."
    ),
)
async def get_sweeps() -> list[dict]:
    return list(_sweep_history)


@app.post(
    "/api/swarm/sweep",
    summary="Trigger sweep",
    description=(
        "Immediately triggers one sweep cycle outside of the regular schedule. "
        "The cycle runs asynchronously — the response returns instantly and "
        "results appear in /api/swarm/flags and /api/swarm/sweeps once complete."
    ),
)
async def trigger_sweep() -> dict[str, Any]:
    scheduler = _require_scheduler()
    asyncio.create_task(scheduler._run_cycle())
    return {
        "triggered": True,
        "message": "Sweep cycle triggered — results will appear in /api/swarm/flags and /api/swarm/sweeps",
        "current_cycle": (scheduler._last_state or {}).get("current_cycle", 0),
    }


# ─── SSE stream endpoint ────────────────────────────────────────────────────


@app.get(
    "/api/swarm/stream",
    summary="Real-time event stream (SSE)",
    description=(
        "Server-Sent Events stream that pushes real-time updates as they occur.\n\n"
        "**Event types:**\n"
        "- `flag` — New PatrolFlag produced (quorum referral)\n"
        "- `sweep_complete` — Sweep cycle finished with metrics\n"
        "- `pheromone_update` — Updated pheromone map after sweep\n\n"
        "Connect with `EventSource('/api/swarm/stream')` from the browser.\n"
        "A `ping` keep-alive is sent every 15 seconds."
    ),
)
async def swarm_stream(request: Request):
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
                    # Send keep-alive ping
                    yield {"event": "ping", "data": ""}
        finally:
            try:
                _sse_subscribers.remove(queue)
            except ValueError:
                pass

    return EventSourceResponse(event_generator())
