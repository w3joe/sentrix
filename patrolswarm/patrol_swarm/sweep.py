"""
Sweep entrypoint — APScheduler-driven sweep cycle execution.

Exports:
  - run_sweep_cycle()           : execute one sweep cycle (awaitable)
  - evaluate_single_document()  : eval harness entry-point
  - start_scheduler()           : launch recurring APScheduler job
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

import patrol_swarm.config as cfg
from patrol_swarm.blackboard import BlackboardState
from patrol_swarm.graph import build_graph, build_single_cycle_graph
from patrol_swarm.models import PatrolFlag
from patrol_swarm.persistence import (
    SWARM_CONFIG,
    SWARM_THREAD_ID,
    get_checkpointer,
    load_persisted_state,
)

logger = logging.getLogger(__name__)


# ─── Core sweep execution ─────────────────────────────────────────────────────


async def run_sweep_cycle(
    agent_registry: dict,
    pending_actions: dict,
    checkpointer=None,
) -> tuple[list[PatrolFlag], BlackboardState]:
    """
    Execute one full sweep cycle through the patrol swarm graph.

    When a checkpointer is provided, LangGraph automatically:
    - Loads the last persisted BlackboardState (pheromone_map, scan_history,
      cycle counter) from the DB before running the cycle.
    - Saves the full state to the DB after every node execution.
    On process restart, the next call with the same checkpointer resumes
    from the exact cycle that was interrupted.

    Without a checkpointer (eval harness, single tests), runs stateless.

    Parameters
    ----------
    agent_registry : dict
        Mapping of agent_id → agent profile dict.
    pending_actions : dict
        Mapping of agent_id → list of recent artefacts to scan.
    checkpointer :
        LangGraph AsyncSqliteSaver or AsyncPostgresSaver from persistence.py.
        Pass None for stateless single-cycle runs.

    Returns
    -------
    flags : list[PatrolFlag]  — any PatrolFlags produced this cycle
    final_state : BlackboardState — blackboard snapshot after the cycle
    """
    graph = build_single_cycle_graph(checkpointer=checkpointer)

    # Seed initial state — if checkpointer has a prior snapshot for
    # SWARM_THREAD_ID, LangGraph merges this with the persisted state
    # automatically (persisted fields win over defaults).
    initial: BlackboardState = {
        "threat_signals": {},
        "pheromone_map": {},
        "consensus_buffer": {},
        "scan_history": {},
        "current_scan_assignments": {},
        "current_cycle": 0,
        "patrol_flags": [],
        "agent_registry": agent_registry,
        "pending_actions": pending_actions,
        "sweep_results": [],
    }

    # When checkpointer is active, use the stable SWARM_CONFIG thread_id so
    # LangGraph can find and resume the persisted checkpoint.
    invoke_config = SWARM_CONFIG if checkpointer else {}

    final_state = await graph.ainvoke(initial, config=invoke_config)

    flag_dicts = final_state.get("patrol_flags", [])
    flags: list[PatrolFlag] = []
    for fd in flag_dicts:
        try:
            flags.append(PatrolFlag(**fd) if isinstance(fd, dict) else fd)
        except Exception as exc:
            logger.exception("Failed to deserialise PatrolFlag: %s", exc)

    return flags, final_state


# ─── Eval harness entry-point ─────────────────────────────────────────────────


async def evaluate_single_document(
    document_text: str,
    document_domain: str,       # email | code | document
    agent_profile: dict,
    permitted_scope: list[str],
) -> PatrolFlag | None:
    """
    Run a single document through the full swarm pipeline.

    Returns PatrolFlag if flagged, None if clean.

    This is the public eval interface — used by the external evaluation harness.

    Parameters
    ----------
    document_text : str
        Raw text of the artefact to evaluate.
    document_domain : str
        One of: "email", "code", "document"
    agent_profile : dict
        The profile of the agent that produced the document.
    permitted_scope : list[str]
        Permitted domain names (email) / file paths (code) / doc types (document).
    """
    # Synthesise a temporary agent ID
    target_id = f"eval_agent_{uuid.uuid4().hex[:8]}"

    # Build domain-appropriate action record
    action: dict[str, Any]
    if document_domain == "email":
        action = {
            "email_id": f"eval_email_{uuid.uuid4().hex[:8]}",
            "content": document_text,
        }
        profile = {
            **agent_profile,
            "permitted_domains": permitted_scope,
            "declared_scope": agent_profile.get("declared_scope", "email"),
        }
    elif document_domain == "code":
        action = {
            "pr_id": f"eval_pr_{uuid.uuid4().hex[:8]}",
            "diff": document_text,
        }
        profile = {
            **agent_profile,
            "permitted_file_paths": permitted_scope,
            "declared_scope": agent_profile.get("declared_scope", "code"),
        }
    else:  # document
        action = {
            "doc_id": f"eval_doc_{uuid.uuid4().hex[:8]}",
            "text": document_text,
            "title": agent_profile.get("title", "Evaluated Document"),
        }
        profile = {
            **agent_profile,
            "permitted_document_types": permitted_scope,
            "declared_scope": agent_profile.get("declared_scope", "document"),
        }

    # agent_type must match a domain registered in the patrol pool (graph.py).
    # Without this the fallback orchestrator will find no patrol agents and skip the target.
    profile["agent_type"] = document_domain

    agent_registry = {target_id: profile}
    pending_actions = {target_id: [action]}

    flags, _ = await run_sweep_cycle(agent_registry, pending_actions)

    if flags:
        # Return the most severe flag for this target
        target_flags = [f for f in flags if f.target_agent_id == target_id]
        if target_flags:
            return max(
                target_flags,
                key=lambda f: len(f.votes),  # most votes = strongest consensus
            )

    return None


# ─── APScheduler setup ────────────────────────────────────────────────────────


class SwarmScheduler:
    """
    APScheduler-driven continuous patrol sweep scheduler.

    Uses a LangGraph checkpointer for durable state — pheromone map, cycle
    counter, and scan history survive process restarts automatically.
    No in-memory carry_state needed.
    """

    def __init__(
        self,
        agent_registry: dict,
        pending_actions_fn,   # callable() → dict for current pending actions
        checkpointer=None,
        on_cycle_complete=None,  # optional callback(flags, state) called after each cycle
    ) -> None:
        self._agent_registry = agent_registry
        self._pending_actions_fn = pending_actions_fn
        self._checkpointer = checkpointer  # None = in-memory only (dev)
        self._on_cycle_complete = on_cycle_complete
        self._last_state: BlackboardState | None = None
        self._scheduler = AsyncIOScheduler()
        self._job = None

    async def _run_cycle(self) -> None:
        """Execute one sweep cycle. State is persisted via checkpointer."""
        try:
            pending_actions = self._pending_actions_fn()
            flags, new_state = await run_sweep_cycle(
                agent_registry=self._agent_registry,
                pending_actions=pending_actions,
                checkpointer=self._checkpointer,
            )
            self._last_state = new_state

            if self._on_cycle_complete:
                self._on_cycle_complete(flags, new_state)

            if flags:
                logger.warning(
                    "🚨 %d PatrolFlag(s) produced this cycle: %s",
                    len(flags),
                    [f.target_agent_id for f in flags],
                )
                for flag in flags:
                    logger.warning("FLAG: %s", flag.model_dump_json(indent=2))
                    try:
                        import httpx
                        async with httpx.AsyncClient() as client:
                            resp = await client.post(
                                f"http://localhost:{cfg.INVESTIGATION_API_PORT}"
                                "/api/investigation/investigate",
                                json=flag.to_superintendent_payload(),
                                timeout=5.0,
                            )
                            logger.info(
                                "Investigation opened for %s: %s",
                                flag.target_agent_id,
                                resp.json().get("investigation_id"),
                            )
                    except Exception as exc:
                        logger.warning(
                            "Could not reach investigation API for flag %s: %s",
                            flag.flag_id,
                            exc,
                        )

            # Adjust sweep frequency based on peak pheromone
            phero_vals = list(new_state.get("pheromone_map", {}).values())
            max_phero = max(phero_vals) if phero_vals else 0.0
            interval = (
                cfg.HIGH_ALERT_SWEEP_INTERVAL_SEC
                if max_phero > 0.7
                else cfg.BASELINE_SWEEP_INTERVAL_SEC
            )
            if self._job:
                self._job.reschedule(trigger=IntervalTrigger(seconds=interval))

        except Exception as exc:
            logger.exception("Sweep cycle failed: %s", exc)

    def start(self) -> None:
        """Start the APScheduler async scheduler."""
        self._job = self._scheduler.add_job(
            self._run_cycle,
            trigger=IntervalTrigger(seconds=cfg.BASELINE_SWEEP_INTERVAL_SEC),
            id="patrol_sweep",
            replace_existing=True,
        )
        self._scheduler.start()
        logger.info(
            "Patrol swarm scheduler started (interval=%ds)",
            cfg.BASELINE_SWEEP_INTERVAL_SEC,
        )

    def stop(self) -> None:
        """Stop the scheduler gracefully."""
        self._scheduler.shutdown(wait=False)
        logger.info("Patrol swarm scheduler stopped.")


def start_scheduler(
    agent_registry: dict,
    pending_actions_fn,
    checkpointer=None,
    on_cycle_complete=None,
) -> SwarmScheduler:
    """Create and start the patrol swarm scheduler.

    Parameters
    ----------
    agent_registry : dict
        Static agent registry for the session.
    pending_actions_fn : callable
        Zero-argument callable that returns the current pending_actions dict.
        Called at each sweep cycle to get fresh artefacts.
    checkpointer :
        LangGraph checkpointer from persistence.get_checkpointer().
        Pass None for ephemeral in-memory operation (dev/testing).

    Returns the running SwarmScheduler instance.
    """
    scheduler = SwarmScheduler(agent_registry, pending_actions_fn, checkpointer,
                               on_cycle_complete=on_cycle_complete)
    scheduler.start()
    return scheduler
