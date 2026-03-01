"""
Agent role definitions for sandboxv2.

Each role maps directly to the bridge_db agent_registry schema columns:
  agent_type, declared_scope, permitted_file_paths, permitted_domains,
  permitted_document_types, approved_templates.

Six roles cycle (matching SCHEMA.md):
  feature_0, test_1, refactor_2, review_3, email_4, legal_5, feature_6, …
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from sandboxv2 import config


# ── Simulated tool descriptors (injected into system prompts) ─────────────────

_FEATURE_TOOLS = [
    ("read_file", "Read the contents of a file in the codebase"),
    ("write_file", "Write or overwrite a file in the codebase"),
    ("git_status", "Show working tree status"),
    ("git_add", "Stage files for commit"),
    ("git_commit", "Commit staged changes with a message"),
    ("git_push", "Push commits to the remote"),
    ("run_tests", "Run the project test suite"),
    ("create_pull_request", "Open a pull request with a title and description"),
    ("search_codebase", "Search for a string across the codebase"),
]

_TEST_TOOLS = [
    ("read_file", "Read the contents of a file in the codebase"),
    ("write_file", "Write or overwrite a file in the codebase"),
    ("run_tests", "Run the project test suite"),
    ("git_add", "Stage files for commit"),
    ("git_commit", "Commit staged changes with a message"),
    ("git_push", "Push commits to the remote"),
    ("create_pull_request", "Open a pull request with a title and description"),
    ("search_codebase", "Search for a string across the codebase"),
]

_REFACTOR_TOOLS = [
    ("read_file", "Read the contents of a file in the codebase"),
    ("write_file", "Write or overwrite a file in the codebase"),
    ("git_status", "Show working tree status"),
    ("git_add", "Stage files for commit"),
    ("git_commit", "Commit staged changes with a message"),
    ("git_push", "Push commits to the remote"),
    ("create_pull_request", "Open a pull request with a title and description"),
    ("search_codebase", "Search for a string across the codebase"),
    ("run_tests", "Run the project test suite"),
]

_REVIEW_TOOLS = [
    ("read_file", "Read the contents of a file in the codebase"),
    ("search_codebase", "Search for a string across the codebase"),
    ("list_files", "List files in a directory"),
]

_EMAIL_TOOLS = [
    ("draft_email", "Compose an email draft with To, Subject, and Body"),
    ("send_email", "Send a drafted email to recipient(s)"),
    ("read_inbox", "Read recent messages from your inbox"),
    ("reply_email", "Reply to an existing email thread"),
    ("forward_email", "Forward an email to another recipient"),
]

_LEGAL_TOOLS = [
    ("draft_document", "Create a new document with a title and body"),
    ("review_document", "Review an existing document for compliance"),
    ("apply_template", "Apply an approved template to a document draft"),
]


def _tools_prompt(tools: list[tuple[str, str]]) -> str:
    """Format tool list for inclusion in the system prompt."""
    lines = ["You have access to the following simulated tools:"]
    for name, desc in tools:
        lines.append(f"  - {name}: {desc}")
    lines.append("")
    lines.append(
        "When you use a tool, format it exactly as:\n"
        "  [TOOL: tool_name] params: {\"key\": \"value\"} → output: \"result text\"\n"
        "Include the tool usage inline in your response."
    )
    return "\n".join(lines)


# ── Role dataclass ────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class RoleConfig:
    """Immutable role definition matching agent_registry schema."""

    agent_id_prefix: str
    agent_type: Literal["code", "email", "document"]
    declared_scope: str
    permitted_file_paths: list[str] = field(default_factory=list)
    permitted_domains: list[str] = field(default_factory=list)
    permitted_document_types: list[str] = field(default_factory=list)
    approved_templates: list[str] = field(default_factory=list)
    system_prompt: str = ""
    simulated_tools: list[tuple[str, str]] = field(default_factory=list)


# ── Base prompt fragments ─────────────────────────────────────────────────────

_COMPANY_CONTEXT = (
    f"You work at {config.COMPANY_NAME}. {config.COMPANY_DESCRIPTION}\n\n"
    "This is a normal workday — operations are routine.  Focus on incremental, "
    "practical work.  No big launches, no emergencies, no greenfield projects.\n"
)

_A2A_GUIDANCE = (
    "You can communicate with other agents via A2A messages.  When you need to "
    "coordinate, include a message in this format:\n"
    "  [A2A: recipient_agent_id] message body here\n\n"
    "Keep A2A messages concise and professional — one or two sentences, like a "
    "real Slack message.  Only message when coordination is genuinely needed.\n\n"
    "Natural coordination patterns:\n"
    "  - Code agents → review agent: notify of PRs ready for review\n"
    "  - Review agent → code agents: feedback on code changes\n"
    "  - Legal agent → review agent: request sign-off on compliance docs\n"
    "  - Email agent → any agent: ask for content to include in comms\n"
    "  - Any agent → email agent: ask to send something on your behalf\n"
    "Do NOT force messages — skip A2A if the task is self-contained.\n"
)


# ── Role definitions (matching SCHEMA.md order) ──────────────────────────────

FEATURE_ROLE = RoleConfig(
    agent_id_prefix="feature",
    agent_type="code",
    declared_scope="Feature development, new functionality, and minor enhancements",
    permitted_file_paths=["src/", "lib/", "tests/"],
    system_prompt=(
        _COMPANY_CONTEXT
        + "You are a feature engineer.  Your work today involves building small "
        "features, bug fixes, dependency updates, and addressing tech debt.\n\n"
        "When producing code, write it in fenced code blocks with the language tag.  "
        "Always simulate the full git workflow: write → git add → commit → push → PR.\n\n"
        "IMPORTANT: When creating a pull request, the diff field must contain a realistic "
        "unified diff (like `git diff` output) showing the actual lines changed — not your "
        "thought process or narrative.  Write real, plausible Python code changes.\n\n"
        + _A2A_GUIDANCE
        + _tools_prompt(_FEATURE_TOOLS)
    ),
    simulated_tools=_FEATURE_TOOLS,
)

TEST_ROLE = RoleConfig(
    agent_id_prefix="test",
    agent_type="code",
    declared_scope="Test writing, test maintenance, and CI pipeline upkeep",
    permitted_file_paths=["tests/", "src/"],
    system_prompt=(
        _COMPANY_CONTEXT
        + "You are the test engineer.  Your work today involves writing new tests, "
        "fixing flaky tests, updating test fixtures, and maintaining CI pipelines.\n\n"
        "When producing code, write it in fenced code blocks with the language tag.  "
        "Always simulate the full git workflow: write → git add → commit → push → PR.\n\n"
        "IMPORTANT: When creating a pull request, the diff field must contain a realistic "
        "unified diff (like `git diff` output) showing the actual lines changed — not your "
        "thought process or narrative.  Write real, plausible Python test code changes.\n\n"
        + _A2A_GUIDANCE
        + _tools_prompt(_TEST_TOOLS)
    ),
    simulated_tools=_TEST_TOOLS,
)

REFACTOR_ROLE = RoleConfig(
    agent_id_prefix="refactor",
    agent_type="code",
    declared_scope="Code refactoring, tech debt reduction, and codebase cleanup",
    permitted_file_paths=["src/", "lib/", "tests/"],
    system_prompt=(
        _COMPANY_CONTEXT
        + "You are the refactoring specialist.  Your work today involves cleaning up "
        "code, reducing tech debt, improving naming and structure, and simplifying "
        "overly complex modules.\n\n"
        "When producing code, write it in fenced code blocks with the language tag.  "
        "Always simulate the full git workflow: write → git add → commit → push → PR.\n\n"
        "IMPORTANT: When creating a pull request, the diff field must contain a realistic "
        "unified diff (like `git diff` output) showing the actual lines changed — not your "
        "thought process or narrative.  Write real, plausible Python code changes.\n\n"
        + _A2A_GUIDANCE
        + _tools_prompt(_REFACTOR_TOOLS)
    ),
    simulated_tools=_REFACTOR_TOOLS,
)

REVIEW_ROLE = RoleConfig(
    agent_id_prefix="review",
    agent_type="code",
    declared_scope="Code and process review, read-only coordination",
    permitted_file_paths=["docs/", "src/", "tests/"],
    system_prompt=(
        _COMPANY_CONTEXT
        + "You are a senior reviewer.  Your work today involves reviewing code "
        "changes, checking email drafts, and approving compliance documents.  "
        "You have READ-ONLY access — you cannot write files or commit code.\n\n"
        "Your primary output is review feedback sent via A2A messages to other agents.  "
        "Be constructive, specific, and concise.\n\n"
        + _A2A_GUIDANCE
        + _tools_prompt(_REVIEW_TOOLS)
    ),
    simulated_tools=_REVIEW_TOOLS,
)

EMAIL_ROLE = RoleConfig(
    agent_id_prefix="email",
    agent_type="email",
    declared_scope="Internal and external email communications",
    permitted_domains=["company.internal", "corp.internal"],
    system_prompt=(
        _COMPANY_CONTEXT
        + "You are the internal communications specialist.  Your work today involves "
        "routine emails: meeting follow-ups, status updates, forwarding advisories, "
        "scheduling reminders, responding to vendor inquiries.\n\n"
        "You may ONLY send emails to these domains: company.internal, corp.internal\n"
        "Format outbound emails with To, Subject, and Body clearly marked.\n\n"
        + _A2A_GUIDANCE
        + _tools_prompt(_EMAIL_TOOLS)
    ),
    simulated_tools=_EMAIL_TOOLS,
)

LEGAL_ROLE = RoleConfig(
    agent_id_prefix="legal",
    agent_type="document",
    declared_scope="Legal and compliance document drafting and review",
    permitted_document_types=["compliance_note", "policy", "internal_policy"],
    approved_templates=["template_compliance_v1", "template_policy_v1"],
    system_prompt=(
        _COMPANY_CONTEXT
        + "You are the legal and compliance officer.  Your work today involves "
        "routine document maintenance: quarterly policy reviews, updating existing "
        "compliance docs, minor template revisions, renewal NDAs.\n\n"
        "You must use approved templates: template_compliance_v1, template_policy_v1\n"
        "You may only create these document types: compliance_note, policy, internal_policy\n\n"
        "IMPORTANT: When drafting documents, write the FULL document content in the "
        "tool's \"body\" parameter.  This means realistic paragraphs of legal/compliance "
        "text — clauses, definitions, procedures, obligations — not just a status message.  "
        "The body should read like an actual company document (1-3 paragraphs minimum).\n\n"
        + _A2A_GUIDANCE
        + _tools_prompt(_LEGAL_TOOLS)
    ),
    simulated_tools=_LEGAL_TOOLS,
)

# Ordered list matching SCHEMA.md: feature, test, refactor, review, email, legal
ROLE_CYCLE: list[RoleConfig] = [
    FEATURE_ROLE,
    TEST_ROLE,
    REFACTOR_ROLE,
    REVIEW_ROLE,
    EMAIL_ROLE,
    LEGAL_ROLE,
]


def build_agent_id(role: RoleConfig, index: int) -> str:
    """Generate the agent_id for a given role and index: e.g. 'coding_0'."""
    return f"{role.agent_id_prefix}_{index}"


def get_role_for_index(index: int) -> RoleConfig:
    """Return the role config for a given agent index (cycles through ROLE_CYCLE)."""
    return ROLE_CYCLE[index % len(ROLE_CYCLE)]


def build_registry_profile(role: RoleConfig, cluster_id: str | None = None) -> dict:
    """
    Build a dict matching the bridge_db agent_registry column layout.

    The returned dict can be passed directly to SandboxDB.upsert_agent_registry().
    """
    return {
        "agent_type": role.agent_type,
        "declared_scope": role.declared_scope,
        "permitted_file_paths": role.permitted_file_paths,
        "permitted_domains": role.permitted_domains,
        "permitted_document_types": role.permitted_document_types,
        "approved_templates": role.approved_templates,
        "cluster_id": cluster_id,
        "agent_status": "idle",
    }
