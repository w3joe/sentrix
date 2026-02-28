"""
Patrol Swarm — Semantic Stigmergic Blackboard Swarm for SWAT.

Public API surface consumed by downstream blocks (Superintendent, eval harness):
  - PatrolFlag         : escalation output schema
  - run_sweep_cycle    : execute one full sweep cycle against a registry snapshot
  - evaluate_single_document : eval harness entry-point
"""

from patrol_swarm.models import PatrolFlag, ThreatSignal, ViolationVote, SweepResult, Severity
from patrol_swarm.graph import build_graph
from patrol_swarm.sweep import evaluate_single_document, run_sweep_cycle

__all__ = [
    "PatrolFlag",
    "ThreatSignal",
    "ViolationVote",
    "SweepResult",
    "Severity",
    "build_graph",
    "evaluate_single_document",
    "run_sweep_cycle",
]
