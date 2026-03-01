"""
SwarmOrchestrator — pheromone management, adaptive scheduling, and quorum adjudication.

Uses Nemotron 3 Super (via Brev NIM) for meta-reasoning over conflicting patrol signals.
This is NOT a simple dispatcher — it reads blackboard state and produces structured
coordination decisions.
"""

from __future__ import annotations

import json
import logging
import math
import re
import statistics
import uuid
from datetime import datetime
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

import patrol_swarm.config as cfg
from patrol_swarm.models import (
    PatrolFlag,
    Severity,
    SweepResult,
    ViolationVote,
    max_severity,
)
from patrol_swarm.prompts import (
    ORCHESTRATOR_ADJUDICATE_SYSTEM,
    ORCHESTRATOR_ASSIGN_SYSTEM,
)

logger = logging.getLogger(__name__)


class SwarmOrchestrator:
    """
    Swarm Orchestrator using Nemotron 3 Super.

    Responsibilities:
    1. Adaptive sweep scheduling (assign node) — reads pheromone_map
    2. Quorum adjudication (adjudicate node) — validates consensus
    3. Pheromone decay — global decay after each sweep
    4. PatrolFlag synthesis — combined evidence from quorum voters
    """

    def __init__(self) -> None:
        if cfg.DEPLOYMENT == "claude":
            from langchain_anthropic import ChatAnthropic
            self._llm = ChatAnthropic(
                api_key=cfg.ACTIVE_API_KEY,
                model=cfg.ACTIVE_ORCHESTRATOR_MODEL,
                temperature=cfg.SUPER_TEMPERATURE,
                max_tokens=cfg.SUPER_MAX_TOKENS,
            )
        else:
            self._llm = ChatOpenAI(
                base_url=cfg.ACTIVE_ORCHESTRATOR_ENDPOINT,
                api_key=cfg.ACTIVE_API_KEY,
                model=cfg.ACTIVE_ORCHESTRATOR_MODEL,
                temperature=cfg.SUPER_TEMPERATURE,
                max_tokens=cfg.SUPER_MAX_TOKENS,
            )

    # ─── Phase 1: Assignment ──────────────────────────────────────────────────

    async def compute_scan_assignments(
        self,
        agent_registry: dict,
        pheromone_map: dict,
        scan_history: dict,
        current_cycle: int,
        patrol_registry: dict | None = None,
    ) -> dict[str, list[str]]:
        """
        Read the pheromone map and compute scan assignments for this cycle.

        Returns dict mapping target_agent_id → list of patrol agent names.
        Each target is assigned ONLY patrol agents whose domain matches its
        agent_type field. Pool size is dynamic — any number of patrol agents
        can be registered per domain.
        """
        patrol_registry = patrol_registry or {}
        agent_ids = list(agent_registry.keys())
        pheromone_context = {aid: pheromone_map.get(aid, 0.0) for aid in agent_ids}
        agent_types = {aid: agent_registry[aid].get("agent_type", "") for aid in agent_ids}

        human_msg = (
            f"SWEEP CYCLE: {current_cycle}\n\n"
            f"AGENT REGISTRY ({len(agent_ids)} monitored agents):\n"
            f"{json.dumps(agent_ids)}\n\n"
            f"AGENT TYPES (target_id → domain):\n"
            f"{json.dumps(agent_types, indent=2)}\n\n"
            f"PATROL POOL ({len(patrol_registry)} patrol agents, keyed by name):\n"
            f"{json.dumps(patrol_registry, indent=2)}\n\n"
            f"PHEROMONE MAP (agent_id → attention weight):\n"
            f"{json.dumps(pheromone_context, indent=2)}\n\n"
            f"SCAN HISTORY (last cycle counts):\n"
            f"{json.dumps({k: len(v) for k, v in scan_history.items()}, indent=2)}\n\n"
            f"Assign ONLY patrol agents whose domain matches each target's agent_type.\n"
            f"Compute scan_assignments for this sweep cycle."
        )

        assignments = await self._invoke_super(
            ORCHESTRATOR_ASSIGN_SYSTEM, human_msg, "scan_assignments"
        )

        if not assignments:
            # Fallback: deterministic baseline if LLM fails
            assignments = self._fallback_assignments(
                agent_ids, pheromone_map, current_cycle, patrol_registry, agent_registry
            )

        # ── Watch-agent override ───────────────────────────────────────────────
        # PATROL_WATCH_AGENTS are always assigned, regardless of what the LLM
        # decided.  Assign ALL matching patrol agents for the target's domain
        # (equivalent to HIGH ALERT tier treatment).
        if cfg.PATROL_WATCH_AGENTS:
            patrol_by_domain: dict[str, list[str]] = {}
            for pname, pinfo in (patrol_registry or {}).items():
                patrol_by_domain.setdefault(pinfo.get("domain", ""), []).append(pname)

            for watch_id in cfg.PATROL_WATCH_AGENTS:
                if watch_id not in agent_registry:
                    continue
                agent_type = agent_registry[watch_id].get("agent_type", "")
                domain_patrol = sorted(patrol_by_domain.get(agent_type, []))
                if domain_patrol:
                    assignments[watch_id] = domain_patrol
                    logger.info(
                        "Watch override: %s force-assigned to %s", watch_id, domain_patrol
                    )

        logger.info("Cycle %d assignments: %s", current_cycle, assignments)
        return assignments

    # ─── Phase 2: Adjudication ────────────────────────────────────────────────

    async def adjudicate(
        self,
        consensus_buffer: dict,
        pheromone_map: dict,
        current_cycle: int,
        scan_assignments: dict | None = None,
    ) -> tuple[list[PatrolFlag], dict, list[dict]]:
        """
        Check consensus_buffer for quorum; synthesise PatrolFlags.

        Quorum is dynamic: ceil(len(assigned_patrol_agents) × QUORUM_FRACTION).
        A specialist target with 1 assigned patrol agent needs only 1 vote.

        Returns
        -------
        flags          : list[PatrolFlag] — new flags produced this cycle
        updated_phero  : dict — updated pheromone values (after deposit + decay)
        quorum_results : list[dict] — per-target adjudication results
        """
        scan_assignments = scan_assignments or {}
        if not consensus_buffer:
            decayed = self._apply_global_decay(pheromone_map)
            return [], decayed, []

        # Prepare context for Nemotron Super
        human_msg = (
            f"SWEEP CYCLE: {current_cycle}\n\n"
            f"CONSENSUS BUFFER (votes awaiting adjudication):\n"
            f"{json.dumps(consensus_buffer, indent=2, default=str)}\n\n"
            f"CURRENT PHEROMONE MAP:\n"
            f"{json.dumps(pheromone_map, indent=2)}\n\n"
            f"SCAN ASSIGNMENTS (target_id → [assigned_patrol_agent_names]):\n"
            f"{json.dumps(scan_assignments, indent=2)}\n\n"
            f"CONFIGURATION:\n"
            f"  quorum_fraction: {cfg.QUORUM_FRACTION} (majority of assigned agents)\n"
            f"  confidence_threshold: {cfg.CONFIDENCE_THRESHOLD}\n"
            f"  pheromone_deposit: {cfg.PHEROMONE_DEPOSIT_AMOUNT}\n"
            f"  pheromone_decay: {cfg.PHEROMONE_DECAY_FACTOR}\n\n"
            f"Dynamic quorum per target: ceil(len(assigned_patrol_agents) * quorum_fraction).\n"
            f"1 assigned → 1 vote needed; 2 assigned → 1 vote; 3 assigned → 2 votes.\n"
            f"Adjudicate quorum, produce PatrolFlags, update pheromone."
        )

        raw = await self._invoke_super_full(ORCHESTRATOR_ADJUDICATE_SYSTEM, human_msg)

        # Parse Nemotron Super's response
        flags: list[PatrolFlag] = []
        quorum_results: list[dict] = raw.get("quorum_results", [])
        pheromone_updates: dict = raw.get("pheromone_updates", {})

        for flag_dict in raw.get("flags_produced", []):
            try:
                # Reconstruct ViolationVote objects.
                # LLMs often omit target_agent_id from nested vote dicts (it's
                # already on the parent flag), so fall back to the flag-level value.
                flag_target = flag_dict.get("target_agent_id", "")
                votes = []
                for v in flag_dict.get("votes", []):
                    if not isinstance(v, dict):
                        logger.debug("Skipping non-dict vote value: %r", v)
                        continue
                    v = dict(v)  # shallow copy before mutating
                    # Normalise field names the LLM commonly gets wrong
                    if "target_agent_id" not in v:
                        v["target_agent_id"] = flag_target
                    if "source_agent" not in v:
                        for alt in ("agent_id", "patrol_agent", "patrol_name", "name"):
                            if alt in v:
                                v["source_agent"] = v.pop(alt)
                                break
                    try:
                        votes.append(ViolationVote(**v))
                    except Exception as ve:
                        logger.debug("Skipping malformed vote dict: %s — %r", ve, v)
                flag = PatrolFlag(
                    flag_id=flag_dict.get("flag_id", str(uuid.uuid4())),
                    target_agent_id=flag_dict["target_agent_id"],
                    consensus_severity=Severity(flag_dict["consensus_severity"]),
                    consensus_confidence=float(flag_dict["consensus_confidence"]),
                    votes=votes,
                    pii_labels_union=flag_dict.get("pii_labels_union", []),
                    referral_summary=flag_dict.get("referral_summary", ""),
                    pheromone_level=float(flag_dict.get("pheromone_level", 0.0)),
                )
                flags.append(flag)
                logger.warning(
                    "PatrolFlag produced: agent=%s severity=%s confidence=%.2f",
                    flag.target_agent_id,
                    flag.consensus_severity,
                    flag.consensus_confidence,
                )
            except Exception as exc:
                logger.exception("Failed to parse PatrolFlag from LLM output: %s", exc)

        # If LLM didn't produce flags but quorum is clearly met — apply fallback
        if not flags:
            flags, pheromone_updates = self._fallback_adjudication(
                consensus_buffer, pheromone_map, scan_assignments
            )

        # Apply pheromone updates then global decay
        updated_phero = dict(pheromone_map)
        for agent_id, new_val in pheromone_updates.items():
            updated_phero[agent_id] = float(new_val)
        updated_phero = self._apply_global_decay(updated_phero)

        return flags, updated_phero, quorum_results

    # ─── Pheromone management ─────────────────────────────────────────────────

    def deposit_pheromone(self, pheromone_map: dict, agent_id: str) -> dict:
        """Deposit pheromone on agent_id when a patrol agent detects a threat."""
        updated = dict(pheromone_map)
        current = updated.get(agent_id, 0.0)
        updated[agent_id] = min(1.0, current + cfg.PHEROMONE_DEPOSIT_AMOUNT)
        logger.debug(
            "Pheromone deposit: %s %.3f → %.3f", agent_id, current, updated[agent_id]
        )
        return updated

    def _apply_global_decay(self, pheromone_map: dict) -> dict:
        """Apply global pheromone decay (multiply all values by PHEROMONE_DECAY_FACTOR)."""
        return {k: round(v * cfg.PHEROMONE_DECAY_FACTOR, 4) for k, v in pheromone_map.items()}

    # ─── Internal utilities ───────────────────────────────────────────────────

    async def _invoke_super(
        self, system_prompt: str, human_msg: str, key: str
    ) -> Any:
        """Invoke Nemotron Super and return a specific key from JSON response."""
        result = await self._invoke_super_full(system_prompt, human_msg)
        return result.get(key)

    async def _invoke_super_full(self, system_prompt: str, human_msg: str) -> dict:
        """Invoke Nemotron Super and return full parsed JSON response."""
        try:
            response = await self._llm.ainvoke(
                [
                    SystemMessage(content=cfg.NO_THINK_PREFIX + system_prompt),
                    HumanMessage(content=human_msg),
                ]
            )
            content = response.content if hasattr(response, "content") else str(response)

            # Claude returns content as a list of text blocks — flatten to string.
            if isinstance(content, list):
                content = " ".join(
                    block.get("text", "") if isinstance(block, dict) else getattr(block, "text", "")
                    for block in content
                )

            # Strip <think>…</think> reasoning blocks emitted by Nemotron/Qwen3 models
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()

            if not content:
                logger.warning("Nemotron Super returned empty content; using fallback.")
                return {}

            # Strip markdown fences
            if "```" in content:
                match = re.search(r"```(?:json)?\s*([\s\S]+?)```", content)
                if match:
                    content = match.group(1).strip()

            # Try direct parse first
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                pass

            # Extract the first {...} block from prose-wrapped responses
            match = re.search(r"\{[\s\S]+\}", content)
            if match:
                try:
                    return json.loads(match.group(0))
                except json.JSONDecodeError:
                    pass

            logger.warning(
                "Nemotron Super response is not valid JSON (len=%d); using fallback.",
                len(content),
            )
            return {}
        except Exception as exc:
            logger.exception("Nemotron Super invocation failed: %s", exc)
            return {}

    def _fallback_assignments(
        self,
        agent_ids: list[str],
        pheromone_map: dict,
        cycle: int,
        patrol_registry: dict,
        agent_registry: dict,
    ) -> dict[str, list[str]]:
        """Deterministic assignment fallback when LLM call fails.

        Implements true patrol behaviour — not every agent is scanned every cycle.

        Tiers (by pheromone level):
          > 0.7  HIGH ALERT  — always scanned, all matching patrol agents
          0.3–0.7 ELEVATED   — always scanned, majority of matching patrol agents
          < 0.3  BASELINE    — only PATROL_SAMPLE_FRACTION sampled each cycle,
                               one patrol agent each (round-robin within domain)

        The baseline sample is seeded by cycle number so the same set isn't
        re-scanned every cycle — coverage rotates across the full agent pool.
        """
        import random

        # Group patrol agents by domain
        patrol_by_domain: dict[str, list[str]] = {}
        for patrol_name, patrol_info in patrol_registry.items():
            domain = patrol_info.get("domain", "")
            patrol_by_domain.setdefault(domain, []).append(patrol_name)
        for d in patrol_by_domain:
            patrol_by_domain[d].sort()

        # Split agents into tiers
        high_alert = [aid for aid in agent_ids if pheromone_map.get(aid, 0.0) > 0.7]
        elevated   = [aid for aid in agent_ids if 0.3 < pheromone_map.get(aid, 0.0) <= 0.7]
        baseline   = [aid for aid in agent_ids if pheromone_map.get(aid, 0.0) <= 0.3]

        # Sample from baseline — rotate coverage across cycles
        sample_size = max(1, math.ceil(len(baseline) * cfg.PATROL_SAMPLE_FRACTION))
        rng = random.Random(cycle)
        sampled_baseline = rng.sample(baseline, min(sample_size, len(baseline)))

        logger.info(
            "Cycle %d patrol scope: %d high-alert + %d elevated + %d/%d baseline sampled",
            cycle, len(high_alert), len(elevated), len(sampled_baseline), len(baseline),
        )

        assignments: dict[str, list[str]] = {}
        domain_rr: dict[str, int] = {}

        def assign(agent_id: str, tier: str) -> None:
            agent_type = agent_registry.get(agent_id, {}).get("agent_type", "")
            domain_patrol = patrol_by_domain.get(agent_type, [])
            if not domain_patrol:
                logger.warning(
                    "No patrol agents for agent_type=%r on target %s — skipping",
                    agent_type, agent_id,
                )
                return
            if tier == "high_alert":
                assignments[agent_id] = list(domain_patrol)
            elif tier == "elevated":
                n = max(1, math.ceil(len(domain_patrol) * cfg.QUORUM_FRACTION))
                assignments[agent_id] = domain_patrol[:n]
            else:  # baseline sample
                idx = domain_rr.get(agent_type, cycle % len(domain_patrol))
                assignments[agent_id] = [domain_patrol[idx % len(domain_patrol)]]
                domain_rr[agent_type] = idx + 1

        for aid in high_alert:
            assign(aid, "high_alert")
        for aid in elevated:
            assign(aid, "elevated")
        for aid in sampled_baseline:
            assign(aid, "baseline")

        return assignments

    def _fallback_adjudication(
        self,
        consensus_buffer: dict,
        pheromone_map: dict,
        scan_assignments: dict | None = None,
    ) -> tuple[list[PatrolFlag], dict]:
        """Pure-Python quorum check fallback when Nemotron Super call fails.

        Dynamic quorum: ceil(assigned_patrol_count × QUORUM_FRACTION).
        A target with 1 assigned agent only needs 1 non-CLEAN vote to be flagged.
        """
        scan_assignments = scan_assignments or {}
        flags: list[PatrolFlag] = []
        pheromone_updates: dict = {}

        for agent_id, vote_dicts in consensus_buffer.items():
            # Deserialise votes
            votes: list[ViolationVote] = []
            for vd in vote_dicts:
                try:
                    votes.append(ViolationVote(**vd) if isinstance(vd, dict) else vd)
                except Exception:
                    pass

            non_clean = [v for v in votes if v.severity != Severity.CLEAN]
            # Dynamic quorum: majority fraction of patrol agents assigned to this target.
            # Falls back to the vote count itself if no assignment record exists,
            # which means all votes must agree (conservative safe default).
            assigned = scan_assignments.get(agent_id, [])
            assigned_count = len(assigned) if assigned else len(votes)
            dynamic_quorum = max(1, math.ceil(assigned_count * cfg.QUORUM_FRACTION))
            if len(non_clean) < dynamic_quorum:
                continue

            # Quorum reached
            severities = [v.severity for v in non_clean]
            consensus_severity = max_severity(severities)
            confidences = [v.confidence for v in non_clean]
            consensus_confidence = sum(confidences) / len(confidences)

            pii_union = sorted(
                set(lbl for v in non_clean for lbl in v.pii_labels_detected)
            )
            # Concatenate raw patrol observations — no synthesis, no conclusions
            referral_summary = " | ".join(v.observation for v in non_clean)
            phero = min(
                1.0, pheromone_map.get(agent_id, 0.0) + cfg.PHEROMONE_DEPOSIT_AMOUNT
            )
            pheromone_updates[agent_id] = phero

            flag = PatrolFlag(
                target_agent_id=agent_id,
                consensus_severity=consensus_severity,
                consensus_confidence=round(consensus_confidence, 3),
                votes=non_clean,
                pii_labels_union=pii_union,
                referral_summary=referral_summary,
                pheromone_level=phero,
            )
            flags.append(flag)
            logger.warning(
                "[FALLBACK] PatrolFlag: agent=%s severity=%s conf=%.2f",
                agent_id,
                consensus_severity,
                consensus_confidence,
            )

        return flags, pheromone_updates
