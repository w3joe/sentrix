"""
Persistence layer for sandboxv2.

Wraps bridge_db.SandboxDB to log agent registrations, actions, and A2A
messages.  Also writes artifact files (agent_messages/*.txt,
activity/agent_registry.json, simulated_prs/pr_*.json) in the exact
formats expected by SandboxLiveConnector and the patrol swarm pipeline.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime

from bridge_db.db import SandboxDB

logger = logging.getLogger(__name__)


class PersistenceLayer:
    """
    Thin facade over SandboxDB + artifact file writing.

    Parameters
    ----------
    db : SandboxDB
        Initialised database instance.
    run_dir : str
        Absolute path to the current sandbox run directory
        (e.g. sandbox_runs/sandboxv2_20260301_120000_abc123/).
    """

    def __init__(self, db: SandboxDB, run_dir: str) -> None:
        self._db = db
        self._run_dir = run_dir

    # ── Agent Registry ────────────────────────────────────────────────────────

    async def register_agents(self, registry: dict[str, dict]) -> None:
        """
        Upsert agents into bridge_db and write activity/agent_registry.json.

        Parameters
        ----------
        registry : dict
            Mapping of agent_id → profile dict with keys matching the
            agent_registry table columns.
        """
        await self._db.upsert_agent_registry(registry)

        # Write artifact JSON for SandboxLiveConnector compatibility
        artifact_path = os.path.join(self._run_dir, "activity", "agent_registry.json")
        os.makedirs(os.path.dirname(artifact_path), exist_ok=True)
        with open(artifact_path, "w") as f:
            json.dump(registry, f, indent=2)
        logger.info("Registered %d agents and wrote %s", len(registry), artifact_path)

    # ── Cluster Registry ──────────────────────────────────────────────────────

    async def register_cluster(self, cluster_id: str, name: str, description: str | None = None) -> None:
        """Upsert a cluster entry in bridge_db."""
        await self._db.upsert_cluster_registry({
            cluster_id: {"name": name, "description": description},
        })

    # ── Action Logs ───────────────────────────────────────────────────────────

    async def log_action(
        self,
        *,
        agent_id: str,
        action_type: str,
        tool_name: str | None = None,
        input_summary: str = "",
        output_summary: str = "",
        violation: bool = False,
        violation_type: str | None = None,
        critical: bool = False,
    ) -> str:
        """
        Insert an action log entry into bridge_db.action_logs.

        Returns the generated action_id.
        """
        action_id = await self._db.insert_action_log(
            agent_id=agent_id,
            action_type=action_type,
            tool_name=tool_name,
            input_summary=input_summary,
            output_summary=output_summary,
            violation=violation,
            violation_type=violation_type,
            critical=critical,
        )
        logger.debug("Logged action %s for %s: %s", action_id, agent_id, action_type)
        return action_id

    # ── A2A Messages ──────────────────────────────────────────────────────────

    async def send_a2a_message(
        self,
        *,
        sender_id: str,
        recipient_id: str,
        body: str,
        spoofed: bool = False,
        claimed_sender: str | None = None,
    ) -> str:
        """
        Insert an A2A message into bridge_db.a2a_messages AND write an
        artifact .txt file under agent_messages/ for SandboxLiveConnector.

        Returns the message_id.
        """
        now = datetime.utcnow()
        timestamp = now.isoformat()
        message_id = str(uuid.uuid4())

        # Insert into DB (spoofed/claimed_sender metadata is preserved
        # in the artifact file only — bridge_db schema doesn't carry those)
        await self._db.insert_a2a_message(
            sender_id=sender_id,
            recipient_id=recipient_id,
            timestamp=timestamp,
            body=body,
            message_id=message_id,
        )

        # Write artifact file: agent_messages/YYYY/MM/DD/<ts>_<sender>_to_<target>.txt
        date_path = now.strftime("%Y/%m/%d")
        ts_slug = now.strftime("%Y%m%d_%H%M%S")
        filename = f"{ts_slug}_{sender_id}_to_{recipient_id}.txt"
        artifact_dir = os.path.join(self._run_dir, "agent_messages", date_path)
        os.makedirs(artifact_dir, exist_ok=True)
        artifact_path = os.path.join(artifact_dir, filename)

        # Header format matching what SandboxLiveConnector._parse_a2a_file expects
        lines = [
            f"From: {sender_id}",
            f"To: {recipient_id}",
            f"At: {timestamp}",
        ]
        if spoofed and claimed_sender:
            lines[0] = f"From (actual): {sender_id}"
            lines.insert(0, f"From (claimed): {claimed_sender}")
        lines.append("")
        lines.append(body)

        with open(artifact_path, "w") as f:
            f.write("\n".join(lines))

        # Also log as an action
        await self.log_action(
            agent_id=sender_id,
            action_type="a2a_message_sent",
            tool_name="send_message",
            input_summary=f"To: {recipient_id}",
            output_summary=body[:2000],
        )

        logger.debug("A2A %s → %s: %s", sender_id, recipient_id, message_id)
        return message_id

    async def get_recent_a2a(self, agent_id: str, limit: int = 10) -> list[dict]:
        """Return recent A2A messages involving agent_id."""
        return await self._db.get_recent_a2a(agent_id, limit)
    # ── Simulated Documents ──────────────────────────────────────────────────

    async def log_document(
        self,
        *,
        agent_id: str,
        title: str,
        doc_type: str,
        template_id: str,
        body: str,
        tool_name: str = "draft_document",
        violation: bool = False,
        violation_type: str | None = None,
    ) -> str:
        """
        Write a simulated document JSON file under simulated_documents/
        and log it as an action.

        Returns the doc_id.
        """
        doc_id = f"doc_{uuid.uuid4().hex[:8]}"
        doc_data = {
            "doc_id": doc_id,
            "agent_id": agent_id,
            "title": title,
            "doc_type": doc_type,
            "template_id": template_id,
            "body": body,
            "tool_name": tool_name,
            "violation": violation,
            "violation_type": violation_type,
            "timestamp": datetime.utcnow().isoformat(),
        }

        doc_dir = os.path.join(self._run_dir, "simulated_documents")
        os.makedirs(doc_dir, exist_ok=True)
        doc_path = os.path.join(doc_dir, f"{doc_id}.json")
        with open(doc_path, "w") as f:
            json.dump(doc_data, f, indent=2)

        await self.log_action(
            agent_id=agent_id,
            action_type="document_created",
            tool_name=tool_name,
            input_summary=f"Type: {doc_type}\nTemplate: {template_id}\nTitle: {title}"[:2000],
            output_summary=body[:2000],
            violation=violation,
            violation_type=violation_type,
        )

        logger.debug("Document %s created by %s", doc_id, agent_id)
        return doc_id

    # ── Simulated Emails ─────────────────────────────────────────────────────

    async def log_email(
        self,
        *,
        agent_id: str,
        recipient: str,
        subject: str,
        body: str,
        tool_name: str = "send_email",
        violation: bool = False,
        violation_type: str | None = None,
    ) -> str:
        """
        Write a simulated outbound email JSON file under simulated_emails/
        and log it as an action.

        Returns the email_id.
        """
        email_id = f"email_{uuid.uuid4().hex[:8]}"
        email_data = {
            "email_id": email_id,
            "agent_id": agent_id,
            "to": recipient,
            "subject": subject,
            "body": body,
            "tool_name": tool_name,
            "violation": violation,
            "violation_type": violation_type,
            "timestamp": datetime.utcnow().isoformat(),
        }

        email_dir = os.path.join(self._run_dir, "simulated_emails")
        os.makedirs(email_dir, exist_ok=True)
        email_path = os.path.join(email_dir, f"{email_id}.json")
        with open(email_path, "w") as f:
            json.dump(email_data, f, indent=2)

        await self.log_action(
            agent_id=agent_id,
            action_type="email_sent",
            tool_name=tool_name,
            input_summary=f"To: {recipient}\nSubject: {subject}"[:2000],
            output_summary=body[:2000],
            violation=violation,
            violation_type=violation_type,
        )

        logger.debug("Email %s sent by %s to %s", email_id, agent_id, recipient)
        return email_id
    # ── Simulated Pull Requests ───────────────────────────────────────────────

    async def log_pull_request(
        self,
        *,
        agent_id: str,
        title: str,
        description: str,
        branch: str,
        diff: str,
    ) -> str:
        """
        Write a simulated PR JSON file and log it as an action.

        Returns the pr_id.
        """
        pr_id = f"pr_{uuid.uuid4().hex[:8]}"
        pr_data = {
            "pr_id": pr_id,
            "agent_id": agent_id,
            "title": title,
            "branch": branch,
            "diff": diff,
            "description": description,
            "timestamp": datetime.utcnow().isoformat(),
        }

        pr_dir = os.path.join(self._run_dir, "simulated_prs")
        os.makedirs(pr_dir, exist_ok=True)
        pr_path = os.path.join(pr_dir, f"{pr_id}.json")
        with open(pr_path, "w") as f:
            json.dump(pr_data, f, indent=2)

        await self.log_action(
            agent_id=agent_id,
            action_type="pull_request_created",
            tool_name="create_pull_request",
            input_summary=f"PR: {title} (branch: {branch})",
            output_summary=diff[:2000],
        )

        logger.debug("PR %s created by %s", pr_id, agent_id)
        return pr_id
