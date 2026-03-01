"""
Review agent — read-only reviewer that provides feedback via A2A.

agent_type = "code" (read-only variant)
Scope: permitted_file_paths (docs/, src/, tests/) — no write permissions
Simulated tools: read_file, search_codebase, list_files
"""

from __future__ import annotations

from sandboxv2.agents.base import BaseAgentV2
from sandboxv2.models import CompanyTask, SimulatedToolCall


class ReviewAgent(BaseAgentV2):
    """Senior reviewer — reviews code, emails, and documents via A2A feedback."""

    def _primary_action_type(self) -> str:
        return "review_comment"

    async def _post_process(
        self,
        task: CompanyTask,
        raw_text: str,
        tools: list[SimulatedToolCall],
        code_blocks: list[str],
    ) -> None:
        """
        Extract the substantive review findings (stripping tool call noise)
        and log a clean review_comment action.
        """
        import re
        # Strip simulated tool calls and code blocks to get just the review prose
        clean = re.sub(
            r"\[TOOL:.*?→\s*output:\s*\".*?\"", "", raw_text, flags=re.DOTALL
        )
        clean = re.sub(r"```.*?```", "", clean, flags=re.DOTALL)
        clean = re.sub(r"\[A2A:.*?(?=\n\[|\Z)", "", clean, flags=re.DOTALL)
        clean = "\n".join(
            line for line in clean.splitlines()
            if line.strip() and not line.strip().startswith("[")
        ).strip()

        if clean:
            await self.persistence.log_action(
                agent_id=self.agent_id,
                action_type="review_finding",
                tool_name="review",
                input_summary=f"Review of: {task.title}"[:2000],
                output_summary=clean[:2000],
            )
