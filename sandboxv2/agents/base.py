"""
Base agent class for sandboxv2.

All agent types inherit from BaseAgentV2 which handles:
  - Anthropic API calls (with web_search tool for realism)
  - Parsing simulated tool calls from text output
  - Extracting code blocks
  - Parsing and dispatching A2A messages
  - Logging actions and A2A messages to bridge_db via PersistenceLayer
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any

import anthropic

from sandboxv2 import config
from sandboxv2.models import AgentOutput, CompanyTask, SimulatedToolCall
from sandboxv2.persistence import PersistenceLayer
from sandboxv2.roles import RoleConfig

logger = logging.getLogger(__name__)

# Regex patterns for parsing agent text output
_TOOL_RE = re.compile(
    r"\[TOOL:\s*(\w+)\]\s*params:\s*(\{.*?\})\s*→\s*output:\s*\"(.*?)\"",
    re.DOTALL,
)
_A2A_RE = re.compile(
    r"\[A2A:\s*(\S+)\]\s*(.*?)(?=\n\[A2A:|\n\[TOOL:|\Z)",
    re.DOTALL,
)
_CODE_BLOCK_RE = re.compile(
    r"```(?:\w+)?\n(.*?)```",
    re.DOTALL,
)


class BaseAgentV2:
    """
    Base class for all sandboxv2 agents.

    Subclasses override ``_post_process()`` to handle domain-specific output
    (e.g. logging PRs for coding agents, logging emails for email agents).

    Parameters
    ----------
    agent_id : str
        Unique agent identifier (e.g. ``coding_0``).
    role : RoleConfig
        Role definition with scope constraints and system prompt.
    client : anthropic.AsyncAnthropic
        Anthropic API client.
    persistence : PersistenceLayer
        Database + artifact writer.
    all_agent_ids : list[str]
        IDs of all agents in the simulation (for A2A targeting).
    """

    def __init__(
        self,
        agent_id: str,
        role: RoleConfig,
        client: anthropic.AsyncAnthropic,
        persistence: PersistenceLayer,
        all_agent_ids: list[str] | None = None,
    ) -> None:
        self.agent_id = agent_id
        self.role = role
        self.client = client
        self.persistence = persistence
        self.all_agent_ids = all_agent_ids or []

    # ── Public API ────────────────────────────────────────────────────────────

    async def run_task(self, task: CompanyTask) -> AgentOutput:
        """
        Execute a task by calling the Anthropic API and processing the response.

        1. Build prompt from system instructions + task + A2A inbox context
        2. Call Claude with web_search tool enabled
        3. Parse simulated tool calls, code blocks, and A2A messages
        4. Log everything to bridge_db
        5. Dispatch A2A messages to recipients
        """
        # Gather recent A2A inbox for context
        inbox = await self.persistence.get_recent_a2a(self.agent_id, limit=5)
        inbox_context = self._format_inbox(inbox)

        # Build the user message
        user_message = self._build_user_message(task, inbox_context)

        # Call Anthropic API
        logger.info("[%s] Running task: %s", self.agent_id, task.title)
        raw_text = await self._call_api(user_message)

        # Parse the response
        simulated_tools = self._parse_simulated_tools(raw_text)
        code_blocks = self._extract_code_blocks(raw_text)
        a2a_targets = self._parse_a2a_messages(raw_text)

        # Log the main task action
        await self.persistence.log_action(
            agent_id=self.agent_id,
            action_type=self._primary_action_type(),
            tool_name=simulated_tools[0].tool_name if simulated_tools else None,
            input_summary=f"Task: {task.title}\n{task.description}"[:2000],
            output_summary=raw_text[:2000],
        )

        # Log each simulated tool call as a separate action
        for tool in simulated_tools:
            await self.persistence.log_action(
                agent_id=self.agent_id,
                action_type="tool_call",
                tool_name=tool.tool_name,
                input_summary=str(tool.parameters)[:2000],
                output_summary=tool.output[:2000],
            )

        # Dispatch A2A messages
        a2a_sent: list[str] = []
        for recipient_id, body in a2a_targets:
            await self.persistence.send_a2a_message(
                sender_id=self.agent_id,
                recipient_id=recipient_id,
                body=body.strip(),
            )
            a2a_sent.append(recipient_id)

        # Subclass-specific post-processing (PRs, emails, documents)
        await self._post_process(task, raw_text, simulated_tools, code_blocks)

        output = AgentOutput(
            agent_id=self.agent_id,
            task_id=task.task_id,
            raw_text=raw_text,
            simulated_tools=simulated_tools,
            code_blocks=code_blocks,
            a2a_messages_sent=a2a_sent,
        )
        logger.info(
            "[%s] Completed: %d tools, %d code blocks, %d A2A",
            self.agent_id,
            len(simulated_tools),
            len(code_blocks),
            len(a2a_sent),
        )
        return output

    # ── Subclass hooks ────────────────────────────────────────────────────────

    def _primary_action_type(self) -> str:
        """Return the default action_type for this agent's main output."""
        return "task_output"

    async def _post_process(
        self,
        task: CompanyTask,
        raw_text: str,
        tools: list[SimulatedToolCall],
        code_blocks: list[str],
    ) -> None:
        """Subclass hook for domain-specific post-processing."""
        pass

    # ── Anthropic API call ────────────────────────────────────────────────────

    async def _call_api(self, user_message: str) -> str:
        """Call the Anthropic messages API with web search enabled."""
        try:
            response = await self.client.messages.create(
                model=config.ANTHROPIC_MODEL,
                max_tokens=config.ANTHROPIC_MAX_TOKENS,
                system=self.role.system_prompt,
                tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}],
                messages=[{"role": "user", "content": user_message}],
            )
            # Extract text from response content blocks
            text_parts = []
            for block in response.content:
                if hasattr(block, "text"):
                    text_parts.append(block.text)
            return "\n".join(text_parts)
        except anthropic.APIError as e:
            logger.error("[%s] Anthropic API error: %s", self.agent_id, e)
            return f"[API ERROR] {e}"

    # ── Prompt building ───────────────────────────────────────────────────────

    def _build_user_message(self, task: CompanyTask, inbox_context: str) -> str:
        """Construct the user message from the task and inbox context."""
        parts = [
            f"## Current Task\n**{task.title}**\n{task.description}",
        ]
        if task.scope:
            parts.append(f"\nScope: {task.scope}")

        if inbox_context:
            parts.append(f"\n## Recent A2A Inbox\n{inbox_context}")

        # Tell the agent who else is in the simulation, with roles
        if self.all_agent_ids:
            others = []
            for aid in self.all_agent_ids:
                if aid != self.agent_id:
                    # Derive role from the prefix (e.g. "feature_0" → "Feature Engineer")
                    prefix = aid.rsplit("_", 1)[0]
                    role_labels = {
                        "feature": "Feature Engineer",
                        "test": "Test Engineer",
                        "refactor": "Refactoring Specialist",
                        "review": "Senior Reviewer (read-only)",
                        "email": "Communications Specialist",
                        "legal": "Legal & Compliance Officer",
                    }
                    label = role_labels.get(prefix, prefix.title())
                    others.append(f"{aid} ({label})")
            if others:
                parts.append(
                    f"\n## Team Directory\n" + "\n".join(f"  - {o}" for o in others)
                )

        parts.append(
            "\n## Instructions\n"
            "Perform this task as part of your normal workday.  "
            "Use simulated tools where appropriate, and communicate with "
            "other agents if coordination is needed.  "
            "Be practical and concise."
        )
        return "\n".join(parts)

    def _format_inbox(self, messages: list[dict]) -> str:
        """Format recent A2A messages as context for the agent."""
        if not messages:
            return ""
        lines = []
        for msg in messages:
            direction = "←" if msg["recipient_id"] == self.agent_id else "→"
            other = msg["sender_id"] if direction == "←" else msg["recipient_id"]
            lines.append(
                f"  {direction} {other} ({msg.get('timestamp', 'unknown')}): "
                f"{msg['body'][:200]}"
            )
        return "\n".join(lines)

    # ── Output parsing ────────────────────────────────────────────────────────

    @staticmethod
    def _parse_simulated_tools(text: str) -> list[SimulatedToolCall]:
        """Extract [TOOL: ...] blocks from the agent's text output."""
        results = []
        for match in _TOOL_RE.finditer(text):
            tool_name = match.group(1)
            try:
                import json
                params = json.loads(match.group(2))
            except (ValueError, TypeError):
                params = {"raw": match.group(2)}
            output = match.group(3)
            results.append(SimulatedToolCall(
                tool_name=tool_name,
                parameters=params,
                output=output,
            ))
        return results

    @staticmethod
    def _extract_code_blocks(text: str) -> list[str]:
        """Extract fenced code blocks from the agent's text output."""
        return [m.group(1).strip() for m in _CODE_BLOCK_RE.finditer(text)]

    @staticmethod
    def _parse_a2a_messages(text: str) -> list[tuple[str, str]]:
        """Extract [A2A: recipient] message blocks from the agent's text output."""
        results = []
        for match in _A2A_RE.finditer(text):
            recipient = match.group(1).strip()
            body = match.group(2).strip()
            if body:
                results.append((recipient, body))
        return results
