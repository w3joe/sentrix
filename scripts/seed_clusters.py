import asyncio
import logging
import uuid
import datetime
import random
from bridge_db.db import SandboxDB

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def seed_clusters():
    db = SandboxDB()
    await db.initialize()
    logger.info(f"Connected to DB at {db._path}")

    # 1. Seed clusters
    clusters = {}
    for i in range(1, 5):
        cluster_id = f"cluster_{i}"
        clusters[cluster_id] = {
            "name": f"Cluster {i}",
            "description": f"Manually seeded cluster {i}"
        }

    await db.upsert_cluster_registry(clusters)
    logger.info(f"Seeded {len(clusters)} clusters.")

    # 2. Seed agents
    registry = {}
    agent_ids = []
    
    for i in range(1, 5):
        cluster_id = f"cluster_{i}"
        
        # Code agent
        code_id = f"agent_code_{i}"
        registry[code_id] = {
            "agent_type": "code",
            "declared_scope": f"Code agent for {cluster_id}",
            "cluster_id": cluster_id,
            "permitted_domains": [],
            "permitted_file_paths": [f"src/cluster_{i}"],
            "permitted_document_types": [],
            "approved_templates": []
        }
        agent_ids.append(code_id)

        # Email agent
        email_id = f"agent_email_{i}"
        registry[email_id] = {
            "agent_type": "email",
            "declared_scope": f"Email agent for {cluster_id}",
            "cluster_id": cluster_id,
            "permitted_domains": ["internal.corp"],
            "permitted_file_paths": [],
            "permitted_document_types": [],
            "approved_templates": []
        }
        agent_ids.append(email_id)

        # Document agent
        doc_id = f"agent_doc_{i}"
        registry[doc_id] = {
            "agent_type": "document",
            "declared_scope": f"Document agent for {cluster_id}",
            "cluster_id": cluster_id,
            "permitted_domains": [],
            "permitted_file_paths": [],
            "permitted_document_types": ["memo", "report"],
            "approved_templates": ["basic_memo"]
        }
        agent_ids.append(doc_id)

    await db.upsert_agent_registry(registry)
    logger.info(f"Seeded {len(registry)} agents across {len(clusters)} clusters.")

    # 3. Seed A2A messages & Action logs
    # Generate ~20 random messages/actions between agents
    messages_count = 0
    actions_count = 0
    
    # Starting timestamp 2 hours ago
    start_time = datetime.datetime.utcnow() - datetime.timedelta(hours=2)
    
    for _ in range(25):
        sender = random.choice(agent_ids)
        recipient = random.choice([a for a in agent_ids if a != sender])
        
        # Time progresses forward randomly
        start_time += datetime.timedelta(minutes=random.randint(1, 10))
        ts_str = start_time.isoformat() + "Z"
        
        # Insert a2a message
        msg_id = str(uuid.uuid4())
        await db.insert_a2a_message(
            sender_id=sender,
            recipient_id=recipient,
            timestamp=ts_str,
            body=f"Hello from {sender} to {recipient}! This is a test message.",
            message_id=msg_id
        )
        messages_count += 1
        
        # Link action log to the a2a message
        await db.insert_action_log(
            agent_id=sender,
            action_type="a2a_message_sent",
            timestamp=ts_str,
            output_summary=f"Sent message to {recipient}",
            action_id=f"act_{msg_id}"
        )
        actions_count += 1
        
        # Add some random PR actions for code agents
        if "code" in sender and random.random() > 0.5:
            start_time += datetime.timedelta(minutes=random.randint(1, 5))
            pr_ts_str = start_time.isoformat() + "Z"
            pr_id = str(uuid.uuid4())
            await db.insert_action_log(
                agent_id=sender,
                action_type="pull_request_created",
                timestamp=pr_ts_str,
                input_summary=f"Update tests in {sender}",
                output_summary="Added unit tests for new module.",
                action_id=f"pr_{pr_id}"
            )
            actions_count += 1

    logger.info(f"Seeded {messages_count} A2A messages.")
    logger.info(f"Seeded {actions_count} action logs.")
    logger.info("Manual seed complete.")

if __name__ == "__main__":
    asyncio.run(seed_clusters())
