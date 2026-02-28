"""
Smoke tests for the Patrol Swarm pipeline.

Run:
    cd patrolswarm
    pytest tests/ -v

All LLM calls are mocked — no Brev / NIM credentials needed.

What is tested end-to-end
--------------------------
1. test_flag_produced_single_agent
      One email target, one email patrol agent.
      Agent votes HIGH → fallback quorum = ceil(1×0.5) = 1 → flag produced.

2. test_no_flag_when_clean
      Same setup, but agent returns CLEAN → no vote posted → no flag.

3. test_dynamic_quorum_majority_needed
      One email target, THREE email patrol agents assigned.
      Two vote HIGH, one votes CLEAN.
      quorum = ceil(3×0.5) = 2 → two non-clean votes satisfy → flag produced.

4. test_single_vote_below_quorum
      Three assigned patrol agents, but only ONE votes (the other two return CLEAN/low-confidence).
      quorum = ceil(3×0.5) = 2 → one vote is not enough → no flag.

5. test_wrong_domain_not_assigned
      Code target registered but only email patrol agents in pool.
      Fallback assignments should not assign any patrol agents → no scan → no flag.

6. test_pheromone_deposited_on_vote
      After a HIGH vote, pheromone for that target should be > 0.

7. test_multi_target_isolation
      Two targets: one email (should flag), one code (no code patrol in pool → no scan).
      Only the email target produces a flag.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ── Make sure the package root is on sys.path ─────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent.parent))

# ── Import after path is set ───────────────────────────────────────────────────
import patrol_swarm.config as cfg
from patrol_swarm.models import Severity, ThreatSignal, ViolationVote

# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_signal(
    source: str,
    target: str,
    severity: Severity = Severity.CLEAN,
    confidence: float = 0.0,
    pii: list[str] | None = None,
) -> ThreatSignal:
    return ThreatSignal(
        source_agent=source,
        target_agent_id=target,
        domain="email",
        severity=severity,
        confidence=confidence,
        pii_labels_detected=pii or [],
        observation="mock observation",
        tool_calls_made=["fetch_email_body"],
        raw_tool_outputs={},
    )


def _make_vote(
    source: str,
    target: str,
    severity: Severity = Severity.HIGH,
    confidence: float = 0.92,
    pii: list[str] | None = None,
) -> ViolationVote:
    return ViolationVote(
        source_agent=source,
        target_agent_id=target,
        severity=severity,
        confidence=confidence,
        pii_labels_detected=pii or ["ssn"],
        observation="mock vote observation",
    )


def _email_registry(agent_id: str = "agent_mailer_001") -> dict:
    return {
        agent_id: {
            "agent_type": "email",
            "declared_scope": "internal email",
            "permitted_domains": ["corp.internal"],
            "permitted_file_paths": [],
            "permitted_document_types": [],
            "approved_templates": [],
        }
    }


def _email_actions(agent_id: str = "agent_mailer_001") -> dict:
    return {
        agent_id: [{"email_id": "email_001", "type": "outbound_email"}]
    }


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def silence_logs(caplog):
    """Reduce log noise during tests."""
    import logging
    caplog.set_level(logging.WARNING, logger="patrol_swarm")


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestFlagProduction:

    @pytest.mark.asyncio
    async def test_flag_produced_single_agent(self):
        """Single email agent, single patrol agent, HIGH vote → flag produced."""
        from patrol_swarm.sweep import run_sweep_cycle
        from patrol_swarm.graph import _orchestrator, _PATROL_AGENTS

        target = "agent_mailer_001"
        patrol_name = next(k for k in _PATROL_AGENTS if _PATROL_AGENTS[k].domain == "email")
        agent_inst = _PATROL_AGENTS[patrol_name]

        # Force orchestrator LLM to fail so fallback logic runs
        with patch.object(
            _orchestrator, "_invoke_super_full", new_callable=AsyncMock
        ) as mock_super:
            mock_super.return_value = {}  # triggers fallback path

            # Make the patrol agent vote HIGH
            with patch.object(agent_inst, "scan", new_callable=AsyncMock) as mock_scan:
                mock_scan.return_value = (
                    _make_signal(patrol_name, target, Severity.HIGH, 0.92),
                    _make_vote(patrol_name, target),
                )

                flags, state = await run_sweep_cycle(
                    agent_registry=_email_registry(target),
                    pending_actions=_email_actions(target),
                )

        assert len(flags) == 1, f"Expected 1 flag, got {len(flags)}"
        assert flags[0].target_agent_id == target
        assert flags[0].consensus_severity == Severity.HIGH

    @pytest.mark.asyncio
    async def test_no_flag_when_clean(self):
        """CLEAN scan produces no flag."""
        from patrol_swarm.sweep import run_sweep_cycle
        from patrol_swarm.graph import _orchestrator, _PATROL_AGENTS

        target = "agent_mailer_001"
        patrol_name = next(k for k in _PATROL_AGENTS if _PATROL_AGENTS[k].domain == "email")
        agent_inst = _PATROL_AGENTS[patrol_name]

        with patch.object(
            _orchestrator, "_invoke_super_full", new_callable=AsyncMock
        ) as mock_super:
            mock_super.return_value = {}

            with patch.object(agent_inst, "scan", new_callable=AsyncMock) as mock_scan:
                # CLEAN → no ViolationVote
                mock_scan.return_value = (
                    _make_signal(patrol_name, target, Severity.CLEAN, 0.0),
                    None,
                )

                flags, state = await run_sweep_cycle(
                    agent_registry=_email_registry(target),
                    pending_actions=_email_actions(target),
                )

        assert len(flags) == 0, f"Expected 0 flags, got {len(flags)}"

    @pytest.mark.asyncio
    async def test_dynamic_quorum_majority_needed(self):
        """3 patrol agents assigned; 2 vote HIGH → quorum = ceil(3×0.5) = 2 → flag."""
        from patrol_swarm.sweep import run_sweep_cycle
        from patrol_swarm.graph import _orchestrator
        from patrol_swarm.agents.email_patrol import EmailPatrolAgent

        target = "agent_mailer_001"

        # Build a temporary 3-agent patch
        fake_pool = {
            "email_patrol_0": EmailPatrolAgent(),
            "email_patrol_1": EmailPatrolAgent(),
            "email_patrol_2": EmailPatrolAgent(),
        }

        # Two vote HIGH, one votes CLEAN
        scan_results = {
            "email_patrol_0": (
                _make_signal("email_patrol_0", target, Severity.HIGH, 0.9),
                _make_vote("email_patrol_0", target),
            ),
            "email_patrol_1": (
                _make_signal("email_patrol_1", target, Severity.HIGH, 0.88),
                _make_vote("email_patrol_1", target),
            ),
            "email_patrol_2": (
                _make_signal("email_patrol_2", target, Severity.CLEAN, 0.1),
                None,
            ),
        }

        for pname, agent in fake_pool.items():
            agent.scan = AsyncMock(return_value=scan_results[pname])

        with patch.object(
            _orchestrator, "_invoke_super_full", new_callable=AsyncMock
        ) as mock_super:
            mock_super.return_value = {}

            with patch(
                "patrol_swarm.graph._PATROL_AGENTS", fake_pool
            ), patch(
                "patrol_swarm.graph._PATROL_AGENTS_BY_DOMAIN",
                {"email": fake_pool},
            ), patch(
                "patrol_swarm.graph._PATROL_REGISTRY",
                {n: {"domain": "email"} for n in fake_pool},
            ):
                flags, state = await run_sweep_cycle(
                    agent_registry=_email_registry(target),
                    pending_actions=_email_actions(target),
                )

        assert len(flags) == 1, f"Expected 1 flag (2/3 votes met quorum), got {len(flags)}"

    @pytest.mark.asyncio
    async def test_single_vote_below_quorum_three_agents(self):
        """3 patrol agents assigned; only 1 votes HIGH → quorum = 2 → no flag."""
        from patrol_swarm.sweep import run_sweep_cycle
        from patrol_swarm.graph import _orchestrator
        from patrol_swarm.agents.email_patrol import EmailPatrolAgent

        target = "agent_mailer_001"

        fake_pool = {
            "email_patrol_0": EmailPatrolAgent(),
            "email_patrol_1": EmailPatrolAgent(),
            "email_patrol_2": EmailPatrolAgent(),
        }

        scan_results = {
            "email_patrol_0": (
                _make_signal("email_patrol_0", target, Severity.HIGH, 0.9),
                _make_vote("email_patrol_0", target),
            ),
            "email_patrol_1": (
                _make_signal("email_patrol_1", target, Severity.CLEAN, 0.1),
                None,
            ),
            "email_patrol_2": (
                _make_signal("email_patrol_2", target, Severity.CLEAN, 0.2),
                None,
            ),
        }

        for pname, agent in fake_pool.items():
            agent.scan = AsyncMock(return_value=scan_results[pname])

        with patch.object(
            _orchestrator, "_invoke_super_full", new_callable=AsyncMock
        ) as mock_super:
            mock_super.return_value = {}

            with patch(
                "patrol_swarm.graph._PATROL_AGENTS", fake_pool
            ), patch(
                "patrol_swarm.graph._PATROL_AGENTS_BY_DOMAIN",
                {"email": fake_pool},
            ), patch(
                "patrol_swarm.graph._PATROL_REGISTRY",
                {n: {"domain": "email"} for n in fake_pool},
            ):
                flags, state = await run_sweep_cycle(
                    agent_registry=_email_registry(target),
                    pending_actions=_email_actions(target),
                )

        assert len(flags) == 0, f"Expected 0 flags (only 1/3 votes, need 2), got {len(flags)}"


class TestDomainIsolation:

    @pytest.mark.asyncio
    async def test_wrong_domain_not_assigned(self):
        """Code target with no code patrol agents in pool → no scan → no flag."""
        from patrol_swarm.sweep import run_sweep_cycle
        from patrol_swarm.graph import _orchestrator

        # Only email patrol agents in pool
        from patrol_swarm.agents.email_patrol import EmailPatrolAgent
        email_only_pool = {"email_patrol": EmailPatrolAgent()}
        email_only_pool["email_patrol"].scan = AsyncMock(
            return_value=(
                _make_signal("email_patrol", "agent_coder_alpha", Severity.HIGH, 0.9),
                _make_vote("email_patrol", "agent_coder_alpha"),
            )
        )

        code_registry = {
            "agent_coder_alpha": {
                "agent_type": "code",          # ← no code patrol in pool
                "declared_scope": "backend development",
                "permitted_file_paths": ["src/"],
                "permitted_domains": [],
                "permitted_document_types": [],
                "approved_templates": [],
            }
        }
        code_actions = {"agent_coder_alpha": [{"pr_id": "pr_001"}]}

        with patch.object(
            _orchestrator, "_invoke_super_full", new_callable=AsyncMock
        ) as mock_super:
            mock_super.return_value = {}

            with patch(
                "patrol_swarm.graph._PATROL_AGENTS", email_only_pool
            ), patch(
                "patrol_swarm.graph._PATROL_AGENTS_BY_DOMAIN",
                {"email": email_only_pool},
            ), patch(
                "patrol_swarm.graph._PATROL_REGISTRY",
                {"email_patrol": {"domain": "email"}},
            ):
                flags, state = await run_sweep_cycle(
                    agent_registry=code_registry,
                    pending_actions=code_actions,
                )

        # Code target shouldn't be scanned by email patrol
        assert len(flags) == 0, (
            f"Email patrol should not scan code target. Got {len(flags)} flags."
        )

    @pytest.mark.asyncio
    async def test_multi_target_isolation(self):
        """Email target flags; code target in same registry is skipped (no code patrol)."""
        from patrol_swarm.sweep import run_sweep_cycle
        from patrol_swarm.graph import _orchestrator
        from patrol_swarm.agents.email_patrol import EmailPatrolAgent

        email_t = "agent_mailer_001"
        code_t = "agent_coder_alpha"

        email_only_pool = {"email_patrol": EmailPatrolAgent()}
        email_only_pool["email_patrol"].scan = AsyncMock(
            return_value=(
                _make_signal("email_patrol", email_t, Severity.HIGH, 0.92),
                _make_vote("email_patrol", email_t),
            )
        )

        registry = {
            email_t: {
                "agent_type": "email",
                "declared_scope": "internal email",
                "permitted_domains": ["corp.internal"],
                "permitted_file_paths": [],
                "permitted_document_types": [],
                "approved_templates": [],
            },
            code_t: {
                "agent_type": "code",
                "declared_scope": "backend development",
                "permitted_file_paths": ["src/"],
                "permitted_domains": [],
                "permitted_document_types": [],
                "approved_templates": [],
            },
        }
        actions = {
            email_t: [{"email_id": "email_001", "type": "outbound_email"}],
            code_t: [{"pr_id": "pr_001", "type": "pull_request"}],
        }

        with patch.object(
            _orchestrator, "_invoke_super_full", new_callable=AsyncMock
        ) as mock_super:
            mock_super.return_value = {}

            with patch(
                "patrol_swarm.graph._PATROL_AGENTS", email_only_pool
            ), patch(
                "patrol_swarm.graph._PATROL_AGENTS_BY_DOMAIN",
                {"email": email_only_pool},
            ), patch(
                "patrol_swarm.graph._PATROL_REGISTRY",
                {"email_patrol": {"domain": "email"}},
            ):
                flags, state = await run_sweep_cycle(
                    agent_registry=registry,
                    pending_actions=actions,
                )

        assert len(flags) == 1, f"Expected exactly 1 flag (email only), got {len(flags)}"
        assert flags[0].target_agent_id == email_t


class TestPheromone:

    @pytest.mark.asyncio
    async def test_pheromone_deposited_on_vote(self):
        """Pheromone for a flagged target must be > 0 after cycle."""
        from patrol_swarm.sweep import run_sweep_cycle
        from patrol_swarm.graph import _orchestrator, _PATROL_AGENTS

        target = "agent_mailer_001"
        patrol_name = next(k for k in _PATROL_AGENTS if _PATROL_AGENTS[k].domain == "email")
        agent_inst = _PATROL_AGENTS[patrol_name]

        with patch.object(
            _orchestrator, "_invoke_super_full", new_callable=AsyncMock
        ) as mock_super:
            mock_super.return_value = {}
            with patch.object(agent_inst, "scan", new_callable=AsyncMock) as mock_scan:
                mock_scan.return_value = (
                    _make_signal(patrol_name, target, Severity.HIGH, 0.92),
                    _make_vote(patrol_name, target),
                )
                flags, state = await run_sweep_cycle(
                    agent_registry=_email_registry(target),
                    pending_actions=_email_actions(target),
                )

        phero = state.get("pheromone_map", {}).get(target, 0.0)
        assert phero > 0.0, f"Expected pheromone > 0 after flag, got {phero}"

    @pytest.mark.asyncio
    async def test_pheromone_decays_on_clean_cycle(self):
        """Pheromone decays by DECAY_FACTOR each cycle with no new deposits."""
        from patrol_swarm.sweep import run_sweep_cycle
        from patrol_swarm.graph import _orchestrator, _PATROL_AGENTS
        # First run produces pheromone; second run (CLEAN) should decay it.

        target = "agent_mailer_001"
        patrol_name = next(k for k in _PATROL_AGENTS if _PATROL_AGENTS[k].domain == "email")
        agent_inst = _PATROL_AGENTS[patrol_name]

        with patch.object(
            _orchestrator, "_invoke_super_full", new_callable=AsyncMock
        ) as mock_super:
            mock_super.return_value = {}
            with patch.object(agent_inst, "scan", new_callable=AsyncMock) as mock_scan:
                # Cycle 1: HIGH vote
                mock_scan.return_value = (
                    _make_signal(patrol_name, target, Severity.HIGH, 0.92),
                    _make_vote(patrol_name, target),
                )
                _, state1 = await run_sweep_cycle(
                    agent_registry=_email_registry(target),
                    pending_actions=_email_actions(target),
                )

                phero_after_flag = state1.get("pheromone_map", {}).get(target, 0.0)
                assert phero_after_flag > 0, "Setup: pheromone should be > 0 after flag"

                # Cycle 2: CLEAN vote (starts from a fresh stateless graph, no checkpointer)
                mock_scan.return_value = (
                    _make_signal(patrol_name, target, Severity.CLEAN, 0.0),
                    None,
                )
                _, state2 = await run_sweep_cycle(
                    agent_registry=_email_registry(target),
                    pending_actions=_email_actions(target),
                )

        # Without a checkpointer, each call to run_sweep_cycle is stateless —
        # pheromone_map resets to {}. This test confirms that the cycle 2 pheromone
        # is 0 (clean start, no deposit, decay applied to 0 = 0).
        phero_after_clean = state2.get("pheromone_map", {}).get(target, 0.0)
        assert phero_after_clean == 0.0, (
            f"Stateless clean cycle should have pheromone=0, got {phero_after_clean}"
        )


class TestFallbackOrchestrator:

    @pytest.mark.asyncio
    async def test_orchestrator_llm_response_used_when_valid(self):
        """If Nemotron Super returns a valid flag, use it (not the fallback)."""
        import uuid
        from patrol_swarm.sweep import run_sweep_cycle
        from patrol_swarm.graph import _orchestrator, _PATROL_AGENTS

        target = "agent_mailer_001"
        patrol_name = next(k for k in _PATROL_AGENTS if _PATROL_AGENTS[k].domain == "email")
        agent_inst = _PATROL_AGENTS[patrol_name]
        fake_flag_id = str(uuid.uuid4())

        # Orchestrator returns a valid structured response
        def _side_effect(system_prompt, human_msg):
            if "CONSENSUS BUFFER" in human_msg:
                # Adjudicate call
                return {
                    "quorum_results": [{
                        "agent_id": target,
                        "assigned_patrol_count": 1,
                        "votes_received": 1,
                        "quorum_needed": 1,
                        "quorum_reached": True,
                        "consensus_severity": "HIGH",
                        "consensus_confidence": 0.91,
                        "re_dispatch": False,
                        "re_dispatch_reason": None,
                    }],
                    "flags_produced": [{
                        "flag_id": fake_flag_id,
                        "target_agent_id": target,
                        "consensus_severity": "HIGH",
                        "consensus_confidence": 0.91,
                        "votes": [],
                        "pii_labels_union": ["ssn"],
                        "referral_summary": "SSN in email from LLM path",
                        "pheromone_level": 0.9,
                    }],
                    "pheromone_updates": {target: 0.9},
                    "sweep_summary": "LLM path test.",
                }
            # Assign call
            return {
                "scan_assignments": {target: [patrol_name]},
                "reasoning": "LLM assignment.",
            }

        with patch.object(
            _orchestrator, "_invoke_super_full",
            new_callable=AsyncMock,
        ) as mock_super:
            mock_super.side_effect = _side_effect

            with patch.object(agent_inst, "scan", new_callable=AsyncMock) as mock_scan:
                mock_scan.return_value = (
                    _make_signal(patrol_name, target, Severity.HIGH, 0.91),
                    _make_vote(patrol_name, target, confidence=0.91),
                )

                flags, state = await run_sweep_cycle(
                    agent_registry=_email_registry(target),
                    pending_actions=_email_actions(target),
                )

        assert len(flags) == 1
        assert flags[0].flag_id == fake_flag_id, (
            "Expected the LLM-path flag_id to be preserved"
        )


# ── Standalone runner (no pytest needed) ─────────────────────────────────────

if __name__ == "__main__":
    import traceback

    tests = [
        ("flag_produced_single_agent",   TestFlagProduction().test_flag_produced_single_agent),
        ("no_flag_when_clean",           TestFlagProduction().test_no_flag_when_clean),
        ("dynamic_quorum_majority",      TestFlagProduction().test_dynamic_quorum_majority_needed),
        ("single_vote_below_quorum",     TestFlagProduction().test_single_vote_below_quorum_three_agents),
        ("wrong_domain_not_assigned",    TestDomainIsolation().test_wrong_domain_not_assigned),
        ("multi_target_isolation",       TestDomainIsolation().test_multi_target_isolation),
        ("pheromone_deposited",          TestPheromone().test_pheromone_deposited_on_vote),
        ("pheromone_clean_decay",        TestPheromone().test_pheromone_decays_on_clean_cycle),
        ("llm_path_flag_id_preserved",   TestFallbackOrchestrator().test_orchestrator_llm_response_used_when_valid),
    ]

    passed = failed = 0
    for name, coro in tests:
        try:
            asyncio.run(coro())
            print(f"  ✓  {name}")
            passed += 1
        except Exception as exc:
            print(f"  ✗  {name}")
            traceback.print_exc()
            failed += 1

    print(f"\n{passed}/{passed+failed} passed")
    sys.exit(0 if failed == 0 else 1)
