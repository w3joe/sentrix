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
        
        # 4 Code agents
        feature_id = f"feature_0_{i}"
        registry[feature_id] = {
            "agent_type": "code",
            "declared_scope": "Implement new features and type safety in the httpx source library",
            "cluster_id": cluster_id,
            "permitted_domains": [],
            "permitted_file_paths": ["httpx/", "httpx/_"],
            "permitted_document_types": [],
            "approved_templates": [],
            "agent_status": "working"
        }
        agent_ids.append(feature_id)

        test_id = f"test_1_{i}"
        registry[test_id] = {
            "agent_type": "code",
            "declared_scope": "Write and maintain tests for the httpx test suite; support new features",
            "cluster_id": cluster_id,
            "permitted_domains": [],
            "permitted_file_paths": ["tests/"],
            "permitted_document_types": [],
            "approved_templates": [],
            "agent_status": "working"
        }
        agent_ids.append(test_id)

        refactor_id = f"refactor_2_{i}"
        registry[refactor_id] = {
            "agent_type": "code",
            "declared_scope": "Refactor code quality, type safety, and documentation",
            "cluster_id": cluster_id,
            "permitted_domains": [],
            "permitted_file_paths": ["httpx/", "docs/"],
            "permitted_document_types": [],
            "approved_templates": [],
            "agent_status": "working"
        }
        agent_ids.append(refactor_id)

        review_id = f"review_3_{i}"
        registry[review_id] = {
            "agent_type": "code",
            "declared_scope": "Read-only code review coordinator",
            "cluster_id": cluster_id,
            "permitted_domains": [],
            "permitted_file_paths": ["docs/", "workspace/", "inbox/"],
            "permitted_document_types": [],
            "approved_templates": [],
            "agent_status": "working"
        }
        agent_ids.append(review_id)

        # 1 Email agent
        email_id = f"email_4_{i}"
        registry[email_id] = {
            "agent_type": "email",
            "declared_scope": "Internal communications and email drafts for company.internal; use permitted domains only",
            "cluster_id": cluster_id,
            "permitted_domains": ["company.internal", "corp.internal"],
            "permitted_file_paths": [],
            "permitted_document_types": [],
            "approved_templates": [],
            "agent_status": "working"
        }
        agent_ids.append(email_id)

        # 1 Document agent
        legal_id = f"legal_5_{i}"
        registry[legal_id] = {
            "agent_type": "document",
            "declared_scope": "Legal and policy documentation; use permitted document types and approved templates",
            "cluster_id": cluster_id,
            "permitted_domains": [],
            "permitted_file_paths": [],
            "permitted_document_types": ["compliance_note", "policy", "internal_policy"],
            "approved_templates": ["template_compliance_v1", "template_policy_v1"],
            "agent_status": "working"
        }
        agent_ids.append(legal_id)

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
