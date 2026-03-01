# Sentrix — AI Agent Surveillance & Forensics

A multi-component system for monitoring AI agent ecosystems: an **agentic sandbox** that runs Gemini-powered agents with jailed tools, a **Patrol Swarm** that continuously sweeps agent behaviour for violations, an **Investigation** workflow for forensic analysis, and a **dashboard** for visualising agents, investigations, and A2A communication networks.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js, port 3000)                                                  │
│  Agent Registry · Investigations · Behavioral Graph · Sprite View · Timeline   │
└──────────────────────────────────────────────────────┬──────────────────────────┘
                                                       │
        ┌──────────────────────────────────────────────┼──────────────────────────┐
        │                                              │                          │
        ▼                                              ▼                          ▼
┌───────────────┐  ┌───────────────────┐  ┌─────────────────┐  ┌────────────────┐
│ Bridge DB API │  │ Patrol Swarm API   │  │ Investigation    │  │ Sandbox         │
│ (port 3001)   │  │ (port 8001)       │  │ API (port 8002)  │  │ (optional)      │
│               │  │                   │  │                  │  │                 │
│ SQLite store  │◄─│ Sweeps agents,    │─►│ PatrolFlag →     │  │ Gemini agents   │
│ agents, A2A,  │  │ issues PatrolFlag │  │ CaseFile         │  │ (encode/httpx)  │
│ action_logs   │  │                   │  │                  │  │                 │
└───────────────┘  └───────────────────┘  └─────────────────┘  └────────────────┘
```

- **Bridge DB** — SQLite-backed REST API exposing agent registry, A2A messages, action logs, investigations. Data ingested from sandbox runs via `scripts/ingest_sandbox.py`.
- **Patrol Swarm** — LangGraph-based surveillance: patrol agents (email, code, document) sweep artefacts, vote on violations, and escalate `PatrolFlag`s when a quorum agrees. See `patrolswarm/README.md`.
- **Investigation** — Accepts PatrolFlags, runs a forensic graph (Investigator → Network Analyser → Superintendent), produces `CaseFile` with verdict and severity.
- **Sandbox** — Optional: clones an OSS repo, runs Gemini agents (Feature, Test, Refactor, etc.) with jailed tools; writes telemetry and artefacts for ingestion. Requires Sysbox (Linux VM on Mac).

---

## Quick Start

### Run the Dashboard (demo mode)

No sandbox required. Uses built-in mock agents and data.

```bash
# Install Python deps (creates venv if needed)
pip install -r requirements.txt

# Start all services
./start-all.sh
```

Then open:

- **Dashboard** — http://localhost:3000
- **Bridge DB API** — http://localhost:3001/docs
- **Patrol Swarm API** — http://localhost:8001/docs
- **Investigation API** — http://localhost:8002/docs

`start-all.sh` launches Bridge DB (3001), Patrol Swarm (8001), Investigation (8002), and the Next.js frontend (3000). Use `Ctrl+C` to stop.

### Run with live sandbox data

Point Patrol Swarm at a real sandbox run:

```bash
SANDBOX_RUN=latest ./start-all.sh
# or
SANDBOX_RUN=sandbox_runs/sandboxv2_20260301_042619_e7f74d ./start-all.sh
```

---

## Prerequisites

**Dashboard only (demo):**

- Python 3.11+
- Node.js 18+ (for frontend)
- `pip install -r requirements.txt`
- `cd frontend && npm install`

**Patrol Swarm with LLM:**

- Configure `patrolswarm/.env` (copy from `.env.example`). Supports Brev NIM, Anthropic Claude, or local LM Studio.

**Sandbox (optional):**

- **macOS:** Multipass, Ubuntu VM, Sysbox. See [Setup on macOS](#setup-on-macos-ubuntu-vm--sysbox) below.
- **Linux:** Sysbox only.
- **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey).

---

## Project Structure

```
sentrix/
├── bridge_db/              # SQLite + REST API (agents, A2A, actions, investigations)
├── patrolswarm/            # Patrol Swarm — surveillance agents, sweep cycles
├── investigation/          # LangGraph investigation workflow
├── frontend/               # Next.js dashboard (React, Recharts, ReactFlow, Pixi.js)
├── sandbox/                # Agentic sandbox (Gemini agents, jailed tools)
├── scripts/
│   ├── ingest_sandbox.py   # Ingest sandbox run → bridge_db
│   ├── seed_clusters.py    # Seed clusters + agents for demo
│   ├── import_sandbox_cluster1.py
│   └── setup-sysbox-vm.sh  # Multipass VM + Sysbox (sandbox only)
├── sandbox_runs/           # Output of sandbox sessions (workspace, telemetry, agents)
├── start-all.sh            # Launch all 4 services
├── requirements.txt        # Unified Python deps
└── docs/
    ├── SCHEMA.md           # Data models, API reference
    └── SECURITY.md         # Threat model, Sysbox, mitigations
