"""
Investigator — Stage 1 of the investigation pipeline.

Queries action logs (SQLite + ChromaDB semantic ranking) and produces an
InvestigatorReport with a crime classification and evidence summary.
"""

from __future__ import annotations

import json
import logging
import os
import sys

from investigation.agents.base_investigator import BaseInvestigator
from investigation.models import CrimeClassification, InvestigationState, InvestigatorReport
from investigation.prompts import INVESTIGATOR_SYSTEM
from investigation.vector_store import InvestigationVectorStore

logger = logging.getLogger(__name__)

# Bridge DB path resolution — add project root to sys.path if needed
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)


async def investigator_node(state: InvestigationState) -> dict:
    """
    LangGraph node: forensic action log analysis.

    Reads: state["target_agent_id"], state["patrol_flag"], state["investigation_id"]
    Writes: {"investigator_report": dict}
    """
    target_id = state["target_agent_id"]
    investigation_id = state["investigation_id"]
    patrol_flag = state.get("patrol_flag", {})
    referral_summary = patrol_flag.get("referral_summary", "")

    logger.info("[Investigator] Starting analysis for agent %s (inv=%s)", target_id, investigation_id)

    # ── 1. Fetch all action logs from bridge_db ───────────────────────────────
    from bridge_db.db import SandboxDB
    db = SandboxDB()
    actions = await db.get_agent_actions(target_id, limit=200)
    agent_registry = await db.get_agent_registry()
    agent_profile = agent_registry.get(target_id, {})

    # ── 2. Semantic ranking via ChromaDB ─────────────────────────────────────
    vs = InvestigationVectorStore()
    ranked_actions = vs.query_relevant_actions(referral_summary or "violation", target_id, n=30)
    # Merge ranked action metadata with full action records for LLM context
    ranked_ids = {a.get("action_id") for a in ranked_actions if a.get("action_id")}
    # Prioritise ranked actions; append any violation-flagged actions not already included
    priority_actions = [a for a in actions if a.get("action_id") in ranked_ids]
    violation_actions = [a for a in actions if a.get("violation") and a.get("action_id") not in ranked_ids]
    context_actions = (priority_actions + violation_actions)[:50]

    # ── 3. Build human message ────────────────────────────────────────────────
    human_text = f"""INVESTIGATION ID: {investigation_id}
TARGET AGENT: {target_id}

PATROL FLAG REFERRAL SUMMARY:
{referral_summary}

CONSENSUS SEVERITY: {patrol_flag.get("consensus_severity", "UNKNOWN")}
CONSENSUS CONFIDENCE: {patrol_flag.get("consensus_confidence", 0.0):.2f}
PII LABELS OBSERVED BY PATROL: {", ".join(patrol_flag.get("pii_labels_union", [])) or "none"}

AGENT PROFILE:
  Type          : {agent_profile.get("agent_type", "unknown")}
  Declared scope: {agent_profile.get("declared_scope", "not specified")}
  Permitted paths: {json.dumps(agent_profile.get("permitted_file_paths", []))}
  Permitted domains: {json.dumps(agent_profile.get("permitted_domains", []))}
  Approved templates: {json.dumps(agent_profile.get("approved_templates", []))}

ACTION LOGS ({len(context_actions)} most relevant shown, {len(actions)} total):
{json.dumps(context_actions, indent=2, default=str)}

Analyse these logs and produce your InvestigatorReport JSON."""

    # ── 4. Call LLM ───────────────────────────────────────────────────────────
    agent = _InvestigatorAgent()
    raw = await agent._call_llm(INVESTIGATOR_SYSTEM, human_text)

    # ── 5. Validate and coerce ────────────────────────────────────────────────
    try:
        crime_str = raw.get("crime_classification", "unknown")
        if crime_str not in CrimeClassification._value2member_map_:
            crime_str = "unknown"
        report = InvestigatorReport(
            crime_classification=CrimeClassification(crime_str),
            confidence=float(raw.get("confidence", 0.5)),
            relevant_log_ids=raw.get("relevant_log_ids", []),
            evidence_summary=raw.get("evidence_summary", ""),
            modus_operandi=raw.get("modus_operandi", ""),
            timeline=raw.get("timeline", ""),
            agent_profile_anomalies=raw.get("agent_profile_anomalies", ""),
        )
    except Exception as exc:
        logger.error("[Investigator] Report construction failed: %s — raw: %s", exc, raw)
        report = InvestigatorReport(
            crime_classification=CrimeClassification.unknown,
            confidence=0.0,
            relevant_log_ids=[],
            evidence_summary=f"Report construction failed: {exc}",
            modus_operandi="",
            timeline="",
            agent_profile_anomalies="",
        )

    logger.info(
        "[Investigator] Done: crime=%s, confidence=%.2f",
        report.crime_classification,
        report.confidence,
    )
    return {"investigator_report": report.model_dump(mode="json")}


class _InvestigatorAgent(BaseInvestigator):
    pass
