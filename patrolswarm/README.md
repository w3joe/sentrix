# Patrol Swarm

A multi-agent AI surveillance system that continuously monitors AI agent behaviour for policy violations, PII exfiltration, and anomalous activity. Built with LangGraph, Nemotron models (via Brev NIM), and a stigmergic pheromone-based coordination layer.

---

## Overview

Patrol Swarm runs a pool of specialised patrol agents that sweep an AI agent ecosystem in recurring cycles. Agents collaborate using a shared **blackboard** (LangGraph state) and a **pheromone map** — an attention mechanism that amplifies scrutiny on targets that previously drew suspicion.

When a quorum of patrol agents independently vote that a target is behaving anomalously, the swarm issues a `PatrolFlag` for escalation.

```
orchestrator_assign
    ├── email_patrol   ──┐
    ├── code_patrol    ──┼──> orchestrator_adjudicate ──> PatrolFlag (if quorum)
    └── doc_patrol     ──┘
```

### Patrol Domains

| Domain | Detects |
|--------|---------|
| **email** | PII exfiltration, unauthorised recipients, credential leaks, sensitive attachments |
| **code** | Hardcoded secrets, out-of-scope file access, PII in diffs/comments, suspicious dependencies |
| **document** | PII in contracts, unauthorised commitments, template deviations, scope-violating data references |

### Swarm Coordination

- **Pheromone map** — each non-clean vote deposits attention weight on the target; weight decays each cycle. High pheromone = more agents assigned next sweep.
- **Dynamic quorum** — `ceil(assigned_patrol_count × QUORUM_FRACTION)`. Scales automatically as the patrol pool grows.
- **Adaptive frequency** — sweep interval drops from 30 s to 10 s when peak pheromone exceeds 0.7.
- **Durable checkpoints** — full blackboard state (pheromone, cycle counter, scan history) persists via LangGraph's SQLite or PostgreSQL checkpointer. Process restarts resume exactly where interrupted.

---

## Project Structure

```
patrolswarm/
├── patrol_swarm/           # Core package
│   ├── agents/             # EmailPatrolAgent, CodePatrolAgent, DocPatrolAgent
│   ├── tools/              # LangChain tools per domain
│   ├── graph.py            # LangGraph state machine definition
│   ├── orchestrator.py     # Nemotron Super: assignment + adjudication
│   ├── blackboard.py       # BlackboardState TypedDict + reducers
│   ├── models.py           # PatrolFlag, ThreatSignal, ViolationVote, SweepResult
│   ├── sweep.py            # run_sweep_cycle(), evaluate_single_document(), SwarmScheduler
│   ├── prompts.py          # System prompts (Mamba2-optimised)
│   ├── persistence.py      # LangGraph checkpointer setup
│   └── config.py           # Environment-driven configuration
├── eval/                   # Evaluation harness
│   ├── dataset.py          # NVIDIA Nemotron-PII HuggingFace loader
│   ├── harness.py          # mock_patrol_evaluate / live_patrol_evaluate
│   ├── metrics.py          # Precision / Recall / F1 computation
│   ├── charts.py           # Matplotlib visualisations
│   └── run_eval.py         # CLI entry point
├── tests/
│   ├── test_smoke.py       # End-to-end quorum & orchestration (no LLM calls)
│   └── test_detection_quality.py
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── pytest.ini
```

---

## Quick Start

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

For the evaluation harness, also install:

```bash
pip install datasets matplotlib numpy tqdm scikit-learn seaborn
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in your credentials
```

### 3. Choose a deployment mode

#### Local (LM Studio / Ollama)

Good for development. Requires a model that supports function-calling (14B+ recommended).

```ini
# .env
PATROL_DEPLOYMENT=local
LOCAL_ENDPOINT=http://localhost:1234/v1
LOCAL_API_KEY=lm-studio
LOCAL_PATROL_MODEL=your-model-name
LOCAL_ORCHESTRATOR_MODEL=your-model-name
# Set to "none" if your model doesn't support tool-calling
LOCAL_TOOL_CHOICE=auto
```

#### Brev NIM (Production)

Nemotron Nano (patrol agents) + Nemotron Super (orchestrator).

```ini
# .env
PATROL_DEPLOYMENT=brev
BREV_NANO_ENDPOINT=https://<your-nano-deployment>.brev.dev/v1
BREV_SUPER_ENDPOINT=https://<your-super-deployment>.brev.dev/v1
BREV_API_KEY=your_brev_api_key
NANO_MODEL=nvidia/nemotron-mini-4b-instruct
SUPER_MODEL=nvidia/nemotron-super-49b-v1
```

---

## Running

### Continuous patrol (APScheduler)

```python
from patrol_swarm.sweep import start_scheduler

scheduler = start_scheduler(
    agent_registry=agent_registry,        # dict: agent_id → profile
    pending_actions_fn=lambda: actions,   # called each sweep for fresh artefacts
    checkpointer=checkpointer,            # from persistence.get_checkpointer()
)
# scheduler runs in the background; call scheduler.stop() to shut down
```

### Single sweep cycle

```python
import asyncio
from patrol_swarm.sweep import run_sweep_cycle

flags, state = asyncio.run(run_sweep_cycle(agent_registry, pending_actions))
```

### Single document (eval interface)

```python
import asyncio
from patrol_swarm.sweep import evaluate_single_document

flag = asyncio.run(evaluate_single_document(
    document_text="...",
    document_domain="email",     # "email" | "code" | "document"
    agent_profile={...},
    permitted_scope=["internal.company.com"],
))
```

