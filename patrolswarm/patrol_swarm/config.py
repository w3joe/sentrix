"""
Configuration — environment variables, model endpoints, and swarm thresholds.

All values can be overridden via environment variables.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ─── Deployment selector ─────────────────────────────────────────────────────
# Set PATROL_DEPLOYMENT=local  to use LM Studio (or any local OpenAI-compatible server)
# Set PATROL_DEPLOYMENT=brev   to use Brev NIM (production — Nemotron Nano + Super)
DEPLOYMENT: str = os.environ.get("PATROL_DEPLOYMENT", "brev").lower()

# ─── Thinking / chain-of-thought toggle ──────────────────────────────────────
# Set PATROL_THINKING=1 to let the model emit <think>…</think> reasoning blocks.
# When enabled, thinking blocks are logged at INFO level (agent behaviour visibility).
# When disabled (default), /no_think is prepended and thinking blocks are stripped.
PATROL_THINKING: bool = os.environ.get("PATROL_THINKING", "0").strip().lower() in ("1", "true", "yes")

# ─── Brev NIM endpoints (production) ─────────────────────────────────────────
BREV_NANO_ENDPOINT: str = os.environ.get(
    "BREV_NANO_ENDPOINT", "https://nim.brev.dev/v1"
)
BREV_SUPER_ENDPOINT: str = os.environ.get(
    "BREV_SUPER_ENDPOINT", "https://nim.brev.dev/v1"
)
BREV_API_KEY: str = os.environ.get("BREV_API_KEY", "no-key-set")

NANO_MODEL: str = os.environ.get("NANO_MODEL", "nvidia/nemotron-mini-4b-instruct")
SUPER_MODEL: str = os.environ.get("SUPER_MODEL", "nvidia/nemotron-super-49b-v1")

# ─── Local LM Studio endpoints (development) ─────────────────────────────────
# LM Studio defaults to http://localhost:1234/v1 with any non-empty key.
# Set LOCAL_PATROL_MODEL / LOCAL_ORCHESTRATOR_MODEL to the model name shown in
# LM Studio's "model identifier" field (e.g. "lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF").
# If you only have one model loaded, both can be the same value.
# Note: tool-calling requires a model that supports it in LM Studio.
# If yours does not, set LOCAL_TOOL_CHOICE=none — patrol agents will fall back
# to parsing raw JSON output instead of using function-call schema.
LOCAL_ENDPOINT: str = os.environ.get("LOCAL_ENDPOINT", "http://localhost:1234/v1")
LOCAL_API_KEY: str = os.environ.get("LOCAL_API_KEY", "lm-studio")
LOCAL_PATROL_MODEL: str = os.environ.get("LOCAL_PATROL_MODEL", "local-model")
LOCAL_ORCHESTRATOR_MODEL: str = os.environ.get("LOCAL_ORCHESTRATOR_MODEL", "local-model")
# Set to "none" if your local model doesn't support tool-calling
LOCAL_TOOL_CHOICE: str = os.environ.get("LOCAL_TOOL_CHOICE", "auto")

# ─── Active endpoint resolution (agents use these, never the raw Brev/Local vars)
# These are read-only computed values; do not set them directly — use
# PATROL_DEPLOYMENT to switch, and the Brev/Local vars above to configure each.
if DEPLOYMENT == "local":
    ACTIVE_PATROL_ENDPOINT: str = LOCAL_ENDPOINT
    ACTIVE_ORCHESTRATOR_ENDPOINT: str = LOCAL_ENDPOINT
    ACTIVE_API_KEY: str = LOCAL_API_KEY
    ACTIVE_PATROL_MODEL: str = LOCAL_PATROL_MODEL
    ACTIVE_ORCHESTRATOR_MODEL: str = LOCAL_ORCHESTRATOR_MODEL
    ACTIVE_TOOL_CHOICE: str = LOCAL_TOOL_CHOICE
else:  # "brev" (default)
    ACTIVE_PATROL_ENDPOINT: str = BREV_NANO_ENDPOINT
    ACTIVE_ORCHESTRATOR_ENDPOINT: str = BREV_SUPER_ENDPOINT
    ACTIVE_API_KEY: str = BREV_API_KEY
    ACTIVE_PATROL_MODEL: str = NANO_MODEL
    ACTIVE_ORCHESTRATOR_MODEL: str = SUPER_MODEL
    ACTIVE_TOOL_CHOICE: str = "auto"

# ─── Local-model thinking suppression ───────────────────────────────────────
# Nemotron/Qwen3 local models emit <think>…</think> tokens that break JSON
# parsing unless suppressed. When PATROL_THINKING=1 the prefix is omitted so
# the model reasons freely — blocks are then captured and logged instead.
NO_THINK_PREFIX: str = "" if PATROL_THINKING else ("/no_think " if DEPLOYMENT == "local" else "")

# ─── LLM generation parameters ────────────────────────────────────────────────
NANO_TEMPERATURE: float = 0.1
NANO_MAX_TOKENS: int = int(os.environ.get("NANO_MAX_TOKENS", "2048"))
SUPER_TEMPERATURE: float = 0.2
SUPER_MAX_TOKENS: int = int(os.environ.get("SUPER_MAX_TOKENS", "2048"))

# ─── Swarm thresholds ─────────────────────────────────────────────────────────
PHEROMONE_DECAY_FACTOR: float = 0.85
PHEROMONE_DEPOSIT_AMOUNT: float = 0.4
# Quorum = ceil(assigned_patrol_count × QUORUM_FRACTION).
# 0.5 = majority: 1 agent→1 vote needed; 2 agents→1; 3 agents→2.
QUORUM_FRACTION: float = 0.5
CONFIDENCE_THRESHOLD: float = 0.6  # min confidence to post a ViolationVote
RE_DISPATCH_STD_THRESHOLD: float = 0.3  # confidence std that triggers re-dispatch

# ─── Patrol sampling ──────────────────────────────────────────────────────────
# Fraction of BASELINE agents (pheromone < 0.3) sampled for scanning each cycle.
# e.g. 0.2 = scan ~20% of clean agents per cycle, rotating through all over time.
# HIGH ALERT (>0.7) and ELEVATED (0.3-0.7) agents are always scanned regardless.
PATROL_SAMPLE_FRACTION: float = float(os.environ.get("PATROL_SAMPLE_FRACTION", "0.2"))

# ─── API server ───────────────────────────────────────────────────────────────
API_HOST: str = os.environ.get("API_HOST", "0.0.0.0")
API_PORT: int = int(os.environ.get("API_PORT", "8001"))
# Investigation workflow API port — sweep.py POSTs PatrolFlags here
INVESTIGATION_API_PORT: int = int(os.environ.get("INVESTIGATION_API_PORT", "8002"))
# Set SANDBOX_RUN to a sandbox run directory path, or "latest" to auto-detect.
# Leave empty (default) to use demo data.
SANDBOX_RUN: str = os.environ.get("SANDBOX_RUN", "")

# ─── Scheduling ───────────────────────────────────────────────────────────────
BASELINE_SWEEP_INTERVAL_SEC: int = 30
HIGH_ALERT_SWEEP_INTERVAL_SEC: int = 10

# Maximum recent actions fed to patrol agents per target (Mamba2 long-context)
MAX_ACTIONS_PER_SCAN: int = 50

# How many of a target's outputs to review at BASELINE pheromone (< 0.3).
# At ELEVATED (0.3-0.7) and HIGH ALERT (> 0.7) all outputs are reviewed.
BASELINE_ACTIONS_SAMPLE: int = int(os.environ.get("BASELINE_ACTIONS_SAMPLE", "3"))

# ─── PII labels considered critical (auto-escalate confidence boost) ──────────
CRITICAL_PII_LABELS: set[str] = {
    "ssn",
    "credit_debit_card",
    "bank_routing_number",
    "password",
    "pin",
    "cvv",
    "biometric_identifier",
}

# ─── LangSmith ────────────────────────────────────────────────────────────────
LANGCHAIN_TRACING_V2: str = os.environ.get("LANGCHAIN_TRACING_V2", "true")
LANGCHAIN_PROJECT: str = os.environ.get("LANGCHAIN_PROJECT", "patrol-swarm")
LANGCHAIN_API_KEY: str = os.environ.get("LANGCHAIN_API_KEY", "")

# Wire up LangSmith env vars at import time
os.environ.setdefault("LANGCHAIN_TRACING_V2", LANGCHAIN_TRACING_V2)
os.environ.setdefault("LANGCHAIN_PROJECT", LANGCHAIN_PROJECT)
if LANGCHAIN_API_KEY:
    os.environ.setdefault("LANGCHAIN_API_KEY", LANGCHAIN_API_KEY)