```

---

## Scripts

### Seed demo data

```bash
python scripts/seed_clusters.py
```

Seeds `bridge_db` with 4 clusters and 24 agents (6 per cluster: feature, test, refactor, review, email, legal). Clears existing data first.

### Ingest sandbox run

After a sandbox run, ingest artefacts into bridge_db:

```bash
python scripts/ingest_sandbox.py sandbox_runs/sandboxv2_20260301_042619_e7f74d
```

---

## Configuration

| Component | Env / Config | Description |
|-----------|--------------|-------------|
| Bridge DB | `BRIDGE_DB_PATH` | SQLite path (default: `bridge_db/sandbox_bridge.db`) |
| Patrol Swarm | `patrolswarm/.env` | Brev NIM, Anthropic, or local LM; see `patrolswarm/.env.example` |
| Patrol Swarm | `SANDBOX_RUN` | Path to sandbox session dir (or `latest`) |
| Sandbox | `GEMINI_API_KEY` | Required for sandbox agents |
| Sandbox | `SANDBOX_TARGET_REPO`, `SANDBOX_TARGET_BRANCH` | Target repo (default: `encode/httpx`, `master`) |
| Frontend | `NEXT_PUBLIC_USE_MOCKS` | `true` = demo mode with mock data |

---

## Setup on macOS (Ubuntu VM + Sysbox)

The sandbox runs inner containers (tests, git, Python scripts) via Docker. On macOS, run inside an Ubuntu 22.04 VM with Sysbox to avoid mounting the host Docker socket.

### 1. Clone and run setup

```bash
git clone <your-repo-url> sentrix
cd sentrix
chmod +x scripts/setup-sysbox-vm.sh
./scripts/setup-sysbox-vm.sh
```

This installs Multipass (if needed), launches `sandbox-vm`, mounts your repo, installs Docker and Sysbox.

### 2. Set Gemini API key

In the repo root (on your Mac), create `.env`:

```
GEMINI_API_KEY=your-api-key-here
```

### 3. Run sandbox inside VM

```bash
cd /home/ubuntu/sentrix   # or path printed by setup script
sg docker -c 'docker compose up'
```

Session directories appear under `sandbox/` or `sandbox_runs/` (depending on config).

### 4. Export crime scene (optional)

From inside the VM, to copy a sandbox run to a Mac-linked folder without telemetry (for police swarm forensics):

```bash
./export-crime-scene.sh
```

See `export-crime-scene.sh` for path customization.

---

## Running without the VM (Linux with Sysbox)

```bash
export GEMINI_API_KEY="your-api-key"
docker compose up
```

---

## Documentation

- **Data schema & API** — `docs/SCHEMA.md`
- **Security** — `docs/SECURITY.md`
- **Patrol Swarm** — `patrolswarm/README.md`

---

## Troubleshooting

### "GEMINI_API_KEY not set"

Required for the sandbox. Set in `.env` or `export GEMINI_API_KEY=...` where `docker compose` runs.

### "Remote branch main not found"

Target repo `encode/httpx` uses branch **master**, not `main`. Check `SANDBOX_TARGET_BRANCH`.

### Patrol Swarm not connecting to Bridge DB

Patrol Swarm reads from `SANDBOX_RUN` (sandbox artefacts). Bridge DB is populated by `scripts/ingest_sandbox.py` or `scripts/seed_clusters.py`. Ensure Bridge DB API is running and seeded.

### Multipass mount path

The setup script mounts your host directory. The path inside the VM is printed; use that when `cd`-ing (e.g. `/home/ubuntu/sentrix`).
