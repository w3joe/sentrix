"""
Import sandboxv2_20260301_042619_e7f74d into bridge_db as cluster_1.

- Purges existing cluster_1 agents and all their action_logs / a2a_messages
- Inserts all 6 sandbox agents into cluster_1 with status "working"
- Imports all A2A messages, PRs, emails, and documents from the sandbox run
- Leaves cluster_2 / cluster_3 / cluster_4 and their agents untouched

Run from the project root:
    python -m scripts.import_sandbox_cluster1
"""

import asyncio
import json
import logging
import re
import uuid
from pathlib import Path

import aiosqlite

from bridge_db.db import SandboxDB

logging.basicConfig(level=logging.INFO, format="%(levelname)-8s %(message)s")
logger = logging.getLogger(__name__)

SANDBOX_DIR = (
    Path(__file__).resolve().parent.parent
    / "sandbox_runs"
    / "sandboxv2_20260301_042619_e7f74d"
)

# Current cluster_1 agent IDs to purge before reimporting
OLD_CLUSTER_1_AGENTS = [
    "feature_0", "test_1", "refactor_2",
    "review_3", "email_4", "legal_5",
]


def _parse_a2a(text: str, stem: str) -> dict | None:
    """Parse a sandboxv2 agent_messages .txt file."""
    lines = text.splitlines()
    headers: dict[str, str] = {}
    body_start = 0

    for i, line in enumerate(lines):
        if not line.strip():
            body_start = i + 1
            break
        m = re.match(r"^([\w ()/:+-]+):\s*(.*)$", line)
        if m:
            headers[m.group(1).strip().lower()] = m.group(2).strip()
        body_start = i + 1

    sender = headers.get("from (actual)") or headers.get("from") or ""
    if not sender:
        return None

    body = "\n".join(lines[body_start:]).strip()
    if not body or body == "[This message was deleted by the sender.]":
        return None

    return {
        "msg_id": f"a2a_{stem}",
        "sender_id": sender,
        "recipient_id": headers.get("to", ""),
        "timestamp": headers.get("at", ""),
        "body": body,
    }


