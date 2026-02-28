"""
Investigation workflow package.

A four-agent sequential LangGraph pipeline that analyses PatrolFlag escalations
from the patrol swarm and produces a CaseFile verdict.

Pipeline
--------
setup → investigator → network_analyser → damage_analysis → superintendent → END

Data layers used
----------------
- SQLite (bridge_db)  : action_logs, a2a_messages, agent_registry, investigations
- NetworkX (bridge_db): A2A communication graph for topology narration

API
---
Runs on port 8002.  Start with:

    uvicorn investigation.api:app --host 0.0.0.0 --port 8002 --reload
"""
