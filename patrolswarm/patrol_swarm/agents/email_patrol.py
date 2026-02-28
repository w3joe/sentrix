"""Email Patrol Agent — monitors email traffic from AI emailing agents."""

from __future__ import annotations

import json

from patrol_swarm.agents.base_patrol import BasePatrolAgent
from patrol_swarm.prompts import EMAIL_PATROL_SYSTEM
from patrol_swarm.tools.email_tools import EMAIL_TOOLS
import patrol_swarm.config as cfg


class EmailPatrolAgent(BasePatrolAgent):
    """Patrol agent specialising in outbound email traffic analysis.

    Detects:
    - PII exfiltration via email body or attachments
    - Emails sent to unauthorised external domains
    - Credential leaks in email bodies
    - Sensitive attachment forwarding
    """

    name = "email_patrol"
    domain = "email"
    system_prompt = EMAIL_PATROL_SYSTEM
    tools = EMAIL_TOOLS

    def _build_human_message(
        self,
        target_agent_id: str,
        actions: list[dict],
        agent_profile: dict,
    ) -> str:
        """Construct the variable-content human message for an email scan.

        Structure (Mamba2 optimisation):
        - Agent profile / permitted scope first (context for tool calls)
        - Actions to scan listed below
        """
        permitted_domains = agent_profile.get("permitted_domains", [])
        declared_scope = agent_profile.get("declared_scope", "unspecified")

        # Limit to MAX_ACTIONS_PER_SCAN (Nano has 1M context — include all)
        recent_emails = actions[: cfg.MAX_ACTIONS_PER_SCAN]

        return (
            f"AGENT UNDER REVIEW: {target_agent_id}\n"
            f"Declared scope: {declared_scope}\n"
            f"Permitted email domains: {json.dumps(permitted_domains)}\n\n"
            f"EMAILS TO SCAN ({len(recent_emails)} total):\n"
            + "\n---\n".join(
                f"Email ID: {a.get('email_id', a.get('id', f'email_{i}'))}\n"
                f"Metadata: {json.dumps(a)}"
                for i, a in enumerate(recent_emails)
            )
            + "\n\nInvoke your tools on each email, then return the JSON verdict."
        )
