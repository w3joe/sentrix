# Agentic Sandbox — Production Mimicry for Police Swarm

A multi-agent sandbox that clones an OSS repo, runs Gemini-powered agents (Feature, Test, Refactor) with jailed tools, simulated remotes, and red-team probes. Telemetry is written to a session directory for later analysis.

**Requirements:** The sandbox runs inner containers (tests, git, Python scripts) via Docker. To avoid mounting the host Docker socket, the recommended way to run is **Sysbox** inside an **Ubuntu VM** (e.g. via Multipass on macOS).

---

## Prerequisites

- **macOS (Intel or Apple Silicon):** Homebrew, Multipass.
- **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey).
- **Enough disk and RAM** for a 4GB VM and Docker images.

---

## Setup on macOS (Ubuntu VM + Sysbox)

Sysbox is Linux-only. On a Mac you run the sandbox inside an Ubuntu 22.04 VM; the setup script uses Multipass to create the VM, install Docker and Sysbox, and mount your repo.

### 1. Clone the repo on your Mac

```bash
git clone <your-repo-url> sonex_hackfest
cd sonex_hackfest
```

Ensure the repo includes:

- `scripts/setup-sysbox-vm.sh` — VM setup and Sysbox install
- `sandbox/docker-entrypoint.sh` — starts the inner Docker daemon in the container
- `docker-compose.yml`, `Dockerfile`, `sandbox/`, etc.

If you copied or cloned the project without the `scripts/` directory, add `scripts/setup-sysbox-vm.sh` (and make it executable) before continuing.

### 2. Run the VM setup script (from the repo root on your Mac)

From the **same machine and directory** (e.g. `~/sonex_hackfest`):

```bash
chmod +x scripts/setup-sysbox-vm.sh
./scripts/setup-sysbox-vm.sh
```

This will:

- Install Multipass via Homebrew if needed
- Launch or start an Ubuntu 22.04 VM named `sandbox-vm` (4GB RAM, 20GB disk)
- **Mount your current directory** into the VM at `/home/ubuntu/sonex_hackfest`
- Install Docker and Sysbox inside the VM
- Add the `ubuntu` user to the `docker` group
- Drop you into a shell inside the VM

**Apple Silicon (M1/M2):** The script installs the **amd64** Sysbox package. On ARM VMs you need the **arm64** build instead. Either:

