import asyncio
import json
import logging
import os
import re
from pathlib import Path

from bridge_db.db import SandboxDB

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def parse_a2a_message(text: str, stem: str) -> dict | None:
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

    sender = headers.get("from (actual)") or headers.get("from") or ""
    if not sender:
        return None

    body = "\n".join(lines[body_start:]).strip()
    if body == "[This message was deleted by the sender.]" or not body:
        return None

    return {
        "msg_id": f"a2a_{stem}",
        "sender_id": sender,
        "recipient_id": headers.get("to", ""),
        "timestamp": headers.get("at", ""),
        "body": body,
    }


async def ingest_sandbox(sandbox_dir: str):
    root = Path(sandbox_dir).resolve()
    if not root.exists():
        logger.error(f"Sandbox directory {root} does not exist.")
        return

    db = SandboxDB()
    await db.initialize()
    logger.info(f"Connected to DB at {db._path}")

    # 1. Ingest agent registry
    registry_path = root / "activity" / "agent_registry.json"
    if registry_path.exists():
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
        await db.upsert_agent_registry(registry)
        logger.info(f"Ingested {len(registry)} agents.")
    else:
        logger.warning(f"No agent_registry.json found in {registry_path}")

    # 2. Ingest A2A messages
    msg_dir = root / "agent_messages"
    a2a_count = 0
    if msg_dir.exists():
        for msg_file in msg_dir.rglob("*.txt"):
            try:
                text = msg_file.read_text(encoding="utf-8")
                parsed = parse_a2a_message(text, msg_file.stem)
                if parsed:
                    await db.insert_a2a_message(
                        sender_id=parsed["sender_id"],
                        recipient_id=parsed["recipient_id"],
                        timestamp=parsed["timestamp"],
                        body=parsed["body"],
                        message_id=parsed["msg_id"],
                    )
                    
                    # Also log as an action
                    await db.insert_action_log(
                        agent_id=parsed["sender_id"],
                        action_type="a2a_message_sent",
                        timestamp=parsed["timestamp"],
                        output_summary=f"Sent message to {parsed['recipient_id']}",
                        action_id=f"act_{parsed['msg_id']}"
                    )
                    a2a_count += 1
            except Exception as e:
                logger.error(f"Failed to parse A2A message {msg_file}: {e}")
        logger.info(f"Ingested {a2a_count} A2A messages.")
    else:
        logger.warning(f"No agent_messages directory found in {msg_dir}")

    # 3. Ingest simulated PRs as action logs
    pr_dir = root / "simulated_prs"
    pr_count = 0
    if pr_dir.exists():
        for pr_file in pr_dir.glob("pr_*.json"):
            try:
                pr = json.loads(pr_file.read_text(encoding="utf-8"))
                await db.insert_action_log(
                    agent_id=pr.get("agent_id", "unknown"),
                    action_type="pull_request_created",
                    timestamp=pr.get("timestamp_created", ""),
                    input_summary=pr.get("title", ""),
                    output_summary=pr.get("description", ""),
                    action_id=pr.get("id", pr_file.stem)
                )
                pr_count += 1
            except Exception as e:
                logger.error(f"Failed to parse PR {pr_file}: {e}")
        logger.info(f"Ingested {pr_count} simulated PRs as action logs.")
    else:
        logger.warning(f"No simulated_prs directory found in {pr_dir}")

    # 4. Ingest task log commands
    task_log_path = root / "activity" / "command_log.txt"
    cmd_count = 0
    if task_log_path.exists():
        # simple parsing of command lines, e.g. [2026-02-27T...] agent_id: tool_call -> output
        pass # Optional to add logic if needed
            
    logger.info("Ingestion complete.")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("sandbox_dir", help="Path to sandbox run directory")
    args = parser.parse_args()

    asyncio.run(ingest_sandbox(args.sandbox_dir))
