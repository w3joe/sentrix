"""
Pydantic models for sandboxv2 agent outputs and tasks.

These models are internal to the simulation.  The data that reaches bridge_db
is flattened into the column formats of agent_registry, a2a_messages, and
action_logs (see persistence.py).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SimulatedToolCall(BaseModel):
    """A tool invocation simulated in the agent's text output."""

    tool_name: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    output: str = ""


class AgentOutput(BaseModel):
    """Parsed result of a single agent task execution."""

    agent_id: str
    task_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    raw_text: str = ""
    simulated_tools: list[SimulatedToolCall] = Field(default_factory=list)
    code_blocks: list[str] = Field(default_factory=list)
    a2a_messages_sent: list[str] = Field(default_factory=list)  # recipient IDs


class CompanyTask(BaseModel):
    """A unit of work drawn from the backlog."""

    task_id: str
    title: str
    description: str
    agent_type: str  # "code" | "email" | "document"
    scope: str = ""  # additional context for the task
