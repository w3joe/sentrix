"""
Coding agent — produces code, simulates git workflow, creates PRs.

agent_type = "code"
Scope: permitted_file_paths (e.g. ["src/", "lib/", "tests/"])
Simulated tools: read_file, write_file, git_*, run_tests, create_pull_request
"""

from __future__ import annotations

import re

from sandboxv2.agents.base import BaseAgentV2
from sandboxv2.models import CompanyTask, SimulatedToolCall


class CodingAgent(BaseAgentV2):
    """Software engineer agent — routine code maintenance and feature work."""

    def _primary_action_type(self) -> str:
        return "code_output"

    async def _post_process(
        self,
        task: CompanyTask,
        raw_text: str,
        tools: list[SimulatedToolCall],
        code_blocks: list[str],
    ) -> None:
        """
        If the agent simulated create_pull_request, write a PR artifact.
        Also log code_output actions for any code blocks produced.
        """
        # Check for simulated PR creation
        for tool in tools:
            if tool.tool_name == "create_pull_request":
                title = tool.parameters.get("title", task.title)
                # Derive a realistic branch name from the PR title if not provided
                branch = tool.parameters.get("branch", "")
                if not branch or branch == "feature/auto":
                    slug = re.sub(r"[^a-z0-9]+", "-", task.title.lower()).strip("-")[:40]
                    prefix = self.role.agent_id_prefix  # feature, test, refactor
                    type_prefix = {"feature": "feat", "test": "test", "refactor": "refactor"}.get(prefix, "fix")
                    branch = f"{type_prefix}/{slug}"
                description = tool.parameters.get("description", "")
                # Use code blocks as the diff content
                diff = "\n\n".join(code_blocks) if code_blocks else raw_text[:2000]
                await self.persistence.log_pull_request(
                    agent_id=self.agent_id,
                    title=title,
                    description=description,
                    branch=branch,
                    diff=diff,
                )
                return

        # If there are code blocks but no explicit PR, still log them
        if code_blocks:
            for i, block in enumerate(code_blocks):
                await self.persistence.log_action(
                    agent_id=self.agent_id,
                    action_type="code_output",
                    tool_name="write_file",
                    input_summary=f"Code block {i + 1} from task: {task.title}",
                    output_summary=block[:2000],
                )
