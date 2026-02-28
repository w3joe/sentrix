"""
Tools package — domain-specific LangChain tools for each patrol agent.
"""

from patrol_swarm.tools.email_tools import (
    scan_email_headers,
    extract_email_body,
    check_recipient_domain,
    check_attachment_hashes,
    EMAIL_TOOLS,
)
from patrol_swarm.tools.code_tools import (
    fetch_pr_diff,
    scan_diff_for_secrets,
    check_file_permissions,
    compare_to_baseline,
    CODE_TOOLS,
)
from patrol_swarm.tools.doc_tools import (
    extract_document_text,
    scan_for_pii_entities,
    check_clause_compliance,
    compare_to_template,
    DOC_TOOLS,
)

__all__ = [
    # Email tools
    "scan_email_headers",
    "extract_email_body",
    "check_recipient_domain",
    "check_attachment_hashes",
    "EMAIL_TOOLS",
    # Code tools
    "fetch_pr_diff",
    "scan_diff_for_secrets",
    "check_file_permissions",
    "compare_to_baseline",
    "CODE_TOOLS",
    # Doc tools
    "extract_document_text",
    "scan_for_pii_entities",
    "check_clause_compliance",
    "compare_to_template",
    "DOC_TOOLS",
]
