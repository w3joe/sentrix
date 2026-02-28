"""
Pydantic models and LangGraph TypedDict for the investigation workflow.

These are the canonical data contracts for the four-agent sequential pipeline.
All field names match docs/SCHEMA.md and frontend/app/types/index.ts exactly.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field
from typing_extensions import TypedDict


# ─── Enumerations ─────────────────────────────────────────────────────────────


class CrimeClassification(str, Enum):
    # ── Email agent crimes ──────────────────────────────────────────────────
    email_pii_exfiltration = "email_pii_exfiltration"
    unauthorized_external_recipient = "unauthorized_external_recipient"
    identity_impersonation = "identity_impersonation"
    credential_solicitation = "credential_solicitation"
    bulk_data_forwarding = "bulk_data_forwarding"
    # ── Code agent crimes ───────────────────────────────────────────────────
    secret_hardcoding = "secret_hardcoding"
    scope_boundary_violation = "scope_boundary_violation"
    unauthorized_dependency_injection = "unauthorized_dependency_injection"
    backdoor_insertion = "backdoor_insertion"
    test_suppression = "test_suppression"
    # ── Document agent crimes ───────────────────────────────────────────────
    unauthorized_clause_insertion = "unauthorized_clause_insertion"
    pii_embedding = "pii_embedding"
    template_deviation = "template_deviation"
    confidential_data_disclosure = "confidential_data_disclosure"
    document_type_violation = "document_type_violation"
    # ── Fallback ────────────────────────────────────────────────────────────
    unknown = "unknown"


class Verdict(str, Enum):
    guilty = "guilty"
    not_guilty = "not_guilty"
    under_watch = "under_watch"


class DamageSeverity(str, Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"
    none = "none"


# ─── Stage Reports ────────────────────────────────────────────────────────────


class InvestigatorReport(BaseModel):
    """Output of Stage 1: forensic analysis of action logs."""

    crime_classification: CrimeClassification
    relevant_log_ids: list[str] = Field(default_factory=list)
    case_facts: str  # narrative of what happened with evidence

    class Config:
        use_enum_values = True


class FlaggedMessage(BaseModel):
    """A single A2A message flagged as relevant by the Network Analyser."""

    message_id: str
    sender_id: str
    recipient_id: str
    timestamp: str
    body_snippet: str  # first 200 chars
    rationale: str     # why this message is relevant to the crime


class NetworkAnalysis(BaseModel):
    """Output of Stage 2: A2A communication analysis."""

    flagged_relevant_messages: list[FlaggedMessage] = Field(default_factory=list)


class CausalLink(BaseModel):
    """A single cause → effect relationship in the damage chain."""

    cause: str
    effect: str
    affected_agent_id: str | None = None
    evidence: str


class DamageReport(BaseModel):
    """Output of Stage 3: causal link analysis and damage scope."""

    damage_severity: DamageSeverity
    causal_chain: list[CausalLink] = Field(default_factory=list)
    affected_agents: list[str] = Field(default_factory=list)
    data_exposure_scope: str   # what data/systems may have been compromised
    propagation_risk: str      # none | contained | spreading | systemic
    estimated_impact: str      # narrative description of damage scope

    class Config:
        use_enum_values = True


class CaseFile(BaseModel):
    """Output of Stage 4 / final investigation product."""

    investigation_id: str
    flag_id: str
    target_agent_id: str
    crime_classification: CrimeClassification
    verdict: Verdict
    severity_score: int = Field(ge=1, le=10)  # Superintendent's 1–10 severity rating
    confidence: float = Field(ge=0.0, le=1.0)
    summary: str             # 1–3 sentence executive summary
    key_findings: list[str] = Field(default_factory=list)
    evidence_summary: str
    investigator_report: InvestigatorReport
    network_analysis: NetworkAnalysis
    damage_report: DamageReport
    concluded_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        use_enum_values = True


# ─── LangGraph State ──────────────────────────────────────────────────────────


class InvestigationState(TypedDict):
    """
    LangGraph state threaded through the sequential investigation pipeline.

    Each stage node reads its prerequisites and writes its own output key.
    The setup node populates the first 4 keys; END state has all keys filled.
    """

    investigation_id: str
    flag_id: str
    target_agent_id: str
    patrol_flag: dict                 # serialised PatrolFlag from sweep.py
    investigator_report: dict | None  # populated by investigator_node
    network_analysis: dict | None     # populated by network_analyser_node
    damage_report: dict | None        # populated by damage_analysis_node
    case_file: dict | None            # populated by superintendent_node
    status: str                       # open → in_progress → concluded
    error: str | None                 # set on unhandled exception in any node
