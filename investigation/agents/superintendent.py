"""
Superintendent — Stage 4 (final) of the investigation pipeline.

Receives all three prior reports, issues a verdict + sentence, and persists
the concluded CaseFile to bridge_db.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import uuid

from investigation.agents.base_investigator import BaseInvestigator
from investigation.models import (
    CaseFile,
    CrimeClassification,
    DamageReport,
    DamageSeverity,
    InvestigationState,
    InvestigatorReport,
    NetworkAnalysis,
    Verdict,
)
from investigation.prompts import SUPERINTENDENT_SYSTEM

logger = logging.getLogger(__name__)

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

_VALID_VERDICTS = {v.value for v in Verdict}


async def superintendent_node(state: InvestigationState) -> dict:
    """
    LangGraph node: final verdict, severity score, and CaseFile persistence.

    Reads: all prior report keys + state["investigation_id"], state["flag_id"]
    Writes: {"case_file": dict, "status": "concluded"}
    """
    target_id = state["target_agent_id"]
    investigation_id = state["investigation_id"]
    flag_id = state["flag_id"]
    inv_report_dict = state.get("investigator_report") or {}
    net_analysis_dict = state.get("network_analysis") or {}
    damage_report_dict = state.get("damage_report") or {}

    logger.info("[Superintendent] Deliberating for agent %s (inv=%s)", target_id, investigation_id)

    # ── 1. Build human message ────────────────────────────────────────────────
    human_text = f"""INVESTIGATION ID: {investigation_id}
TARGET AGENT: {target_id}
FLAG ID: {flag_id}

━━━ INVESTIGATOR REPORT ━━━
Crime Classification: {inv_report_dict.get("crime_classification", "unknown")}
Confidence: {inv_report_dict.get("confidence", 0.0):.2f}
Evidence Summary: {inv_report_dict.get("evidence_summary", "")}
Modus Operandi: {inv_report_dict.get("modus_operandi", "")}
Timeline: {inv_report_dict.get("timeline", "")}
Profile Anomalies: {inv_report_dict.get("agent_profile_anomalies", "")}
Relevant Log IDs: {json.dumps(inv_report_dict.get("relevant_log_ids", []))}

━━━ NETWORK ANALYSIS ━━━
Communication Pattern: {net_analysis_dict.get("communication_pattern", "")}
Network Risk Level: {net_analysis_dict.get("network_risk_level", "isolated")}
Coordination Evidence: {net_analysis_dict.get("coordination_evidence", "none detected")}
Accomplice Suspicions: {json.dumps(net_analysis_dict.get("accomplice_suspicions", []))}
Flagged Messages: {len(net_analysis_dict.get("flagged_relevant_messages", []))}

━━━ DAMAGE REPORT ━━━
Damage Severity: {damage_report_dict.get("damage_severity", "none")}
Propagation Risk: {damage_report_dict.get("propagation_risk", "none")}
Affected Agents: {json.dumps(damage_report_dict.get("affected_agents", []))}
Data Exposure Scope: {damage_report_dict.get("data_exposure_scope", "")}
Estimated Impact: {damage_report_dict.get("estimated_impact", "")}

Issue your verdict, sentence, and produce the CaseFile JSON.
Base your decision on ALL evidence presented above."""

    # ── 2. Call LLM ───────────────────────────────────────────────────────────
    agent = _SuperintendentAgent()
    raw = await agent._call_llm(SUPERINTENDENT_SYSTEM, human_text)

    # ── 3. Reconstruct Pydantic sub-models ────────────────────────────────────
    try:
        inv_report = InvestigatorReport(**inv_report_dict)
    except Exception:
        inv_report = InvestigatorReport(
            crime_classification=CrimeClassification.unknown,
            confidence=0.0, relevant_log_ids=[], evidence_summary="",
            modus_operandi="", timeline="", agent_profile_anomalies="",
        )

    try:
        net_analysis = NetworkAnalysis(**net_analysis_dict)
    except Exception:
        net_analysis = NetworkAnalysis(
            flagged_relevant_messages=[], communication_pattern="",
            accomplice_suspicions=[], coordination_evidence="none detected",
            network_risk_level="isolated",
        )

    try:
        damage_report = DamageReport(**damage_report_dict)
    except Exception:
        damage_report = DamageReport(
            damage_severity=DamageSeverity.none, causal_chain=[],
            affected_agents=[], data_exposure_scope="", propagation_risk="none",
            estimated_impact="",
        )

    # ── 4. Build CaseFile ─────────────────────────────────────────────────────
    verdict_str = raw.get("verdict", "under_watch")
    if verdict_str not in _VALID_VERDICTS:
        verdict_str = "under_watch"

    severity_raw = raw.get("severity_score", 5)
    try:
        severity_score = max(1, min(10, int(severity_raw)))
    except (TypeError, ValueError):
        severity_score = 5

    confidence_raw = raw.get("confidence", 50)
    # Superintendent outputs 0–100 integer; normalise to 0.0–1.0
    confidence = float(confidence_raw) / 100.0 if isinstance(confidence_raw, (int, float)) and confidence_raw > 1 else float(confidence_raw)
    confidence = max(0.0, min(1.0, confidence))

    try:
        case_file = CaseFile(
            investigation_id=investigation_id,
            flag_id=flag_id,
            target_agent_id=target_id,
            crime_classification=CrimeClassification(inv_report_dict.get("crime_classification", "unknown")),
            verdict=Verdict(verdict_str),
            severity_score=severity_score,
            confidence=confidence,
            summary=raw.get("summary", ""),
            key_findings=raw.get("key_findings", []),
            evidence_summary=raw.get("evidence_summary", inv_report_dict.get("evidence_summary", "")),
            investigator_report=inv_report,
            network_analysis=net_analysis,
            damage_report=damage_report,
        )
    except Exception as exc:
        logger.error("[Superintendent] CaseFile construction failed: %s", exc)
        case_file = CaseFile(
            investigation_id=investigation_id,
            flag_id=flag_id,
            target_agent_id=target_id,
            crime_classification=CrimeClassification.unknown,
            verdict=Verdict.under_watch,
            severity_score=5,
            confidence=0.0,
            summary=f"CaseFile construction failed: {exc}",
            key_findings=[],
            evidence_summary="",
            investigator_report=inv_report,
            network_analysis=net_analysis,
            damage_report=damage_report,
        )

    # ── 5. Persist to bridge_db ───────────────────────────────────────────────
    from bridge_db.db import SandboxDB
    db = SandboxDB()
    case_json = case_file.model_dump_json()
    await db.save_investigation(
        investigation_id=investigation_id,
        flag_id=flag_id,
        target_agent_id=target_id,
        verdict=str(case_file.verdict),
        severity_score=case_file.severity_score,
        case_file_json=case_json,
    )

    # ── 6. Update agent criminal score ────────────────────────────────────────
    if case_file.verdict == Verdict.guilty:
        score_delta = case_file.severity_score
    elif case_file.verdict == Verdict.under_watch:
        score_delta = 2
    else:  # not_guilty
        score_delta = 0

    if score_delta > 0:
        new_score = await db.add_criminal_score(target_id, score_delta)
        logger.info(
            "[Superintendent] Criminal score updated for %s: +%d → %.2f",
            target_id, score_delta, new_score,
        )

    logger.info(
        "[Superintendent] Concluded: verdict=%s, severity=%d, confidence=%.2f",
        case_file.verdict, case_file.severity_score, case_file.confidence,
    )
    return {
        "case_file": case_file.model_dump(mode="json"),
        "status": "concluded",
    }


class _SuperintendentAgent(BaseInvestigator):
    pass
