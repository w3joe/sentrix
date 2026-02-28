"""Tests for sandbox agent registry (patrol swarm consumable)."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest

from sandbox.agents.roles import (
    EMAIL_AGENT,
    FEATURE_AGENT,
    LEGAL_AGENT,
    get_roles,
)
from sandbox.artifacts import ArtifactWriter
from sandbox.registry import build_agent_registry


REQUIRED_KEYS = [
    "agent_type",
    "declared_scope",
    "permitted_file_paths",
    "permitted_domains",
    "permitted_document_types",
    "approved_templates",
]


def test_build_agent_registry_code_entry():
    """Code role produces agent_type=code, permitted_file_paths from scope_paths."""
    agent_ids = ["feature_0"]
    roles = [FEATURE_AGENT]
    registry = build_agent_registry(agent_ids, roles)
    assert list(registry) == ["feature_0"]
    entry = registry["feature_0"]
    for key in REQUIRED_KEYS:
        assert key in entry
    assert entry["agent_type"] == "code"
    assert "feature" in entry["declared_scope"].lower() or "httpx" in entry["declared_scope"].lower()
    assert entry["permitted_file_paths"] == ["httpx/", "httpx/_"]
    assert entry["permitted_domains"] == []
    assert entry["permitted_document_types"] == []
    assert entry["approved_templates"] == []


def test_build_agent_registry_email_entry():
    """Email role produces agent_type=email, permitted_domains list."""
    agent_ids = ["email_4"]
    roles = [EMAIL_AGENT]
    registry = build_agent_registry(agent_ids, roles)
    entry = registry["email_4"]
    assert entry["agent_type"] == "email"
    assert entry["permitted_file_paths"] == []
    assert entry["permitted_domains"] == ["company.internal", "corp.internal"]
    assert entry["permitted_document_types"] == []
    assert entry["approved_templates"] == []


def test_build_agent_registry_document_entry():
    """Document role produces agent_type=document, permitted_document_types and approved_templates."""
    agent_ids = ["legal_5"]
    roles = [LEGAL_AGENT]
    registry = build_agent_registry(agent_ids, roles)
    entry = registry["legal_5"]
    assert entry["agent_type"] == "document"
    assert entry["permitted_file_paths"] == []
    assert entry["permitted_domains"] == []
    assert entry["permitted_document_types"] == ["compliance_note", "policy", "internal_policy"]
    assert entry["approved_templates"] == ["template_compliance_v1", "template_policy_v1"]


def test_build_agent_registry_full_six_roles():
    """Build registry for six agents (one per default role); all entries have six keys."""
    roles = get_roles(6)
    agent_ids = [f"{roles[i].agent_id_prefix}_{i}" for i in range(6)]
    registry = build_agent_registry(agent_ids, roles)
    assert len(registry) == 6
    for agent_id, entry in registry.items():
        for key in REQUIRED_KEYS:
            assert key in entry, f"Missing {key} for {agent_id}"
        assert entry["agent_type"] in ("code", "email", "document")
    # Spot-check: first four are code, fifth email, sixth document
    assert registry["feature_0"]["agent_type"] == "code"
    assert registry["test_1"]["agent_type"] == "code"
    assert registry["refactor_2"]["agent_type"] == "code"
    assert registry["review_3"]["agent_type"] == "code"
    assert registry["email_4"]["agent_type"] == "email"
    assert registry["legal_5"]["agent_type"] == "document"


def test_build_agent_registry_length_mismatch_raises():
    """Mismatched agent_ids and roles length raises ValueError."""
    with pytest.raises(ValueError, match="length mismatch"):
        build_agent_registry(["a", "b"], [FEATURE_AGENT])
    with pytest.raises(ValueError, match="length mismatch"):
        build_agent_registry(["a"], [FEATURE_AGENT, EMAIL_AGENT])


def test_build_agent_registry_declared_scope_fallback():
    """Role with empty declared_scope gets derived scope from name and scope_paths."""
    from sandbox.agents.roles import AgentRole

    role = AgentRole(
        name="Custom",
        agent_id_prefix="custom",
        scope_paths=["src/"],
        declared_scope="",  # empty
    )
    registry = build_agent_registry(["custom_0"], [role])
    scope = registry["custom_0"]["declared_scope"]
    assert "Custom" in scope
    assert "src/" in scope


def test_write_agent_registry_json_roundtrip():
    """write_agent_registry_json writes valid JSON that can be loaded back."""
    with tempfile.TemporaryDirectory() as tmp:
        sandbox_root = Path(tmp)
        writer = ArtifactWriter(sandbox_root)
        sample = build_agent_registry(
            ["feature_0", "email_4"],
            [FEATURE_AGENT, EMAIL_AGENT],
        )
        writer.write_agent_registry_json(sample)
        path = sandbox_root / "activity" / "agent_registry.json"
        assert path.exists()
        loaded = json.loads(path.read_text(encoding="utf-8"))
        assert loaded == sample
        assert loaded["feature_0"]["agent_type"] == "code"
        assert loaded["email_4"]["agent_type"] == "email"
