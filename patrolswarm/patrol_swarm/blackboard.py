"""
ThreatBlackboard — the shared swarm state as a LangGraph TypedDict.

This IS the LangGraph graph state. Every node receives the full blackboard,
performs its work on its domain slice, and returns a partial update dict.

Thread-safety note: LangGraph handles state merging between concurrent nodes
via its reducer/merge semantics. For dicts we use a custom merge reducer so
each patrol agent can write its signals without stepping on the others.
"""

from __future__ import annotations

from typing import Annotated, Any

from langgraph.graph import add_messages  # noqa: F401  (may be used in subgraphs)


def _merge_dicts(a: dict, b: dict) -> dict:
    """Reducer: merge two dicts, concatenating list values under the same key."""
    result = dict(a)
    for k, v in b.items():
        if k in result and isinstance(result[k], list) and isinstance(v, list):
            result[k] = result[k] + v
        else:
            result[k] = v
    return result


def _merge_pheromone(a: dict, b: dict) -> dict:
    """Reducer: merge two pheromone maps by taking the max value per key.

    All three parallel patrol nodes may return a pheromone_map update in the
    same LangGraph step. With domain matching, each target is written by at most
    one domain node — but LangGraph still requires a reducer for concurrent keys.
    max() preserves the highest deposit when multiple nodes touch the same target.
    """
    result = dict(a)
    for k, v in b.items():
        result[k] = max(result.get(k, 0.0), float(v))
    return result


def _merge_lists(a: list, b: list) -> list:
    """Reducer: concatenate two lists (used for patrol_flags accumulator)."""
    return a + b


class ThreatBlackboard(dict):
    """
    LangGraph-compatible TypedDict for the swarm blackboard.

    Using a plain TypedDict here; LangGraph's StateGraph will manage
    state threading. Annotated fields with reducers allow concurrent
    patrol agent nodes to write without conflicts.

    Fields
    ------
    threat_signals : dict
        agent_id → list[ThreatSignal.model_dump()]
        Accumulated partial observations from all patrol agents.

    pheromone_map : dict
        agent_id → float
        Decaying attention weights. Deposited by patrol agents on detection;
        globally decayed by orchestrator each sweep.

    consensus_buffer : dict
        agent_id → list[ViolationVote.model_dump()]
        Formal votes awaiting quorum adjudication.

    scan_history : dict
        agent_id → list[scan_record]
        Ring buffer of recent scans for delta analysis.

    current_scan_assignments : dict
        agent_id → list[str]   (patrol agent names assigned this cycle)

    current_cycle : int

    patrol_flags : list
        PatrolFlag.model_dump() objects produced this cycle.

    agent_registry : dict
        agent_id → agent profile dict (passed in at graph invocation, read-only).

    pending_actions : dict
        agent_id → list of recent actions/artefacts to scan this cycle.
    """

    pass


# ─── Typed schema for StateGraph ──────────────────────────────────────────────
from typing import TypedDict  # noqa: E402


class BlackboardState(TypedDict, total=False):
    """Typed schema consumed by langgraph.graph.StateGraph(BlackboardState)."""

    # Core swarm state (persisted across cycles)
    threat_signals: Annotated[dict, _merge_dicts]
    pheromone_map: Annotated[dict, _merge_pheromone]
    consensus_buffer: Annotated[dict, _merge_dicts]
    scan_history: dict

    # Per-cycle working state (reset each cycle by orchestrator_assign)
    current_scan_assignments: dict
    current_cycle: int
    patrol_flags: Annotated[list, _merge_lists]

    # Input context (set once at graph invocation)
    agent_registry: dict
    pending_actions: dict

    # Sweep-level diagnostics
    sweep_results: Annotated[list, _merge_lists]
