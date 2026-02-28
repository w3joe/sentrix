"""
Pydantic models for the Patrol Swarm.

These are the canonical data contracts shared across all swarm components and
consumed by downstream blocks (Superintendent, eval harness).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Severity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CLEAN = "CLEAN"


# Severity ordering for consensus resolution (higher index = more severe)
SEVERITY_ORDER: dict[Severity, int] = {
    Severity.CLEAN: 0,
    Severity.LOW: 1,
    Severity.MEDIUM: 2,
    Severity.HIGH: 3,
}


def max_severity(severities: list[Severity]) -> Severity:
    """Return the highest severity from a list."""
    if not severities:
        return Severity.CLEAN
    return max(severities, key=lambda s: SEVERITY_ORDER[s])


class ThreatSignal(BaseModel):
    """A raw observation posted by a single patrol agent to the blackboard.

    Factual account of what the patrol agent saw — no conclusions, no investigation.
    Represents local perception of one patrol agent — not yet a collective decision.
    """

    signal_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_agent: str  # email_patrol | code_patrol | doc_patrol
    target_agent_id: str  # The monitored agent being scanned
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    domain: str  # email | code | document
    severity: Severity
    confidence: float = Field(ge=0.0, le=1.0)
    pii_labels_detected: list[str] = Field(default_factory=list)
    observation: str  # what was seen — factual, no root cause or intent
    tool_calls_made: list[str] = Field(default_factory=list)
    raw_tool_outputs: dict = Field(default_factory=dict)

    class Config:
        use_enum_values = True


class ViolationVote(BaseModel):
    """A formal vote by a patrol agent that a target agent should be referred for investigation.

    Only posted when confidence exceeds CONFIDENCE_THRESHOLD.
    Quorum of votes on the same target_agent_id triggers PatrolFlag production.
    This is not a verdict — it is a referral request.
    """

    vote_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_agent: str
    target_agent_id: str
    severity: Severity
    confidence: float = Field(ge=0.0, le=1.0)
    pii_labels_detected: list[str] = Field(default_factory=list)
    observation: str  # what was seen — factual, no root cause or intent
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        use_enum_values = True


class PatrolFlag(BaseModel):
    """A referral produced when quorum is reached — handed to the investigation swarm.

    This is NOT a verdict. The patrol swarm observed enough suspicious activity to
    warrant investigation. Conclusions, root cause, and intent are determined by the
    investigation swarm, not here.
    """

    flag_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    target_agent_id: str
    consensus_severity: Severity
    consensus_confidence: float
    votes: list[ViolationVote]
    pii_labels_union: list[str]
    referral_summary: str  # raw patrol observations concatenated — no synthesis
    pheromone_level: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        use_enum_values = True

    def to_superintendent_payload(self) -> dict:
        """Serialise for POST /superintendent/investigate."""
        return self.model_dump(mode="json")


class SweepResult(BaseModel):
    """Metrics for a single sweep cycle — used for evaluation and logging."""

    sweep_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    cycle_number: int
    agents_scanned: list[str]
    signals_posted: int
    votes_posted: int
    flags_produced: int
    pheromone_snapshot: dict[str, float]
    duration_ms: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)
