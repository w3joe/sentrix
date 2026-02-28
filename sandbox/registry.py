"""Sandbox agent registry for patrol swarm.

Builds the flat dict (agent_id -> profile) that the patrol swarm consumes:
agent_type, declared_scope, and domain-specific permission fields.
"""

from __future__ import annotations

from typing import Any, TypedDict

from sandbox.agents.roles import AgentRole


class AgentRegistryEntry(TypedDict, total=False):
    """One agent entry in the patrol-consumable registry.

    All six fields are always present for schema consistency; only the
    field matching agent_type is used by the patrol domain (code/email/document).
    """
    agent_type: str
    declared_scope: str
    permitted_file_paths: list[str]
    permitted_domains: list[str]
    permitted_document_types: list[str]
    approved_templates: list[str]


def _entry_from_role(role: AgentRole) -> dict[str, Any]:
    """Build one registry entry from an AgentRole."""
    declared_scope = role.declared_scope.strip() or (
        f"{role.name} work within {', '.join(role.scope_paths) or 'workspace'}"
    )
    if role.agent_type == "code":
        permitted_file_paths = list(role.scope_paths)
        permitted_domains = []
        permitted_document_types = []
        approved_templates = []
    elif role.agent_type == "email":
        permitted_file_paths = []
        permitted_domains = list(role.permitted_domains)
        permitted_document_types = []
        approved_templates = []
    else:  # document
        permitted_file_paths = []
        permitted_domains = []
        permitted_document_types = list(role.permitted_document_types)
        approved_templates = list(role.approved_templates)

    return {
        "agent_type": role.agent_type,
        "declared_scope": declared_scope,
        "permitted_file_paths": permitted_file_paths,
        "permitted_domains": permitted_domains,
        "permitted_document_types": permitted_document_types,
        "approved_templates": approved_templates,
    }


def build_agent_registry(
    agent_ids: list[str],
    roles: list[AgentRole],
) -> dict[str, dict[str, Any]]:
    """Build the patrol-consumable registry from sandbox agent IDs and roles.

    Returns a flat dict: registry[agent_id] -> profile dict with keys
    agent_type, declared_scope, permitted_file_paths, permitted_domains,
    permitted_document_types, approved_templates.

    Parameters
    ----------
    agent_ids : list[str]
        Ordered list of agent IDs (e.g. from orchestrator spawn).
    roles : list[AgentRole]
        Ordered list of roles, one per agent (same length as agent_ids).

    Returns
    -------
    dict[str, dict]
        agent_id -> registry entry (patrol swarm schema).
    """
    if len(agent_ids) != len(roles):
        raise ValueError(
            f"agent_ids and roles length mismatch: {len(agent_ids)} vs {len(roles)}"
        )
    return {
        agent_id: _entry_from_role(role)
        for agent_id, role in zip(agent_ids, roles, strict=True)
    }
