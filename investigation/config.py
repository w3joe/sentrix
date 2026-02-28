"""
Configuration — LLM endpoints and investigation thresholds.

Mirrors patrolswarm/patrol_swarm/config.py: same PATROL_DEPLOYMENT selector,
same Brev NIM / local LM Studio pattern. Investigation agents use Nemotron Super
(49B) exclusively — the deeper reasoning model — regardless of deployment.

All values can be overridden via environment variables.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ─── Deployment selector ──────────────────────────────────────────────────────
# Same env var as patrol swarm so a single .env controls the whole system.
DEPLOYMENT: str = os.environ.get("PATROL_DEPLOYMENT", "brev").lower()

# ─── Thinking / chain-of-thought toggle ──────────────────────────────────────
INVESTIGATION_THINKING: bool = os.environ.get("INVESTIGATION_THINKING", "0").strip().lower() in (
    "1", "true", "yes"
)

# ─── Brev NIM endpoints (production) ─────────────────────────────────────────
BREV_SUPER_ENDPOINT: str = os.environ.get("BREV_SUPER_ENDPOINT", "https://nim.brev.dev/v1")
BREV_API_KEY: str = os.environ.get("BREV_API_KEY", "no-key-set")
SUPER_MODEL: str = os.environ.get("SUPER_MODEL", "nvidia/nemotron-super-49b-v1")

# ─── Local LM Studio endpoints (development) ─────────────────────────────────
LOCAL_ENDPOINT: str = os.environ.get("LOCAL_ENDPOINT", "http://localhost:1234/v1")
LOCAL_API_KEY: str = os.environ.get("LOCAL_API_KEY", "lm-studio")
LOCAL_INVESTIGATION_MODEL: str = os.environ.get("LOCAL_INVESTIGATION_MODEL", "local-model")
LOCAL_TOOL_CHOICE: str = os.environ.get("LOCAL_TOOL_CHOICE", "auto")

# ─── Active endpoint resolution ───────────────────────────────────────────────
# Investigation agents always use the Super (49B) endpoint regardless of deployment.
if DEPLOYMENT == "local":
    ACTIVE_ENDPOINT: str = LOCAL_ENDPOINT
    ACTIVE_API_KEY: str = LOCAL_API_KEY
    ACTIVE_MODEL: str = LOCAL_INVESTIGATION_MODEL
    ACTIVE_TOOL_CHOICE: str = LOCAL_TOOL_CHOICE
else:  # "brev" (default)
    ACTIVE_ENDPOINT: str = BREV_SUPER_ENDPOINT
    ACTIVE_API_KEY: str = BREV_API_KEY
    ACTIVE_MODEL: str = SUPER_MODEL
    ACTIVE_TOOL_CHOICE: str = "auto"

# ─── Thinking suppression ─────────────────────────────────────────────────────
NO_THINK_PREFIX: str = "" if INVESTIGATION_THINKING else (
    "/no_think " if DEPLOYMENT == "local" else ""
)

# ─── LLM generation parameters ───────────────────────────────────────────────
INVESTIGATION_TEMPERATURE: float = float(os.environ.get("INVESTIGATION_TEMPERATURE", "0.2"))
INVESTIGATION_MAX_TOKENS: int = int(os.environ.get("INVESTIGATION_MAX_TOKENS", "4096"))

# ─── API server ───────────────────────────────────────────────────────────────
INVESTIGATION_API_HOST: str = os.environ.get("INVESTIGATION_API_HOST", "0.0.0.0")
INVESTIGATION_API_PORT: int = int(os.environ.get("INVESTIGATION_API_PORT", "8002"))

# ─── Bridge DB ───────────────────────────────────────────────────────────────
# Used when importing SandboxDB directly (not via the bridge_db API).
BRIDGE_DB_PATH: str = os.environ.get(
    "BRIDGE_DB_PATH",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "bridge_db", "sandbox_bridge.db"),
)

# ─── LangGraph persistence ────────────────────────────────────────────────────
INVESTIGATION_DB_URL: str = os.environ.get(
    "INVESTIGATION_DB_URL", "sqlite:///./investigation/investigation.db"
)

# ─── LangSmith ────────────────────────────────────────────────────────────────
LANGCHAIN_TRACING_V2: str = os.environ.get("LANGCHAIN_TRACING_V2", "true")
LANGCHAIN_PROJECT: str = os.environ.get("LANGCHAIN_PROJECT", "investigation-workflow")
LANGCHAIN_API_KEY: str = os.environ.get("LANGCHAIN_API_KEY", "")

os.environ.setdefault("LANGCHAIN_TRACING_V2", LANGCHAIN_TRACING_V2)
os.environ.setdefault("LANGCHAIN_PROJECT", LANGCHAIN_PROJECT)
if LANGCHAIN_API_KEY:
    os.environ.setdefault("LANGCHAIN_API_KEY", LANGCHAIN_API_KEY)
