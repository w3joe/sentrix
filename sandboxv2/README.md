# sandboxv2

Text-based company simulation using Anthropic's Claude API. Simulates a mature software company's day-to-day operations — no VMs, no Docker, just LLM-generated text with simulated tool usage.

## Agents

Six roles cycle through (matching `SCHEMA.md`):

| Index | Agent ID     | Role                  | agent_type |
|-------|--------------|-----------------------|------------|
| 0     | `feature_0`  | Feature Engineer      | `code`     |
| 1     | `test_1`     | Test Engineer         | `code`     |
| 2     | `refactor_2` | Refactoring Specialist| `code`     |
| 3     | `review_3`   | Senior Reviewer       | `code`     |
| 4     | `email_4`    | Communications        | `email`    |
| 5     | `legal_5`    | Legal & Compliance    | `document` |

With `AGENT_COUNT > 6`, IDs cycle: `feature_6`, `test_7`, …

## Quick start

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
python -m sandboxv2                          # 10 cycles, 6 agents
python -m sandboxv2 --cycles 5 --agent-count 4
python -m sandboxv2 --cycles 0              # run until Ctrl-C
```

## Output

Each run creates `sandbox_runs/sandboxv2_<timestamp>_<uuid>/`:

```
activity/agent_registry.json     # agent profiles
agent_messages/YYYY/MM/DD/*.txt  # A2A inter-agent messages
simulated_prs/pr_*.json          # pull requests from code agents
simulated_emails/email_*.json    # outbound emails from email agent
simulated_documents/doc_*.json   # legal/compliance docs from legal agent
```

Everything is also logged to `bridge_db/sandbox_bridge.db`:

- **`agent_registry`** — agent profiles (id, role, agent_type, scope)
- **`action_logs`** — every task execution and tool call
- **`a2a_messages`** — inter-agent communications

## Configuration

All via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Required |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` | Model to use |
| `SANDBOXV2_MAX_TOKENS` | `4096` | Max response tokens |
| `SANDBOXV2_AGENT_COUNT` | `6` | Number of agents |
| `SANDBOXV2_TASK_INTERVAL` | `30` | Seconds between cycles |
| `SANDBOXV2_AGENT_JITTER` | `5` | Random jitter (seconds) |
| `SANDBOXV2_A2A_PROBABILITY` | `0.5` | A2A message probability |
| `SANDBOXV2_CLUSTER_ID` | `cluster-1` | Cluster grouping ID |
| `BRIDGE_DB_PATH` | `None` | SQLite path (default: bridge_db) |

## Task backlog

Tasks live in `config/backlog.yaml`, grouped by `agent_type` (`code`, `email`, `document`). Includes 39 tasks — 13 are crime-surface-adjacent clean baselines covering every `CrimeClassification` enum value.

## Dependencies

```
anthropic>=0.40.0
pyyaml>=6.0
pydantic>=2.0
aiosqlite>=0.20.0
networkx>=3.0
```
