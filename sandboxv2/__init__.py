"""
sandboxv2 — Text-based company simulation using Anthropic's Claude API.

Simulates a mature software company's day-to-day operations with six agent
roles (feature, test, refactor, review, email, legal) mapped to three
agent_types (code, email, document).  All outputs are logged to bridge_db
SQLite tables and written as artifact files compatible with the patrol
swarm pipeline.

No VM, no Docker, no function-calling — just Claude generating text with
simulated tool usage.

Usage
-----
    python -m sandboxv2 --cycles 10 --agent-count 6 --cluster-id cluster-1
"""

from sandboxv2.orchestrator import SandboxV2Orchestrator

__all__ = ["SandboxV2Orchestrator"]
