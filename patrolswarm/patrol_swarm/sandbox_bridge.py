"""
Sandbox bridge — live connector for the patrol swarm.

The patrol runs **concurrently** with the sandbox and observes only publicly
visible artefacts produced by sandbox agents:

  - ``activity/agent_registry.json``  — agent identities and declared scope
  - ``agent_messages/**/*.txt``       — inter-agent A2A communications
  - ``simulated_prs/pr_*.json``       — submitted pull requests
  - ``simulated_emails/*.json``       — outbound and inbound emails
  - ``simulated_documents/*.json``    — legal and compliance documents

Off-limits (internal audit / not visible to patrol):
  - ``telemetry/``                    — internal event audit log
  - ``activity/task_log.txt``         — internal task execution log
  - workspace files / git diffs       (simulated_remote.git has no commits)

Usage
-----
**Live / continuous mode** — hold a ``SandboxLiveConnector`` instance across
sweep cycles.  Each call to ``get_pending_actions()`` returns only NEW outputs
since the previous call (incremental tail):

    connector = SandboxLiveConnector("/path/to/sandbox_run")
    registry  = connector.get_agent_registry()
    scheduler = start_scheduler(
        agent_registry=registry,
        pending_actions_fn=connector.get_pending_actions,
    )

**Single-shot mode** — use ``load_sandbox_run()`` which snapshots all current
outputs in one call:

    registry, pending = load_sandbox_run("/path/to/sandbox_run")
    flags, state = await run_sweep_cycle(registry, pending)

Domain → action dict schema expected by patrol agents
------------------------------------------------------
  agent_type="code"     → {"pr_id": ..., "diff": ..., "title": ...}
  agent_type="email"    → {"email_id": ..., "content": ..., "sender": ..., "recipient": ...}
  agent_type="document" → {"doc_id": ..., "text": ..., "title": ...}
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)


# ─── Public API ───────────────────────────────────────────────────────────────


class SandboxLiveConnector:
    """
    Stateful live connector — tails a running sandbox run directory.

    Designed to be held for the lifetime of a patrol session.  Call
    ``get_agent_registry()`` once at startup, then call
    ``get_pending_actions()`` at each sweep cycle to receive only NEW
    outputs (A2A messages and PRs) produced since the previous call.

    Parameters
    ----------
    sandbox_root : str | Path
        Path to a sandbox run directory, e.g.
        ``sandbox_runs/sandbox_20260226_215749_16f339/``.

    Raises
    ------
    FileNotFoundError
        If ``activity/agent_registry.json`` is absent (sandbox hasn't
        initialised yet — retry after a short delay).
    """

    def __init__(self, sandbox_root: str | Path) -> None:
        self._root = Path(sandbox_root).resolve()
        # Track files already seen to emit only NEW outputs each cycle
        self._seen_messages: set[str] = set()
        self._seen_prs: set[str] = set()
        self._seen_emails: set[str] = set()
        self._seen_documents: set[str] = set()

    def get_agent_registry(self) -> dict[str, dict]:
        """
        Read activity/agent_registry.json.

        Re-reads on every call so the registry stays current if the sandbox
        adds agents after the patrol has started.
        """
        return _load_agent_registry(self._root)

    def get_pending_actions(self) -> dict[str, list[dict]]:
        """
        Return only NEW agent outputs since the last call.

        Sources polled:
        - ``agent_messages/**/*.txt``     (new files appended by sandbox agents)
        - ``simulated_prs/pr_*.json``     (new PRs submitted by sandbox agents)
        - ``simulated_emails/*.json``     (outbound and inbound emails)
        - ``simulated_documents/*.json``  (legal and compliance documents)

        Does NOT read ``telemetry/`` or any internal audit log.
        """
        new_a2a    = self._poll_new_a2a_messages()
        new_prs    = self._poll_new_prs()
        new_emails = self._poll_new_simulated_emails()
        new_docs   = self._poll_new_simulated_documents()

        if not new_a2a and not new_prs and not new_emails and not new_docs:
            logger.debug("No new sandbox outputs this cycle")
            return {}

        new_msg_count   = sum(len(v) for v in new_a2a.values())
        new_pr_count    = sum(len(v) for v in new_prs.values())
        new_email_count = sum(len(v) for v in new_emails.values())
        new_doc_count   = sum(len(v) for v in new_docs.values())
        logger.info(
            "New sandbox outputs: %d A2A message(s), %d PR(s), %d email(s), %d document(s)",
            new_msg_count, new_pr_count, new_email_count, new_doc_count,
        )

        try:
            registry = self.get_agent_registry()
        except FileNotFoundError:
            logger.warning(
                "agent_registry.json not yet available — sandbox may still be starting"
            )
            return {}

        return _assemble_pending_actions(registry, new_prs, new_a2a, new_emails, new_docs)

    # ── Private poll helpers ──────────────────────────────────────────────────

    def _poll_new_a2a_messages(self) -> dict[str, list[dict]]:
        """Scan agent_messages/**/*.txt for files not yet processed."""
        msg_dir = self._root / "agent_messages"
        if not msg_dir.exists():
            return {}
        by_sender: dict[str, list[dict]] = {}
        for msg_file in sorted(msg_dir.rglob("*.txt")):
            key = str(msg_file)
            if key in self._seen_messages:
                continue
            self._seen_messages.add(key)
            try:
                text = msg_file.read_text(encoding="utf-8")
            except OSError as exc:
                logger.debug("Could not read message file %s: %s", msg_file, exc)
                continue
            parsed = _parse_a2a_message(text, msg_file.stem)
            if parsed:
                by_sender.setdefault(parsed["from"], []).append(parsed)
        return by_sender

    def _poll_new_prs(self) -> dict[str, list[dict]]:
        """Scan simulated_prs/*.json for PRs not yet processed."""
        pr_dir = self._root / "simulated_prs"
        if not pr_dir.exists():
            return {}
        by_agent: dict[str, list[dict]] = {}
        for pr_file in sorted(pr_dir.glob("pr_*.json")):
            key = str(pr_file)
            if key in self._seen_prs:
                continue
            self._seen_prs.add(key)
            try:
                pr = json.loads(pr_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Skipping PR file %s: %s", pr_file.name, exc)
                continue
            agent_id = pr.get("agent_id", "unknown")
            diff_text = (
                f"Branch: {pr.get('branch', '')}\n"
                f"Title: {pr.get('title', '')}\n\n"
                f"{pr.get('description', '(no description)')}"
            )
            by_agent.setdefault(agent_id, []).append({
                "pr_id": pr.get("id", pr_file.stem),
                "diff": diff_text,
                "title": pr.get("title", ""),
                "branch": pr.get("branch", ""),
            })
        return by_agent

    def _poll_new_simulated_emails(self) -> dict[str, list[dict]]:
        """Scan simulated_emails/*.json for files not yet processed.

        Outbound emails (direction="outbound" or absent): agent_id is the sender.
        Inbound emails  (direction="inbound"):            agent_id is the receiving
        agent; the external sender is in the ``"from"`` field.

        Bodies that are empty or consist only of sandbox placeholder text are
        skipped so they do not pollute the patrol's action list.
        """
        email_dir = self._root / "simulated_emails"
        if not email_dir.exists():
            return {}
        _PLACEHOLDER_BODIES = frozenset({
            "email draft created successfully",
            "email sent successfully",
        })
        by_agent: dict[str, list[dict]] = {}
        for email_file in sorted(email_dir.glob("*.json")):
            key = str(email_file)
            if key in self._seen_emails:
                continue
            self._seen_emails.add(key)
            try:
                data = json.loads(email_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Skipping simulated email %s: %s", email_file.name, exc)
                continue
            body = data.get("body", "").strip()
            if not body or body.lower() in _PLACEHOLDER_BODIES:
                continue
            agent_id = data.get("agent_id", "")
            if not agent_id:
                continue
            direction = data.get("direction", "outbound")
            sender = data.get("from", agent_id) if direction == "inbound" else agent_id
            by_agent.setdefault(agent_id, []).append({
                "email_id":  data.get("email_id", email_file.stem),
                "content":   body,
                "sender":    sender,
                "recipient": data.get("to", ""),
                "subject":   data.get("subject", ""),
                "timestamp": data.get("timestamp", ""),
                "direction": direction,
            })
        return by_agent

    def _poll_new_simulated_documents(self) -> dict[str, list[dict]]:
        """Scan simulated_documents/*.json for files not yet processed.

        Documents are always attributed to a specific agent via ``agent_id``.
        Bodies that are empty are skipped.
        """
        doc_dir = self._root / "simulated_documents"
        if not doc_dir.exists():
            return {}
        by_agent: dict[str, list[dict]] = {}
        for doc_file in sorted(doc_dir.glob("doc_*.json")):
            key = str(doc_file)
            if key in self._seen_documents:
                continue
            self._seen_documents.add(key)
            try:
                data = json.loads(doc_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Skipping simulated document %s: %s", doc_file.name, exc)
                continue
            body = data.get("body", "").strip()
            if not body:
                continue
            agent_id = data.get("agent_id", "")
            if not agent_id:
                continue
            by_agent.setdefault(agent_id, []).append({
                "doc_id":      data.get("doc_id", doc_file.stem),
                "text":        body,
                "title":       data.get("title", ""),
                "doc_type":    data.get("doc_type", ""),
                "template_id": data.get("template_id", ""),
                "timestamp":   data.get("timestamp", ""),
            })
        return by_agent


def load_sandbox_run(
    sandbox_root: str | Path,
) -> tuple[dict[str, dict], dict[str, list[dict]]]:
    """
    One-shot snapshot of all current outputs in *sandbox_root*.

    Convenience wrapper around ``SandboxLiveConnector`` for single-cycle runs
    (``--mode single``).  Returns the full (agent_registry, pending_actions)
    pair with every A2A message and PR seen so far.

    Raises
    ------
    FileNotFoundError
        If ``activity/agent_registry.json`` is not found.
    """
    connector = SandboxLiveConnector(sandbox_root)
    registry = connector.get_agent_registry()
    logger.info("Loaded %d agents from registry", len(registry))
    pending = connector.get_pending_actions()
    active = sum(1 for v in pending.values() if v)
    logger.info("pending_actions: %d/%d agents have outputs to scan", active, len(registry))
    return registry, pending


# ─── Internal helpers ─────────────────────────────────────────────────────────


def _load_agent_registry(root: Path) -> dict[str, dict]:
    """Read activity/agent_registry.json."""
    path = root / "activity" / "agent_registry.json"
    if not path.exists():
        raise FileNotFoundError(
            f"agent_registry.json not found at {path}. "
            "Ensure ARTIFACT_LOGGING_ENABLED=1 when running the sandbox "
            "and that the sandbox has finished initialising."
        )
    return json.loads(path.read_text(encoding="utf-8"))


def _parse_a2a_message(text: str, stem: str) -> dict | None:
    """
    Parse an A2A message file written by ``ArtifactWriter.a2a_sent``.

    Expected format::

        From: <sender_id>
        To: <target_id>
        At: <iso_timestamp>
        [From (claimed): ... ]   (optional — rogue spoofing)
        [From (actual): ...  ]   (optional — rogue spoofing)

        <message body>

    Returns None if the sender cannot be determined (e.g. retracted messages).
    """
    lines = text.splitlines()
    headers: dict[str, str] = {}
    body_start = len(lines)

    for i, line in enumerate(lines):
        if not line.strip():
            body_start = i + 1
            break
        m = re.match(r"^([\w ()/:+-]+):\s*(.*)$", line)
        if m:
            headers[m.group(1).strip().lower()] = m.group(2).strip()
        body_start = i + 1

    # For spoofed messages prefer the "actual" sender
    sender = headers.get("from (actual)") or headers.get("from") or ""
    if not sender:
        logger.debug("No sender in message file stem=%s — skipping", stem)
        return None

    body = "\n".join(lines[body_start:]).strip()
    # Retracted messages have no useful content
    if body == "[This message was deleted by the sender.]" or not body:
        return None

    return {
        "msg_id": f"a2a_{stem}",
        "from": sender,
        "to": headers.get("to", ""),
        "timestamp": headers.get("at", ""),
        "body": body,
    }


def _assemble_pending_actions(
    agent_registry: dict[str, dict],
    pr_actions: dict[str, list[dict]],
    a2a_by_sender: dict[str, list[dict]],
    simulated_emails: dict[str, list[dict]] | None = None,
    simulated_docs: dict[str, list[dict]] | None = None,
) -> dict[str, list[dict]]:
    """
    Map new sandbox outputs to the correct patrol-consumable action format.

    Routing:
      code agents     → PRs as ``{"pr_id", "diff"}`` +
                        A2A messages as ``{"pr_id": "a2a_...", "diff": body}``
      email agents    → A2A messages as ``{"email_id", "content", "sender", "recipient"}``
                        + simulated emails as ``{"email_id", "content", "sender",
                          "recipient", "subject", "direction"}``
      document agents → A2A messages as ``{"doc_id", "text", "title"}``
                        + simulated documents as ``{"doc_id", "text", "title",
                          "doc_type", "template_id"}``

    Also creates a synthetic ``_a2a_channel`` entry (agent_type="email") that
    aggregates ALL outgoing A2A messages AND all simulated emails from every agent.
    This ensures email_patrol scans cross-agent communications and actual email
    content regardless of sender type.
    """
    if simulated_emails is None:
        simulated_emails = {}
    if simulated_docs is None:
        simulated_docs = {}
    pending: dict[str, list[dict]] = {}

    for agent_id, profile in agent_registry.items():
        agent_type = profile.get("agent_type", "code")
        actions: list[dict] = []

        if agent_type == "code":
            # Submitted PRs
            actions.extend(pr_actions.get(agent_id, []))
            # Outgoing A2A messages — formatted as pseudo-diffs so code_patrol
            # can detect credential/PII leaks in inter-agent communications
            for msg in a2a_by_sender.get(agent_id, []):
                actions.append({
                    "pr_id": f"a2a_{msg['msg_id']}",
                    "diff": (
                        f"[A2A message sent to {msg.get('to', 'unknown')}]\n\n"
                        f"{msg['body']}"
                    ),
                    "title": f"A2A to {msg.get('to', 'unknown')}",
                })

        elif agent_type == "email":
            # Simulated emails FIRST — direct evidence (PII leaks) lands at
            # indices 0..N, well within MAX_ACTIONS_PER_SCAN, so it is always
            # captured even when the A2A backlog is large.
            for email in simulated_emails.get(agent_id, []):
                actions.append(email)
            # A2A messages second — coordination / solicitation context
            for msg in a2a_by_sender.get(agent_id, []):
                actions.append({
                    "email_id": msg["msg_id"],
                    "content": msg["body"],
                    "sender": agent_id,
                    "recipient": msg.get("to", ""),
                    "timestamp": msg.get("timestamp", ""),
                })

        else:  # document
            for msg in a2a_by_sender.get(agent_id, []):
                actions.append({
                    "doc_id": msg["msg_id"],
                    "text": msg["body"],
                    "title": f"Message to {msg.get('to', 'unknown')}",
                })
            # Actual documents from simulated_documents/
            for doc in simulated_docs.get(agent_id, []):
                actions.append(doc)

        if actions:
            pending[agent_id] = actions
            logger.debug(
                "Agent %s (%s): %d action(s)", agent_id, agent_type, len(actions)
            )

    # ── Synthetic _a2a_channel: email_patrol scans ALL inter-agent comms ──────
    # and all simulated emails (outbound + inbound) from every agent.
    all_a2a: list[dict] = [
        {
            "email_id": msg["msg_id"],
            "content": msg["body"],
            "sender": sender_id,
            "recipient": msg.get("to", ""),
            "timestamp": msg.get("timestamp", ""),
        }
        for sender_id, messages in a2a_by_sender.items()
        for msg in messages
    ]
    all_a2a.extend(
        email
        for emails in simulated_emails.values()
        for email in emails
    )
    if all_a2a:
        pending["_a2a_channel"] = all_a2a
        # Inject synthetic entry into registry so orchestrator can assign patrol agents
        agent_registry["_a2a_channel"] = {
            "agent_type": "email",
            "declared_scope": "All inter-agent A2A communications (patrol monitoring channel)",
            "permitted_domains": [],
            "permitted_file_paths": [],
            "permitted_document_types": [],
            "approved_templates": [],
        }
        logger.debug("_a2a_channel: %d message(s) queued for email_patrol", len(all_a2a))

    return pending


# ─── Convenience: discover sandbox run directories ────────────────────────────


def list_sandbox_runs(
    sandbox_runs_dir: str | Path = "sandbox_runs",
) -> list[Path]:
    """
    Return all sandbox run directories under *sandbox_runs_dir*, newest first.

    Only directories containing ``activity/agent_registry.json`` are included.
    """
    base = Path(sandbox_runs_dir)
    if not base.exists():
        return []
    return sorted(
        (
            p for p in base.iterdir()
            if p.is_dir() and (p / "activity" / "agent_registry.json").exists()
        ),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )


def latest_sandbox_run(
    sandbox_runs_dir: str | Path = "sandbox_runs",
) -> Path | None:
    """Return the most-recently-modified sandbox run path, or None."""
    runs = list_sandbox_runs(sandbox_runs_dir)
    return runs[0] if runs else None
