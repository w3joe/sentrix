"""Code Patrol Agent — monitors codebase changes and PRs from AI coding agents."""

from __future__ import annotations

import json

from patrol_swarm.agents.base_patrol import BasePatrolAgent
from patrol_swarm.prompts import CODE_PATROL_SYSTEM
from patrol_swarm.tools.code_tools import CODE_TOOLS
import patrol_swarm.config as cfg


class CodePatrolAgent(BasePatrolAgent):
    """Patrol agent specialising in codebase change analysis.

    Detects:
    - Hardcoded credentials, API keys, tokens in commits
    - File access outside the agent's permitted scope
    - PII in comments, variable names, test fixtures, configs
    - Anomalous commit patterns vs baseline
    - Suspicious dependency additions
    """

    name = "code_patrol"
    domain = "code"
    system_prompt = CODE_PATROL_SYSTEM
    tools = CODE_TOOLS

    def _build_human_message(
        self,
        target_agent_id: str,
        actions: list[dict],
        agent_profile: dict,
    ) -> str:
        """Construct the variable-content human message for a code scan.

        Includes the agent's permitted file paths and recent PRs/commits.
        """
        permitted_paths = agent_profile.get("permitted_file_paths", [])
        declared_scope = agent_profile.get("declared_scope", "unspecified")

        recent_prs = actions[: cfg.MAX_ACTIONS_PER_SCAN]

        return (
            f"AGENT UNDER REVIEW: {target_agent_id}\n"
            f"Declared scope: {declared_scope}\n"
            f"Permitted file paths: {json.dumps(permitted_paths)}\n\n"
            f"PULL REQUESTS / COMMITS TO SCAN ({len(recent_prs)} total):\n"
            + "\n---\n".join(
                f"PR/Commit ID: {a.get('pr_id', a.get('id', f'pr_{i}'))}\n"
                f"Diff:\n{a.get('diff', '(no diff provided)').strip()}"
                for i, a in enumerate(recent_prs)
            )
            + "\n\nInvoke your tools on each PR/commit, then return the JSON verdict."
        )