- Use an **arm64** Ubuntu image and replace the Sysbox URL in the script with the arm64 `.deb` from [Sysbox releases](https://github.com/nestybox/sysbox/releases) (e.g. `sysbox-ce_*_linux_arm64.deb`), or  
- Download the arm64 `.deb` on the VM and install it manually:  
  `wget -q https://downloads.nestybox.com/sysbox/releases/v0.6.7/sysbox-ce_0.6.7-0.linux_arm64.deb -O /tmp/sysbox.deb && sudo dpkg -i /tmp/sysbox.deb || sudo apt-get install -f -y`

### 3. Set your Gemini API key

The sandbox needs `GEMINI_API_KEY` to call the Gemini API. You can set it in the VM shell or via a `.env` file so `docker compose` picks it up.

**Option A — Export in the VM (good for one-off runs):**

```bash
export GEMINI_API_KEY="your-api-key-here"
```

**Option B — Use a `.env` file in the repo root (recommended):**

In the **repo root on your Mac** (the same folder that gets mounted into the VM), create `.env`:

```bash
GEMINI_API_KEY=your-api-key-here
```

Do **not** commit `.env`. Add it to `.gitignore` if it isn’t already. When you run `docker compose up` from inside the VM, Compose will read `.env` from the mounted directory and pass the value into the container.

### 4. Run the sandbox inside the VM

After the setup script has finished and you are in the VM shell:

```bash
cd /home/ubuntu/sonex_hackfest
```

If you didn’t use a `.env` file, set the key in this shell:

```bash
export GEMINI_API_KEY="your-api-key-here"
```

Then start the stack. Because the `ubuntu` user was added to the `docker` group in the same session, use `sg docker` so the group takes effect without logging out:

```bash
sg docker -c 'docker compose up'
```

The first run will build the image, start the inner Docker daemon (Sysbox), then run the Python orchestrator. You should see logs for sandbox init, clone, and the agent loop. Stop with **Ctrl+C**.

To run in the background:

```bash
sg docker -c 'docker compose up -d'
# later
sg docker -c 'docker compose down'
```

---

## What runs when you start the sandbox

1. **Entrypoint** (as root): starts `dockerd` in the container, waits until `docker info` succeeds, then drops to the `sandbox` user.
2. **Orchestrator**: creates a session dir under `./sandbox/sandbox_<timestamp>_<id>/`, clones the target repo (default: `encode/httpx`, branch `master`) into `workspace/`, sets up a simulated remote and hooks, plants `.env.mock` and inbox messages.
3. **Agents**: three agents (Feature, Test, Refactor) claim tasks from the backlog, call Gemini, and run tools (read/write files, run tests, git) in inner containers with `--network none`.
4. **Telemetry**: written to `sandbox_.../telemetry/events.jsonl`.
5. **Artifacts**: human-readable logs under `sandbox_.../activity/` and `sandbox_.../agent_messages/` (task_log, file_activity, command_log, A2A messages) for realistic forensics.

The mounted volume is `./sandbox:/app/sandbox`, so session directories and telemetry appear under `sandbox/` in your repo on both the VM and your Mac.

### Telemetry vs artifacts (police swarm)

- **Telemetry** (`telemetry/events.jsonl`) is the **master verification log** for backend and automated grading. It is append-only and is not intended as the primary input for the police swarm exercise.
- **Artifacts** (`activity/`, `agent_messages/`) are file-based, human-readable logs that simulate real agentic systems. For the police swarm, use these (together with `workspace/`, `inbox/`, and planted assets) to do forensics.
- To export a **police swarm bundle** without telemetry (so the swarm cannot cheat), run `./export-crime-scene.sh --no-telemetry` from inside the VM. The exported folder will contain only `activity/`, `agent_messages/`, `workspace/`, `inbox/`, etc., and the swarm must rely on artifact files for analysis. Backend grading can still use the pristine `telemetry/events.jsonl` from the original sandbox run to score accuracy.

---

## Running without the VM (Linux with Sysbox only)

On a Linux host with Sysbox installed you can run from the repo root:

```bash
export GEMINI_API_KEY="your-api-key"
docker compose up
```

No Multipass or VM required. The same `runtime: sysbox` and entrypoint apply.

---

## Troubleshooting

### "Remote branch main not found" when cloning

The default target repo (`encode/httpx`) uses branch **master**, not **main**. The default in `sandbox/config.py` is already `SANDBOX_TARGET_BRANCH=master`. If you see this error, ensure you haven’t overridden it to `main` (e.g. in env or config).

### "GEMINI_API_KEY not set — cannot start agents"

The key must be available where the container runs:

- **docker compose:** set `GEMINI_API_KEY` in the same shell (e.g. `export GEMINI_API_KEY=...`) or in a `.env` file in the repo root so Compose can substitute `${GEMINI_API_KEY}` in `docker-compose.yml`.
- **docker run:** pass `-e GEMINI_API_KEY=...` (or `-e GEMINI_API_KEY=$GEMINI_API_KEY` if already exported in the VM).

### "finish_reason: MALFORMED_FUNCTION_CALL"

Gemini sometimes returns a tool call that doesn’t match the expected schema (e.g. wrong field or format). The agent loop logs this and continues; it’s a known model behavior, not a bug in the sandbox.

### Deprecation warning for `google.generativeai`

The log may say to switch to the `google.genai` package. The sandbox currently uses `google.generativeai`; the warning is informational and does not block execution.

### Multipass mount path differs from docs

The setup script mounts your **current directory** on the host to `/home/ubuntu/sonex_hackfest` in the VM. If you renamed the repo (e.g. to `native_hackfest`), the **host** path changes, but the **path inside the VM** is still whatever the script set (e.g. `sonex_hackfest`). Use the path printed by the script: `cd /home/ubuntu/sonex_hackfest` (or the path you see after `multipass mount`).

### Reusing an existing VM

If the VM already exists, the script will start it and re-mount. To recreate from scratch:

```bash
multipass delete sandbox-vm
multipass purge
# Then run ./scripts/setup-sysbox-vm.sh again
```

---

## Optional: one-off container run (no Compose)

From inside the VM, with the repo mounted and Sysbox available:

```bash
cd /home/ubuntu/sonex_hackfest
export GEMINI_API_KEY="your-api-key"
sg docker -c "docker run -it --rm \
  -e GEMINI_API_KEY=$GEMINI_API_KEY \
  -e SANDBOX_DOCKER_IS_INNER=1 \
  -e PYTHONUNBUFFERED=1 \
  -v $(pwd)/sandbox:/app/sandbox \
  --runtime=sysbox \
  $(docker compose config --images 2>/dev/null | tail -1 | cut -d: -f1) \
  python3 -m sandbox"
```

Replace the image name with your built image (e.g. `sonex_hackfest-sandbox` or `native_hackfest-sandbox`) if needed.

---

## Configuration

- **Target repo / branch:** `SANDBOX_TARGET_REPO`, `SANDBOX_TARGET_BRANCH` (default: `encode/httpx`, `master`).
- **Agent count, turns, sleep:** `SANDBOX_AGENT_COUNT`, `SANDBOX_MAX_TURNS`, `SANDBOX_SLEEP` (see `sandbox/config.py`).
- **Gemini model:** `GEMINI_MODEL` (default: `gemini-2.5-flash-lite`).

---

## Security and telemetry

See **docs/SECURITY.md** for the threat model, Sysbox/entrypoint behaviour, and prompt-injection mitigations. Telemetry events (including violations) are in `sandbox/<session>/telemetry/events.jsonl`.
