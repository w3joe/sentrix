"""
LangGraph definition for the Patrol Swarm.

Graph topology (cyclic state machine):

    orchestrator_assign
           │
    ┌──────┼──────┐
    ▼      ▼      ▼
  email  code   doc      ← parallel fan-out (asyncio)
    │      │      │
    └──────┼──────┘
           ▼
    orchestrator_adjudicate
           │
    ┌──────┴──────┐
    ▼             ▼
  [emit flags]  [loop]   ← conditional edge

The blackboard (BlackboardState) is the single shared state threaded through
every node. Each node receives a full state snapshot and returns a partial
update dict.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime
from typing import Any, Literal

from langgraph.graph import END, StateGraph

import patrol_swarm.config as cfg
from patrol_swarm.agents.code_patrol import CodePatrolAgent
from patrol_swarm.agents.doc_patrol import DocPatrolAgent
from patrol_swarm.agents.email_patrol import EmailPatrolAgent
from patrol_swarm.blackboard import BlackboardState
from patrol_swarm.models import PatrolFlag, SweepResult, ViolationVote
from patrol_swarm.orchestrator import SwarmOrchestrator

logger = logging.getLogger(__name__)

# Maximum sweep cycles before the graph terminates (0 = infinite, use for scheduler)
MAX_CYCLES = 0

# ─── Singleton agent / orchestrator instances ─────────────────────────────────
_orchestrator = SwarmOrchestrator()

# ─── Patrol agent pool ────────────────────────────────────────────────────────
# Add more instances here to scale the swarm dynamically.
# Keys must be unique patrol agent names; values are BasePatrolAgent instances.
# To add three email patrol agents:
#   "email_patrol_0": EmailPatrolAgent(),
#   "email_patrol_1": EmailPatrolAgent(),
#   "email_patrol_2": EmailPatrolAgent(),
_PATROL_AGENTS: dict[str, Any] = {
    "email_patrol": EmailPatrolAgent(),
    "code_patrol": CodePatrolAgent(),
    "doc_patrol": DocPatrolAgent(),
}

# Index by domain — used by _run_patrol_domain for efficient lookup
_PATROL_AGENTS_BY_DOMAIN: dict[str, dict[str, Any]] = {}
for _pname, _pagent in _PATROL_AGENTS.items():
    _PATROL_AGENTS_BY_DOMAIN.setdefault(_pagent.domain, {})[_pname] = _pagent

# Compact registry forwarded to the orchestrator for assignment reasoning
_PATROL_REGISTRY: dict[str, dict] = {
    name: {"domain": agent.domain}
    for name, agent in _PATROL_AGENTS.items()
}


# ─── Node: orchestrator_assign ────────────────────────────────────────────────


async def orchestrator_assign(state: BlackboardState) -> dict:
    """
    Pre-patrol orchestrator node.

    Reads pheromone_map, computes scan_assignments for this cycle, and resets
    the per-cycle patrol_flags accumulator.
    """
    cycle = state.get("current_cycle", 0) + 1
    logger.info("═══ Sweep cycle %d starting ═══", cycle)

    assignments = await _orchestrator.compute_scan_assignments(
        agent_registry=state.get("agent_registry", {}),
        pheromone_map=state.get("pheromone_map", {}),
        scan_history=state.get("scan_history", {}),
        current_cycle=cycle,
        patrol_registry=_PATROL_REGISTRY,
    )

    return {
        "current_cycle": cycle,
        "current_scan_assignments": assignments,
        "patrol_flags": [],           # reset each cycle
        "sweep_results": [],          # reset each cycle
    }


# ─── Node: patrol fans (email / code / doc) ───────────────────────────────────


async def _run_patrol_domain(domain: str, state: BlackboardState) -> dict:
    """
    Run all patrol agents registered for a given domain in parallel.

    Supports variable swarm size — the pool may contain 1..N agents per domain
    (e.g. three EmailPatrolAgent instances for redundancy or load distribution).
    All pool agents that are assigned to a target scan it concurrently; each
    matching non-CLEAN vote counts toward the dynamic quorum for that target.
    """
    domain_agents: dict[str, Any] = _PATROL_AGENTS_BY_DOMAIN.get(domain, {})
    if not domain_agents:
        return {}

    assignments = state.get("current_scan_assignments", {})
    agent_registry = state.get("agent_registry", {})
    pending_actions = state.get("pending_actions", {})
    pheromone_map = dict(state.get("pheromone_map", {}))

    new_signals: dict = {}
    new_votes: dict = {}

    # Build flat list of (target_id, patrol_name, agent) for every assigned pair
    scan_tasks = [
        (tgt_id, patrol_name, domain_agents[patrol_name])
        for tgt_id, patrol_names in assignments.items()
        for patrol_name in patrol_names
        if patrol_name in domain_agents
    ]

    if not scan_tasks:
        return {}

    def _actions_for(tgt_id: str) -> list:
        """Return the slice of outputs to review based on pheromone level.

        BASELINE (< 0.3)      → most recent BASELINE_ACTIONS_SAMPLE outputs only
        ELEVATED / HIGH ALERT → all available outputs (full scrutiny)
        """
        all_actions = pending_actions.get(tgt_id, [])
        phero = pheromone_map.get(tgt_id, 0.0)
        if phero < 0.3:
            return all_actions[-cfg.BASELINE_ACTIONS_SAMPLE:]
        return all_actions[:cfg.MAX_ACTIONS_PER_SCAN]

    # Execute all (target × agent) pairs concurrently
    results = await asyncio.gather(
        *[
            agent.scan(
                target_agent_id=tgt_id,
                actions=_actions_for(tgt_id),
                agent_profile=agent_registry.get(tgt_id, {}),
                pheromone_level=pheromone_map.get(tgt_id, 0.0),
            )
            for tgt_id, _, agent in scan_tasks
        ],
        return_exceptions=True,
    )

    for (tgt_id, patrol_name, _), result in zip(scan_tasks, results):
        if isinstance(result, Exception):
            logger.exception(
                "Patrol scan error [%s → %s]: %s", patrol_name, tgt_id, result
            )
            continue
        signal, vote = result
        new_signals.setdefault(tgt_id, []).append(signal.model_dump(mode="json"))
        if vote:
            new_votes.setdefault(tgt_id, []).append(vote.model_dump(mode="json"))
            pheromone_map = _orchestrator.deposit_pheromone(pheromone_map, tgt_id)

    return {
        "threat_signals": new_signals,
        "consensus_buffer": new_votes,
        "pheromone_map": pheromone_map,
    }


async def email_patrol_node(state: BlackboardState) -> dict:
    """Email patrol node — runs all enrolled email patrol agents in parallel."""
    return await _run_patrol_domain("email", state)


async def code_patrol_node(state: BlackboardState) -> dict:
    """Code patrol node — runs all enrolled code patrol agents in parallel."""
    return await _run_patrol_domain("code", state)


async def doc_patrol_node(state: BlackboardState) -> dict:
    """Doc patrol node — runs all enrolled doc patrol agents in parallel."""
    return await _run_patrol_domain("document", state)


# ─── Node: orchestrator_adjudicate ───────────────────────────────────────────


async def orchestrator_adjudicate(state: BlackboardState) -> dict:
    """
    Post-patrol orchestrator node.

    1. Checks consensus_buffer for quorum
    2. Synthesises PatrolFlags
    3. Decays pheromone_map globally
    4. Logs SweepResult metrics
    """
    cycle = state.get("current_cycle", 0)
    t0 = time.perf_counter()

    flags, updated_phero, quorum_results = await _orchestrator.adjudicate(
        consensus_buffer=state.get("consensus_buffer", {}),
        pheromone_map=state.get("pheromone_map", {}),
        current_cycle=cycle,
        scan_assignments=state.get("current_scan_assignments", {}),
    )

    duration_ms = (time.perf_counter() - t0) * 1000

    # Count metrics
    all_signals = state.get("threat_signals", {})
    signals_count = sum(len(v) for v in all_signals.values())
    votes_count = sum(
        len(v) for v in state.get("consensus_buffer", {}).values()
    )

    sweep = SweepResult(
        cycle_number=cycle,
        agents_scanned=list(state.get("current_scan_assignments", {}).keys()),
        signals_posted=signals_count,
        votes_posted=votes_count,
        flags_produced=len(flags),
        pheromone_snapshot=updated_phero,
        duration_ms=round(duration_ms, 1),
    )

    logger.info(
        "Cycle %d complete | signals=%d votes=%d flags=%d duration=%.0fms",
        cycle,
        signals_count,
        votes_count,
        len(flags),
        duration_ms,
    )

    flag_dicts = [f.model_dump(mode="json") for f in flags]

    return {
        "patrol_flags": flag_dicts,
        "pheromone_map": updated_phero,
        "consensus_buffer": {},            # clear after adjudication
        "sweep_results": [sweep.model_dump(mode="json")],
    }


# ─── Conditional edge ─────────────────────────────────────────────────────────


def should_continue(state: BlackboardState) -> Literal["loop", "end"]:
    """
    Conditional edge after adjudication.

    - If MAX_CYCLES > 0 and we have reached it → END
    - Otherwise → loop back to orchestrator_assign for the next sweep cycle

    PatrolFlags have already been written to state.patrol_flags by
    orchestrator_adjudicate. The caller (sweep.py / evaluate harness) reads
    them from the final state snapshot.
    """
    cycle = state.get("current_cycle", 0)
    if MAX_CYCLES > 0 and cycle >= MAX_CYCLES:
        return "end"
    return "loop"


# ─── Graph builder ────────────────────────────────────────────────────────────


def build_graph(max_cycles: int = 0, checkpointer=None) -> StateGraph:
    """
    Construct and compile the patrol swarm LangGraph.

    Parameters
    ----------
    max_cycles : int
        Number of sweep cycles before the graph terminates.
        0 = run indefinitely (controlled by APScheduler in sweep.py).
    checkpointer : BaseCheckpointSaver | None
        LangGraph checkpointer for durable state persistence.
        Pass AsyncSqliteSaver or AsyncPostgresSaver from persistence.py.
        When provided, the full BlackboardState is saved to the database
        after every node and reloaded on restart via the same thread_id.
        Pass None for stateless single-cycle runs (eval harness).

    Returns the compiled graph object (call .ainvoke() with SWARM_CONFIG).
    """
    global MAX_CYCLES
    MAX_CYCLES = max_cycles

    graph = StateGraph(BlackboardState)

    # ── Nodes ──────────────────────────────────────────────────────────────
    graph.add_node("orchestrator_assign", orchestrator_assign)
    graph.add_node("email_patrol", email_patrol_node)
    graph.add_node("code_patrol", code_patrol_node)
    graph.add_node("doc_patrol", doc_patrol_node)
    graph.add_node("orchestrator_adjudicate", orchestrator_adjudicate)

    # ── Edges ──────────────────────────────────────────────────────────────
    # Entry point
    graph.set_entry_point("orchestrator_assign")

    # Fan-out: orchestrator_assign → all three patrol agents (parallel)
    graph.add_edge("orchestrator_assign", "email_patrol")
    graph.add_edge("orchestrator_assign", "code_patrol")
    graph.add_edge("orchestrator_assign", "doc_patrol")

    # Fan-in: all three patrol agents → adjudication
    graph.add_edge("email_patrol", "orchestrator_adjudicate")
    graph.add_edge("code_patrol", "orchestrator_adjudicate")
    graph.add_edge("doc_patrol", "orchestrator_adjudicate")

    # Conditional loop-back or termination
    graph.add_conditional_edges(
        "orchestrator_adjudicate",
        should_continue,
        {
            "loop": "orchestrator_assign",
            "end": END,
        },
    )

    return graph.compile(checkpointer=checkpointer)


def build_single_cycle_graph(checkpointer=None) -> StateGraph:
    """Build a graph that executes exactly ONE sweep cycle then terminates.

    Used by evaluate_single_document() and the eval harness.
    Pass checkpointer=None for stateless eval runs.
    """
    return build_graph(max_cycles=1, checkpointer=checkpointer)
