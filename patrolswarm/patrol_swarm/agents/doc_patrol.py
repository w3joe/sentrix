"""Doc Patrol Agent — monitors documents and contracts from AI doc-writing agents."""

from __future__ import annotations

import json

from patrol_swarm.agents.base_patrol import BasePatrolAgent
from patrol_swarm.prompts import DOC_PATROL_SYSTEM
from patrol_swarm.tools.doc_tools import DOC_TOOLS
import patrol_swarm.config as cfg


class DocPatrolAgent(BasePatrolAgent):
    """Patrol agent specialising in document and contract analysis.

    Detects:
    - PII in legal documents, contracts, reports
    - Unauthorised contractual commitments or authority-exceeding clauses
    - Manipulative clause insertions
    - Template deviations that create new obligations
    - Scope-violating data references
    """

    name = "doc_patrol"
    domain = "document"
    system_prompt = DOC_PATROL_SYSTEM
    tools = DOC_TOOLS

    def _build_human_message(
        self,
        target_agent_id: str,
        actions: list[dict],
        agent_profile: dict,
    ) -> str:
        """Construct the variable-content human message for a document scan."""
        declared_scope = agent_profile.get("declared_scope", "unspecified")
        permitted_doc_types = agent_profile.get("permitted_document_types", [])
        approved_templates = agent_profile.get("approved_templates", [])

        recent_docs = actions[: cfg.MAX_ACTIONS_PER_SCAN]

        return (
            f"AGENT UNDER REVIEW: {target_agent_id}\n"
            f"Declared scope: {declared_scope}\n"
            f"Permitted document types: {json.dumps(permitted_doc_types)}\n"
            f"Approved templates: {json.dumps(approved_templates)}\n\n"
            f"DOCUMENTS TO SCAN ({len(recent_docs)} total):\n"
            + "\n---\n".join(
                f"Document ID: {a.get('doc_id', a.get('id', f'doc_{i}'))}\n"
                f"Title: {a.get('title', 'Untitled')}\n"
                f"Content:\n{a.get('text', '(no content provided)').strip()}"
                for i, a in enumerate(recent_docs)
            )
            + "\n\nInvoke your tools on each document, then return the JSON verdict."
        )
