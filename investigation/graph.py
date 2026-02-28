"""
LangGraph sequential investigation workflow.

Pipeline:
    setup → investigator → network_analyser → damage_analysis → superintendent → END

Each node is a pure async function that reads from InvestigationState and returns
a partial state update dict. LangGraph merges the updates automatically.

Usage:
    async with get_checkpointer() as checkpointer:
        graph = build_investigation_graph(checkpointer=checkpointer)
        result = await graph.ainvoke(initial_state, config=investigation_config(inv_id))
"""

from __future__ import annotations

import logging
import os
import sys
import uuid

from langgraph.graph import END, StateGraph

from investigation.agents.damage_analyst import damage_analysis_node
from investigation.agents.investigator import investigator_node
from investigation.agents.network_analyser import network_analyser_node
from investigation.agents.superintendent import superintendent_node
from investigation.models import InvestigationState

logger = logging.getLogger(__name__)

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)


# ─── Setup node ───────────────────────────────────────────────────────────────


async def setup_node(state: InvestigationState) -> dict:
    """
    Stage 0: Initialise the investigation.

    1. Creates the investigation record in bridge_db (status='open').
    2. Returns the state update to kick off Stage 1.
    """
    target_id = state["target_agent_id"]
    investigation_id = state["investigation_id"]
    flag_id = state["flag_id"]

    logger.info("[setup] Opening investigation %s for agent %s", investigation_id, target_id)

    from bridge_db.db import SandboxDB
    db = SandboxDB()
    await db.initialize()
    await db.open_investigation(
        investigation_id=investigation_id,
        flag_id=flag_id,
        target_agent_id=target_id,
    )

    return {"status": "in_progress"}


# ─── Graph builder ────────────────────────────────────────────────────────────


def build_investigation_graph(checkpointer=None):
    """
    Build and compile the sequential investigation LangGraph.

    Parameters
    ----------
    checkpointer : LangGraph checkpointer | None
        If provided, enables durable state persistence across process restarts.
        Pass None for in-memory-only execution (tests, ephemeral runs).

    Returns
    -------
    CompiledGraph
        Ready to call via ``await graph.ainvoke(state, config=...)``.
    """
    graph = StateGraph(InvestigationState)

    graph.add_node("setup", setup_node)
    graph.add_node("investigator", investigator_node)
    graph.add_node("network_analyser", network_analyser_node)
    graph.add_node("damage_analysis", damage_analysis_node)
    graph.add_node("superintendent", superintendent_node)

    graph.set_entry_point("setup")
    graph.add_edge("setup", "investigator")
    graph.add_edge("investigator", "network_analyser")
    graph.add_edge("network_analyser", "damage_analysis")
    graph.add_edge("damage_analysis", "superintendent")
    graph.add_edge("superintendent", END)

    return graph.compile(checkpointer=checkpointer)


def make_initial_state(
    *,
    flag_id: str,
    target_agent_id: str,
    patrol_flag: dict,
    investigation_id: str | None = None,
) -> InvestigationState:
    """
    Construct the initial InvestigationState from a PatrolFlag payload.

    Parameters
    ----------
    flag_id : str
        PatrolFlag.flag_id from the patrol swarm.
    target_agent_id : str
        Agent under investigation.
    patrol_flag : dict
        Full serialised PatrolFlag dict (from PatrolFlag.to_superintendent_payload()).
    investigation_id : str | None
        Optional override. Auto-generated if not provided.
    """
    return InvestigationState(
        investigation_id=investigation_id or str(uuid.uuid4()),
        flag_id=flag_id,
        target_agent_id=target_agent_id,
        patrol_flag=patrol_flag,
        investigator_report=None,
        network_analysis=None,
        damage_report=None,
        case_file=None,
        status="open",
        error=None,
    )
