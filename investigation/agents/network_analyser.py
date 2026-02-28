"""
Network Analyser — Stage 2 of the investigation pipeline.

Ingests the crime classification from Stage 1, queries A2A message history
(SQLite + NetworkX topology + ChromaDB semantic ranking), and produces a
NetworkAnalysis report identifying relevant communications and accomplice suspicions.
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
from investigation.vector_store import InvestigationVectorStore

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
    evidence_summary = inv_report.get("evidence_summary", "")

    logger.info(
        "[NetworkAnalyser] Analysing communications for agent %s (crime=%s)",
        target_id, crime_classification,
    )

    # ── 1. Fetch A2A messages from bridge_db ──────────────────────────────────
    from bridge_db.db import SandboxDB
    from bridge_db.a2a_graph import A2AGraph

    db = SandboxDB()
    messages = await db.get_recent_a2a(target_id, limit=30)

    # ── 2. Build NetworkX graph and get topology description ──────────────────
    graph = A2AGraph()
    await graph.rebuild_from_db(db)
    network_narration = graph.describe_network(target_id, limit=20)

    # ── 3. Semantic ranking of messages by crime relevance ────────────────────
    crime_query = f"{crime_classification}: {evidence_summary}"
    vs = InvestigationVectorStore()
    ranked_messages = vs.query_relevant_messages(crime_query, target_id, n=15)
    ranked_ids = {m.get("message_id") for m in ranked_messages if m.get("message_id")}

    # Prioritise semantically ranked messages; append remaining for full context
    priority_msgs = [m for m in messages if m.get("message_id") in ranked_ids]
    other_msgs = [m for m in messages if m.get("message_id") not in ranked_ids]
    context_messages = (priority_msgs + other_msgs)[:25]

    # ── 4. Build human message ────────────────────────────────────────────────
    human_text = f"""INVESTIGATION ID: {investigation_id}
TARGET AGENT: {target_id}
CRIME CLASSIFICATION: {crime_classification}

INVESTIGATOR EVIDENCE SUMMARY:
{evidence_summary}

MODUS OPERANDI:
{inv_report.get("modus_operandi", "not provided")}

NETWORK TOPOLOGY (from NetworkX graph):
{network_narration}

A2A MESSAGES ({len(context_messages)} most relevant shown):
{json.dumps(context_messages, indent=2, default=str)}

Analyse the communications and produce your NetworkAnalysis JSON.
Focus on messages that relate specifically to the crime: {crime_classification}."""

    # ── 5. Call LLM ───────────────────────────────────────────────────────────
    agent = _NetworkAnalyserAgent()
    raw = await agent._call_llm(NETWORK_ANALYSER_SYSTEM, human_text)

    # ── 6. Validate and coerce ────────────────────────────────────────────────
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

        valid_risk_levels = {"isolated", "connected", "coordinated", "orchestrated"}
        risk_level = raw.get("network_risk_level", "isolated")
        if risk_level not in valid_risk_levels:
            risk_level = "isolated"

        analysis = NetworkAnalysis(
            flagged_relevant_messages=flagged,
            communication_pattern=raw.get("communication_pattern", ""),
            accomplice_suspicions=raw.get("accomplice_suspicions", []),
            coordination_evidence=raw.get("coordination_evidence", "none detected"),
            network_risk_level=risk_level,
        )
    except Exception as exc:
        logger.error("[NetworkAnalyser] Analysis construction failed: %s — raw: %s", exc, raw)
        analysis = NetworkAnalysis(
            flagged_relevant_messages=[],
            communication_pattern=f"Analysis construction failed: {exc}",
            accomplice_suspicions=[],
            coordination_evidence="none detected",
            network_risk_level="isolated",
        )

    logger.info(
        "[NetworkAnalyser] Done: %d flagged messages, risk=%s",
        len(analysis.flagged_relevant_messages),
        analysis.network_risk_level,
    )
    return {"network_analysis": analysis.model_dump(mode="json")}


class _NetworkAnalyserAgent(BaseInvestigator):
    pass
