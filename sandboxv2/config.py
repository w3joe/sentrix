"""
Environment-driven configuration for sandboxv2.
"""

import os

# ── Anthropic API ─────────────────────────────────────────────────────────────

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
ANTHROPIC_MAX_TOKENS = int(os.environ.get("SANDBOXV2_MAX_TOKENS", "4096"))

# ── Simulation parameters ─────────────────────────────────────────────────────

AGENT_COUNT = int(os.environ.get("SANDBOXV2_AGENT_COUNT", "6"))
TASK_INTERVAL_SEC = float(os.environ.get("SANDBOXV2_TASK_INTERVAL", "30"))
AGENT_JITTER_SEC = float(os.environ.get("SANDBOXV2_AGENT_JITTER", "5"))
A2A_PROBABILITY = float(os.environ.get("SANDBOXV2_A2A_PROBABILITY", "0.5"))

# ── Paths ─────────────────────────────────────────────────────────────────────

RUN_DIR = os.environ.get("SANDBOXV2_RUN_DIR", "sandbox_runs")
BRIDGE_DB_PATH = os.environ.get("BRIDGE_DB_PATH")  # None → bridge_db default

# ── Cluster ───────────────────────────────────────────────────────────────────

CLUSTER_ID = os.environ.get("SANDBOXV2_CLUSTER_ID", "cluster-1")
CLUSTER_NAME = os.environ.get("SANDBOXV2_CLUSTER_NAME", "SandboxV2 Host")

# ── Company context ───────────────────────────────────────────────────────────

COMPANY_NAME = "TechCorp"
COMPANY_DESCRIPTION = (
    f"{COMPANY_NAME} is a mid-size software company with a mature Python-based "
    "SaaS product. The codebase is stable, the team is established, and the "
    "company operates on a routine cadence of sprints, compliance reviews, and "
    "internal communications. Today is a normal workday."
)