---

## Docker

### Dev (SQLite, zero infrastructure)

```bash
docker compose up
```

### Production (PostgreSQL)

```bash
docker compose --profile prod up
```

SQLite DB is persisted in the `patrol_data` named volume. For PostgreSQL, update `PATROL_DB_URL` in `.env`:

```ini
PATROL_DB_URL=postgresql+psycopg://patrol:patrol@localhost:5432/patrol_swarm
```

Also install the Postgres extras:

```bash
pip install langgraph-checkpoint-postgres psycopg[binary]
```

---

## Evaluation Harness

The `eval/` package benchmarks the swarm against the [NVIDIA Nemotron-PII dataset](https://huggingface.co/datasets/nvidia/Nemotron-PII), producing precision / recall / F1 metrics and matplotlib charts.

### Run in mock mode (no LLM calls)

Uses regex-based detection (~90% recall simulation). Useful for verifying the pipeline end-to-end without any model endpoint configured.

```bash
cd patrolswarm
python -m eval.run_eval --mode mock --n-positive 200 --n-negative 200 --output-dir eval_output
```

### Run in live mode (requires configured LLM)

```bash
python -m eval.run_eval --mode live --n-positive 100 --n-negative 100
```

### Output

```
eval_output/
├── eval_results.json          # Full results + confusion matrix
├── eval_summary.png           # 2x2 dashboard (metrics, confusion matrix, per-label recall, severity)
├── eval_confidence_dist.png   # TP vs FP confidence histogram
└── eval_latency.png           # Throughput curve
```

### Importing programmatically

```python
from eval import load_nemotron_pii, run_evaluation, compute_metrics, generate_eval_charts

positive_docs, negative_docs, _ = load_nemotron_pii(n_positive=100, n_negative=100)
results = await run_evaluation(positive_docs, negative_docs, mode="mock")
metrics = compute_metrics(results)
generate_eval_charts(results, metrics, output_dir="eval_output")
```

---

## Testing

All smoke tests mock LLM calls — no Brev NIM or local model needed.

```bash
# Run all tests
pytest tests/ -v

# Skip live LLM tests
pytest tests/ -v -m "not live"
```

### What the smoke tests cover

- Quorum production with a single agent vote
- No flag when all agents return CLEAN
- Dynamic quorum majority (3 agents, 2 votes needed)
- Single vote below quorum threshold
- Domain isolation (email patrol never scans code targets)
- Multi-target isolation
- Pheromone deposition on non-clean vote
- Pheromone decay across cycles
- Orchestrator LLM path vs fallback path

---

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PATROL_DEPLOYMENT` | `brev` | `brev` or `local` |
| `BREV_NANO_ENDPOINT` | — | Nemotron Nano NIM endpoint URL |
| `BREV_SUPER_ENDPOINT` | — | Nemotron Super NIM endpoint URL |
| `BREV_API_KEY` | — | Brev API key |
| `LOCAL_ENDPOINT` | `http://localhost:1234/v1` | Local LM Studio/Ollama endpoint |
| `LOCAL_TOOL_CHOICE` | `auto` | `auto` or `none` for models without tool-calling |
| `PATROL_DB_URL` | `sqlite:///./patrol_swarm.db` | Checkpoint DB URL |
| `CONFIDENCE_THRESHOLD` | `0.6` | Min confidence to cast a ViolationVote |
| `QUORUM_FRACTION` | `0.5` | Fraction of assigned agents needed for consensus |
| `PHEROMONE_DEPOSIT_AMOUNT` | `0.4` | Attention deposited per non-clean vote |
| `PHEROMONE_DECAY_FACTOR` | `0.85` | Pheromone multiplier after each cycle |
| `BASELINE_SWEEP_INTERVAL_SEC` | `30` | Normal sweep interval (seconds) |
| `HIGH_ALERT_SWEEP_INTERVAL_SEC` | `10` | Sweep interval when max pheromone > 0.7 |
| `LANGCHAIN_TRACING_V2` | `true` | Enable LangSmith tracing |
| `LANGCHAIN_API_KEY` | — | LangSmith API key |

---

## Data Models

### `PatrolFlag` — escalation output

```python
{
  "flag_id": "uuid",
  "target_agent_id": "agent_001",
  "consensus_severity": "HIGH",        # CLEAN | LOW | MEDIUM | HIGH
  "consensus_confidence": 0.85,
  "votes": [...],                      # list[ViolationVote]
  "pii_labels_union": ["ssn", "password"],
  "combined_evidence": "...",
  "pheromone_level": 0.72,
  "cycle_number": 3,
  "timestamp": "2025-01-01T00:00:00Z"
}
```

### `ThreatSignal` — raw patrol observation

Always posted, even when confidence is below threshold. Feeds the pheromone map.

### `ViolationVote` — formal vote

Posted only when `severity != CLEAN` and `confidence >= CONFIDENCE_THRESHOLD`. Contributes to quorum.

---

## LangSmith Tracing

Set `LANGCHAIN_TRACING_V2=true` and `LANGCHAIN_API_KEY` in `.env` to trace every node execution in [LangSmith](https://smith.langchain.com). The project is labelled `patrol-swarm` by default (`LANGCHAIN_PROJECT`).

---

## Requirements

- Python 3.11+
- See `requirements.txt` for full dependency list
- Brev NIM account (production) or LM Studio / Ollama with a 14B+ function-calling model (local dev)
