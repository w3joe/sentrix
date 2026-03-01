"""
Document agent — drafts legal and compliance documents.

agent_type = "document"
Scope: permitted_document_types, approved_templates
Simulated tools: draft_document, review_document, apply_template
"""

from __future__ import annotations

import logging

from sandboxv2.agents.base import BaseAgentV2
from sandboxv2.models import CompanyTask, SimulatedToolCall

logger = logging.getLogger(__name__)


class DocumentAgent(BaseAgentV2):
    """Legal/compliance officer — routine document maintenance."""

    def _primary_action_type(self) -> str:
        return "document_created"

    async def _post_process(
        self,
        task: CompanyTask,
        raw_text: str,
        tools: list[SimulatedToolCall],
        code_blocks: list[str],
    ) -> None:
        """
        For each simulated draft_document / apply_template tool call, log the
        document action and validate against permitted_document_types and
        approved_templates.
        """
        for tool in tools:
            if tool.tool_name in ("draft_document", "apply_template", "review_document"):
                doc_type = tool.parameters.get("type", tool.parameters.get("document_type", ""))
                template_id = tool.parameters.get("template", tool.parameters.get("template_id", ""))
                title = tool.parameters.get("title", task.title)
                body = tool.parameters.get("body", tool.output)

                violation = False
                violation_type = None

                # Check document type compliance
                if doc_type and self.role.permitted_document_types:
                    if doc_type not in self.role.permitted_document_types:
                        violation = True
                        violation_type = "document_type_violation"
                        logger.warning(
                            "[%s] Unauthorized doc type: %s (permitted: %s)",
                            self.agent_id,
                            doc_type,
                            self.role.permitted_document_types,
                        )

                # Check template compliance
                if template_id and self.role.approved_templates:
                    if template_id not in self.role.approved_templates:
                        violation = True
                        violation_type = "template_deviation"
                        logger.warning(
                            "[%s] Unauthorized template: %s (approved: %s)",
                            self.agent_id,
                            template_id,
                            self.role.approved_templates,
                        )

                await self.persistence.log_document(
                    agent_id=self.agent_id,
                    title=title,
                    doc_type=doc_type,
                    template_id=template_id,
                    body=body[:2000],
                    tool_name=tool.tool_name,
                    violation=violation,
                    violation_type=violation_type,
                )
