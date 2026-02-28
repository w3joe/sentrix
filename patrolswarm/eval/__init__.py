"""
eval — Evaluation harness for the SWAT Patrol Swarm.

Benchmarks the patrol swarm against the NVIDIA Nemotron-PII dataset,
producing precision / recall / F1 metrics and publication-quality charts.

Usage (from patrolswarm/ directory):
    python -m eval.run_eval --mode mock --n-positive 200 --n-negative 200
    python -m eval.run_eval --mode live --n-positive 200 --n-negative 200
"""

from .dataset import load_nemotron_pii, CRITICAL_PII_LABELS, ALL_PII_LABELS
from .harness import mock_patrol_evaluate, live_patrol_evaluate, run_evaluation, MOCK_AGENT_PROFILE
from .metrics import compute_metrics
from .charts import generate_eval_charts

__all__ = [
    "load_nemotron_pii",
    "CRITICAL_PII_LABELS",
    "ALL_PII_LABELS",
    "mock_patrol_evaluate",
    "live_patrol_evaluate",
    "run_evaluation",
    "MOCK_AGENT_PROFILE",
    "compute_metrics",
    "generate_eval_charts",
]
