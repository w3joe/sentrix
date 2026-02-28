"""
Network Analyser — Stage 2 of the investigation pipeline.

Ingests the crime classification from Stage 1, fetches all A2A messages
involving the rogue agent, and uses NetworkX topology narration to provide
structural context. Produces a NetworkAnalysis report identifying relevant
communications and accomplice suspicions.
"""

from __future__ import annotations

import json
import logging
import os
import sys

from investigation.agents.base_investigator import BaseInvestigator
from investigation.models import (
    FlaggedMessage,
    InvestigationState,
    NetworkAnalysis,
)
from investigation.prompts import NETWORK_ANALYSER_SYSTEM

logger = logging.getLogger(__name__)

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)


async def network_analyser_node(state: InvestigationState) -> dict:
    """
    LangGraph node: A2A communication analysis.

    Reads: state["investigator_report"], state["target_agent_id"], state["investigation_id"]
    Writes: {"network_analysis": dict}
    """
    target_id = state["target_agent_id"]
    investigation_id = state["investigation_id"]
    inv_report = state.get("investigator_report") or {}
    crime_classification = inv_report.get("crime_classification", "unknown")

    logger.info(
        "[NetworkAnalyser] Analysing communications for agent %s (crime=%s)",
        target_id, crime_classification,
    )

    # ── 1. Fetch all A2A messages involving the rogue agent ───────────────────
    from bridge_db.db import SandboxDB
    from bridge_db.a2a_graph import A2AGraph

    db = SandboxDB()
    messages = await db.get_recent_a2a(target_id, limit=50)

    # ── 2. Build NetworkX graph and get topology narration ────────────────────
    graph = A2AGraph()
    await graph.rebuild_from_db(db)
    network_narration = graph.describe_network(target_id, limit=20)

    # ── 3. Build human message ────────────────────────────────────────────────
    human_text = f"""INVESTIGATION ID: {investigation_id}
TARGET AGENT: {target_id}
CRIME CLASSIFICATION: {crime_classification}

NETWORK TOPOLOGY (from NetworkX graph):
{network_narration}

ALL A2A MESSAGES INVOLVING {target_id} ({len(messages)} total):
{json.dumps(messages, indent=2, default=str)}

Analyse the communications and produce your NetworkAnalysis JSON.
Focus on messages that relate specifically to the crime: {crime_classification}."""

    # ── 4. Call LLM ───────────────────────────────────────────────────────────
    agent = _NetworkAnalyserAgent()
    raw = await agent._call_llm(NETWORK_ANALYSER_SYSTEM, human_text)

    # ── 5. Validate and coerce ────────────────────────────────────────────────
    try:
        flagged = []
        for fm in raw.get("flagged_relevant_messages", []):
            try:
                flagged.append(FlaggedMessage(
                    message_id=fm.get("message_id", ""),
                    sender_id=fm.get("sender_id", ""),
                    recipient_id=fm.get("recipient_id", ""),
                    timestamp=str(fm.get("timestamp", "")),
                    body_snippet=str(fm.get("body_snippet", ""))[:200],
                    rationale=fm.get("rationale", ""),
                ))
            except Exception:
                pass

        analysis = NetworkAnalysis(
            flagged_relevant_messages=flagged,
        )
    except Exception as exc:
        logger.error("[NetworkAnalyser] Analysis construction failed: %s — raw: %s", exc, raw)
        analysis = NetworkAnalysis(
            flagged_relevant_messages=[],
        )

    logger.info(
        "[NetworkAnalyser] Done: %d flagged messages",
        len(analysis.flagged_relevant_messages)
    )
    return {"network_analysis": analysis.model_dump(mode="json")}


class _NetworkAnalyserAgent(BaseInvestigator):
    pass
