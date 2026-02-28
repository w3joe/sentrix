"""
Damage Analyst — Stage 3 of the investigation pipeline.

Receives both prior reports, queries cross-agent actions via ChromaDB to detect
propagation, and produces a DamageReport with causal chain and severity assessment.
"""

from __future__ import annotations

import json
import logging
import os
import sys

from investigation.agents.base_investigator import BaseInvestigator
from investigation.models import (
    CausalLink,
    DamageReport,
    DamageSeverity,
    InvestigationState,
)
from investigation.prompts import DAMAGE_ANALYST_SYSTEM
from investigation.vector_store import InvestigationVectorStore

logger = logging.getLogger(__name__)

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

_VALID_SEVERITY = {s.value for s in DamageSeverity}
_VALID_PROPAGATION = {"none", "contained", "spreading", "systemic"}


async def damage_analysis_node(state: InvestigationState) -> dict:
    """
    LangGraph node: causal chain analysis and damage scope assessment.

    Reads: state["investigator_report"], state["network_analysis"], state["target_agent_id"]
    Writes: {"damage_report": dict}
    """
    target_id = state["target_agent_id"]
    investigation_id = state["investigation_id"]
    inv_report = state.get("investigator_report") or {}
    net_analysis = state.get("network_analysis") or {}

    crime_classification = inv_report.get("crime_classification", "unknown")
    evidence_summary = inv_report.get("evidence_summary", "")
    accomplices = net_analysis.get("accomplice_suspicions", [])

    logger.info("[DamageAnalyst] Assessing damage for agent %s (crime=%s)", target_id, crime_classification)

    # ── 1. Cross-agent action search (propagation detection) ──────────────────
    crime_query = f"{crime_classification}: {evidence_summary}"
    vs = InvestigationVectorStore()
    cross_agent_results = vs.query_cross_agent_actions(crime_query, exclude_agent=target_id, n=10)

    # ── 2. Build human message ────────────────────────────────────────────────
    cross_agent_text = (
        json.dumps(cross_agent_results, indent=2, default=str)
        if cross_agent_results
        else "No similar actions found in other agents."
    )

    human_text = f"""INVESTIGATION ID: {investigation_id}
TARGET AGENT: {target_id}
CRIME CLASSIFICATION: {crime_classification}

━━━ INVESTIGATOR REPORT ━━━
Evidence Summary: {evidence_summary}
Modus Operandi: {inv_report.get("modus_operandi", "")}
Timeline: {inv_report.get("timeline", "")}
Profile Anomalies: {inv_report.get("agent_profile_anomalies", "")}

━━━ NETWORK ANALYSIS ━━━
Communication Pattern: {net_analysis.get("communication_pattern", "")}
Coordination Evidence: {net_analysis.get("coordination_evidence", "none detected")}
Network Risk Level: {net_analysis.get("network_risk_level", "isolated")}
Accomplice Suspicions: {", ".join(accomplices) if accomplices else "none"}
Flagged Messages Count: {len(net_analysis.get("flagged_relevant_messages", []))}

━━━ CROSS-AGENT ACTIONS (similar actions by OTHER agents) ━━━
{cross_agent_text}

Construct the causal chain, assess damage severity, and identify propagation risk.
Produce your DamageReport JSON."""

    # ── 3. Call LLM ───────────────────────────────────────────────────────────
    agent = _DamageAnalystAgent()
    raw = await agent._call_llm(DAMAGE_ANALYST_SYSTEM, human_text)

    # ── 4. Validate and coerce ────────────────────────────────────────────────
    try:
        severity_str = raw.get("damage_severity", "medium")
        if severity_str not in _VALID_SEVERITY:
            severity_str = "medium"

        propagation_str = raw.get("propagation_risk", "none")
        if propagation_str not in _VALID_PROPAGATION:
            propagation_str = "none"

        causal_chain = []
        for link in raw.get("causal_chain", []):
            try:
                causal_chain.append(CausalLink(
                    cause=link.get("cause", ""),
                    effect=link.get("effect", ""),
                    affected_agent_id=link.get("affected_agent_id"),
                    evidence=link.get("evidence", ""),
                ))
            except Exception:
                pass

        report = DamageReport(
            damage_severity=DamageSeverity(severity_str),
            causal_chain=causal_chain,
            affected_agents=raw.get("affected_agents", []),
            data_exposure_scope=raw.get("data_exposure_scope", ""),
            propagation_risk=propagation_str,
            estimated_impact=raw.get("estimated_impact", ""),
            cross_agent_findings=raw.get("cross_agent_findings", "none identified"),
        )
    except Exception as exc:
        logger.error("[DamageAnalyst] Report construction failed: %s — raw: %s", exc, raw)
        report = DamageReport(
            damage_severity=DamageSeverity.medium,
            causal_chain=[],
            affected_agents=[],
            data_exposure_scope=f"Report construction failed: {exc}",
            propagation_risk="none",
            estimated_impact="",
            cross_agent_findings="none identified",
        )

    logger.info(
        "[DamageAnalyst] Done: severity=%s, propagation=%s, affected=%d",
        report.damage_severity,
        report.propagation_risk,
        len(report.affected_agents),
    )
    return {"damage_report": report.model_dump(mode="json")}


class _DamageAnalystAgent(BaseInvestigator):
    pass