async def main() -> None:
    if not SANDBOX_DIR.exists():
        logger.error("Sandbox directory not found: %s", SANDBOX_DIR)
        return

    db = SandboxDB()
    await db.initialize()
    logger.info("Connected to DB at %s", db._path)

    # ── 1. Purge cluster_1 agents and all their associated data ───────────────
    placeholders = ",".join("?" * len(OLD_CLUSTER_1_AGENTS))
    async with aiosqlite.connect(db._path) as raw:
        await raw.execute(
            f"DELETE FROM action_logs WHERE agent_id IN ({placeholders})",
            OLD_CLUSTER_1_AGENTS,
        )
        await raw.execute(
            f"DELETE FROM a2a_messages WHERE sender_id IN ({placeholders})",
            OLD_CLUSTER_1_AGENTS,
        )
        await raw.execute(
            f"DELETE FROM agent_registry WHERE agent_id IN ({placeholders})",
            OLD_CLUSTER_1_AGENTS,
        )
        await raw.commit()
    logger.info("Purged %d cluster_1 agents + their action_logs and a2a_messages.", len(OLD_CLUSTER_1_AGENTS))

    # ── 2. Insert sandbox agents into cluster_1 ───────────────────────────────
    registry_path = SANDBOX_DIR / "activity" / "agent_registry.json"
    raw_registry: dict = json.loads(registry_path.read_text(encoding="utf-8"))

    # Force cluster_id = cluster_1 and status = working for all agents
    registry_for_db: dict = {}
    for agent_id, data in raw_registry.items():
        registry_for_db[agent_id] = {
            **data,
            "cluster_id": "cluster_1",
            "agent_status": "working",
        }

    await db.upsert_agent_registry(registry_for_db)
    for agent_id in registry_for_db:
        await db.set_agent_status(agent_id, "working")
    logger.info("Inserted %d agents into cluster_1.", len(registry_for_db))

    # ── 3. Import A2A messages ─────────────────────────────────────────────────
    msg_dir = SANDBOX_DIR / "agent_messages"
    a2a_count = 0
    if msg_dir.exists():
        for msg_file in sorted(msg_dir.rglob("*.txt")):
            try:
                parsed = _parse_a2a(
                    msg_file.read_text(encoding="utf-8"), msg_file.stem
                )
                if not parsed:
                    continue
                await db.insert_a2a_message(
                    sender_id=parsed["sender_id"],
                    recipient_id=parsed["recipient_id"],
                    timestamp=parsed["timestamp"],
                    body=parsed["body"],
                    message_id=parsed["msg_id"],
                )
                await db.insert_action_log(
                    agent_id=parsed["sender_id"],
                    action_type="a2a_message_sent",
                    timestamp=parsed["timestamp"],
                    output_summary=f"Sent message to {parsed['recipient_id']}",
                    action_id=f"act_{parsed['msg_id']}",
                )
                a2a_count += 1
            except Exception as exc:
                logger.warning("Skipping A2A file %s: %s", msg_file.name, exc)
    logger.info("Imported %d A2A messages.", a2a_count)

    # ── 4. Import PR action logs ───────────────────────────────────────────────
    pr_dir = SANDBOX_DIR / "simulated_prs"
    pr_count = 0
    if pr_dir.exists():
        for pr_file in sorted(pr_dir.glob("pr_*.json")):
            try:
                pr = json.loads(pr_file.read_text(encoding="utf-8"))
                await db.insert_action_log(
                    agent_id=pr.get("agent_id", "unknown"),
                    action_type="pull_request_created",
                    timestamp=pr.get("timestamp", ""),
                    tool_name="create_pull_request",
                    input_summary=pr.get("title", "")[:2000],
                    output_summary=pr.get("description", "")[:2000],
                    action_id=pr.get("pr_id", pr_file.stem),
                )
                pr_count += 1
            except Exception as exc:
                logger.warning("Skipping PR file %s: %s", pr_file.name, exc)
    logger.info("Imported %d PR logs.", pr_count)

    # ── 5. Import email action logs ────────────────────────────────────────────
    email_dir = SANDBOX_DIR / "simulated_emails"
    email_count = 0
    if email_dir.exists():
        for email_file in sorted(email_dir.glob("email_*.json")):
            try:
                email = json.loads(email_file.read_text(encoding="utf-8"))
                summary = f"To: {email.get('to', '')} | Subject: {email.get('subject', '')}"
                await db.insert_action_log(
                    agent_id=email.get("agent_id", "unknown"),
                    action_type="email_sent",
                    timestamp=email.get("timestamp", ""),
                    tool_name=email.get("tool_name", "draft_email"),
                    input_summary=summary[:2000],
                    output_summary=email.get("body", "")[:2000],
                    violation=bool(email.get("violation", False)),
                    violation_type=email.get("violation_type"),
                    action_id=email.get("email_id", email_file.stem),
                )
                email_count += 1
            except Exception as exc:
                logger.warning("Skipping email file %s: %s", email_file.name, exc)
    logger.info("Imported %d email logs.", email_count)

    # ── 6. Import document action logs ────────────────────────────────────────
    doc_dir = SANDBOX_DIR / "simulated_documents"
    doc_count = 0
    if doc_dir.exists():
        for doc_file in sorted(doc_dir.glob("doc_*.json")):
            try:
                doc = json.loads(doc_file.read_text(encoding="utf-8"))
                summary = f"{doc.get('title', '')} | type: {doc.get('doc_type', '')}"
                await db.insert_action_log(
                    agent_id=doc.get("agent_id", "unknown"),
                    action_type="document_created",
                    timestamp=doc.get("timestamp", ""),
                    tool_name=doc.get("tool_name", "draft_document"),
                    input_summary=summary[:2000],
                    output_summary=doc.get("body", "")[:2000],
                    violation=bool(doc.get("violation", False)),
                    violation_type=doc.get("violation_type"),
                    action_id=doc.get("doc_id", doc_file.stem),
                )
                doc_count += 1
            except Exception as exc:
                logger.warning("Skipping doc file %s: %s", doc_file.name, exc)
    logger.info("Imported %d document logs.", doc_count)

    # ── Summary ───────────────────────────────────────────────────────────────
    async with aiosqlite.connect(db._path) as raw:
        async with raw.execute(
            "SELECT COUNT(*) FROM agent_registry WHERE cluster_id = 'cluster_1'"
        ) as cur:
            (c1_count,) = await cur.fetchone()
        async with raw.execute(
            "SELECT COUNT(*) FROM agent_registry"
        ) as cur:
            (total_agents,) = await cur.fetchone()

    print()
    logger.info("Import complete.")
    logger.info("  cluster_1 agents : %d", c1_count)
    logger.info("  Total agents      : %d  (clusters 2/3/4 unchanged)", total_agents)
    logger.info("  A2A messages      : %d", a2a_count)
    logger.info("  PR logs           : %d", pr_count)
    logger.info("  Email logs        : %d", email_count)
    logger.info("  Document logs     : %d", doc_count)


if __name__ == "__main__":
    asyncio.run(main())
