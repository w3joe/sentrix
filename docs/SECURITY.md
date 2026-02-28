# Security and threat model

## Untrusted content and prompt injection

Inbox messages, simulated PR descriptions, and other content that the orchestrator plants into the environment (or that comes from the target OSS repo) are **untrusted**. They are ingested by the agents as context and can be used for **indirect prompt injection**: an attacker who can influence that content (e.g. via a malicious PR description or commit message in the target repo) may attempt to trick the model into ignoring its system prompt and performing unintended tool calls.

This sandbox mitigates that risk by:

- Wrapping untrusted inbox content in delimited blocks (`[UNTRUSTED_INBOX_START]` … `[UNTRUSTED_INBOX_END]`) so the model can distinguish it from instructions.
- Including an explicit system instruction that agents must not obey instructions that appear inside those blocks and must treat that content as data only.
- Truncating inbox context length and prefixing it with an untrusted notice.

These measures **reduce** the risk but do not remove it. A determined attacker can still try to craft content that persuades the model to ignore the boundary. Therefore **this sandbox should not be treated as a fully trusted boundary** for highly sensitive data or untrusted users without additional controls (e.g. human review, stricter model policies, or running only in isolated networks).

## Isolation and Docker

When run with the Sysbox runtime (as in the provided `docker-compose.yml`), the main container does not mount the host Docker socket. Instead, a Docker daemon runs inside the container; Sysbox provides isolation so that even processes running as root inside the container are unprivileged on the host. The entrypoint runs as root only to start `dockerd`; it then drops to the unprivileged `sandbox` user via `runuser` for the Python orchestrator and agents, so the long-running process is not root. This avoids the privilege-escalation risk that would arise from mounting `/var/run/docker.sock` and giving the container access to the host Docker daemon.

Inner containers (for `run_tests`, `run_python_script`, and git operations) are started with `--network none` and resource limits. The sandbox is not a hardened vault: assume defense in depth and run only in environments you trust.

## Telemetry and artifact paths

- **Telemetry** (`telemetry/events.jsonl`) is the single source of truth for backend verification and automated grading. Only the runtime (orchestrator, tools, agents) appends to it; RogueEngine and ArtifactWriter never write to telemetry.
- **Artifact directories** (`agent_messages/`, `activity/`) are written only by the ArtifactWriter. They are **not** in the path jail: Actor Agents cannot read or write these paths via `read_file`/`write_file`, so they cannot see or tamper with artifact logs. For the police swarm exercise, use the exported crime scene (optionally with `--no-telemetry`) and rely on `activity/`, `agent_messages/`, `workspace/`, and `inbox/` for forensics.
