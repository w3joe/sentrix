"""
BasePatrolAgent — shared patrol logic and Nemotron Nano LLM client setup.

All three specialist patrol agents inherit from this class.
"""

from __future__ import annotations

import json
import logging
import os
import re
from abc import ABC, abstractmethod
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI

import patrol_swarm.config as cfg
from patrol_swarm.models import (
    SEVERITY_ORDER,
    Severity,
    ThreatSignal,
    ViolationVote,
)

logger = logging.getLogger(__name__)

# Lightweight regex evidence patterns per label.
# A label is KEPT only if its pattern matches the document text.
# Labels without a pattern entry are always kept (we can't verify them).
# Patterns are intentionally permissive — they just confirm *something*
# plausible is present, not that it's definitely PII.
_LABEL_EVIDENCE_PATTERNS: dict[str, re.Pattern] = {
    "email_address":       re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"),
    "ssn":                 re.compile(r"\b\d{3}[- ]\d{2}[- ]\d{4}\b"),
    "credit_debit_card":   re.compile(r"\b(?:\d[ -]?){13,16}\b"),
    "bank_routing_number": re.compile(r"\b\d{9}\b"),
    "cvv":                 re.compile(r"\bcvv\b|\bcvc\b|\bcvv2\b", re.I),
    "pin":                 re.compile(r"\bpin\b|\bpincode\b", re.I),
    "ip_address":          re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    "postcode":            re.compile(r"\b\d{5}(?:-\d{4})?\b|\b[A-Z]{1,2}\d[\dA-Z]? \d[A-Z]{2}\b"),
    "phone_number":        re.compile(r"\b(?:\+?\d[\s.-]?){7,15}\b"),
    "password":            re.compile(r"\bpassword\b|\bpasswd\b|\bpwd\b", re.I),
    "api_key":             re.compile(r"\bapi[_-]?key\b|\bsecret[_-]?key\b|\btoken\b", re.I),
    "swift_bic":           re.compile(r"\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b"),
    "account_number":      re.compile(r"\baccount\s*(?:no\.?|number|#|id)\s*[=:\s]\s*[\d\-]+", re.I),
    "date_of_birth":       re.compile(r"\b(?:dob|date of birth|born on|birth\s*date)\b|\b\d{4}[/-]\d{2}[/-]\d{2}\b", re.I),
    "passport_number":     re.compile(r"\bpassport\b", re.I),
    "drivers_license":     re.compile(r"\bdriver[']?s?\s+licen[sc]e\b|\bdl\s*#?\s*\d", re.I),
    "national_id":         re.compile(r"\bnational\s+id\b|\bnid\b", re.I),
    "health_insurance_id": re.compile(r"\bhealth\s+insurance\b|\binsurance\s+id\b|\bmember\s+id\b", re.I),
    "medical_record_number": re.compile(r"\bmedical\s+record\b|\bmrn\b", re.I),
}
_ALL_PII_LABELS: frozenset[str] = frozenset({
    "person_name", "ssn", "date_of_birth", "national_id", "passport_number",
    "drivers_license", "phone_number", "email_address", "street_address",
    "postcode", "ip_address", "credit_debit_card", "bank_routing_number",
    "account_number", "swift_bic", "cvv", "pin", "password", "api_key",
    "biometric_identifier", "employee_id", "username",
    "medical_record_number", "health_insurance_id",
})

# Common synonyms the LLM uses instead of exact taxonomy labels.
# Keys must be specific enough to NOT fire on domain-descriptor prose
# (e.g. "email" alone is too broad — "email address" is specific enough).
_LABEL_SYNONYMS: dict[str, str] = {
    "social security number": "ssn",
    "social security": "ssn",
    "credit card number": "credit_debit_card",
    "debit card number": "credit_debit_card",
    "credit/debit card": "credit_debit_card",
    "card number": "credit_debit_card",
    "routing number": "bank_routing_number",
    "bank routing": "bank_routing_number",
    "api key": "api_key",
    "apikey": "api_key",
    "secret key": "api_key",
    "date of birth": "date_of_birth",
    "drivers license": "drivers_license",
    "driver's license": "drivers_license",
    "driver license": "drivers_license",
    "passport number": "passport_number",
    "national id": "national_id",
    "health insurance id": "health_insurance_id",
    "health insurance number": "health_insurance_id",
    "medical record number": "medical_record_number",
    "biometric identifier": "biometric_identifier",
    "ip address": "ip_address",
    "zip code": "postcode",
    "postal code": "postcode",
    "phone number": "phone_number",
    "email address": "email_address",
}


class BasePatrolAgent(ABC):
    """
    Abstract base for all patrol agents.

    Subclasses must implement:
      - name         : str — unique agent name (email_patrol | code_patrol | doc_patrol)
      - domain       : str — email | code | document
      - system_prompt: str — injected into Nemotron Nano chat  
      - tools        : list[BaseTool] — domain-specific LangChain tools
      - _build_human_message(target_agent_id, actions, agent_profile) → str

    The patrol loop calls `scan()` which:
      1. Binds tools to the Nemotron Nano LLM
      2. Sends system + human messages
      3. Parses JSON response
      4. Returns (ThreatSignal, ViolationVote | None)
    """

    name: str
    domain: str
    system_prompt: str
    tools: list[BaseTool]

    def __init__(self) -> None:
        if cfg.DEPLOYMENT == "claude":
            from langchain_anthropic import ChatAnthropic
            self._llm = ChatAnthropic(
                api_key=cfg.ACTIVE_API_KEY,
                model=cfg.ACTIVE_PATROL_MODEL,
                temperature=cfg.NANO_TEMPERATURE,
                max_tokens=cfg.NANO_MAX_TOKENS,
            )
        else:
            self._llm = ChatOpenAI(
                base_url=cfg.ACTIVE_PATROL_ENDPOINT,
                api_key=cfg.ACTIVE_API_KEY,
                model=cfg.ACTIVE_PATROL_MODEL,
                temperature=cfg.NANO_TEMPERATURE,
                max_tokens=cfg.NANO_MAX_TOKENS,
            )
        # Bind domain tools. tool_choice="none" for local models that don't
        # support function-calling — agents fall back to raw JSON parsing.
        self._llm_with_tools = self._llm.bind_tools(
            self.tools, tool_choice=cfg.ACTIVE_TOOL_CHOICE
        )

    # ─── Abstract interface ───────────────────────────────────────────────────

    @abstractmethod
    def _build_human_message(
        self,
        target_agent_id: str,
        actions: list[dict],
        agent_profile: dict,
    ) -> str:
        """Build the per-scan human message.

        Mamba2 optimisation: rules/taxonomy are already in the system message
        (baked into recurrent state). The human message carries ONLY the
        variable content — actions to scan + agent profile.
        """

    # ─── Core scan method ─────────────────────────────────────────────────────

    async def scan(
        self,
        target_agent_id: str,
        actions: list[dict],
        agent_profile: dict,
        pheromone_level: float = 0.0,
    ) -> tuple[ThreatSignal, ViolationVote | None]:
        """
        Execute a single patrol scan of target_agent_id.

        Parameters
        ----------
        target_agent_id : str
            ID of the monitored agent being scanned.
        actions : list[dict]
            Recent actions / artefacts to inspect (up to MAX_ACTIONS_PER_SCAN).
            Mamba2 context: include all — truncation wastes long-context capacity.
        agent_profile : dict
            Agent registry entry: permitted_domains, permitted_paths, declared_scope.
        pheromone_level : float
            Current blackboard pheromone level for this target (informs context).

        Returns
        -------
        signal : ThreatSignal — always returned, posted to blackboard.
        vote   : ViolationVote | None — posted only if confidence ≥ threshold.
        """
        human_text = self._build_human_message(target_agent_id, actions, agent_profile)

        messages = [
            SystemMessage(content=cfg.NO_THINK_PREFIX + self.system_prompt),
            HumanMessage(content=human_text),
        ]

        # Invoke LLM with tool-calling enabled
        try:
            response = await self._llm_with_tools.ainvoke(messages)
            # When thinking is enabled, capture and log the reasoning block
            # before it is stripped for JSON parsing.
            if cfg.PATROL_THINKING:
                raw_text = str(response.content) if hasattr(response, "content") else str(response)
                think_match = re.search(r"<think>(.*?)</think>", raw_text, flags=re.DOTALL)
                if think_match:
                    logger.info(
                        "[THINKING] %s → %s:\n%s",
                        self.name,
                        target_agent_id,
                        think_match.group(1).strip(),
                    )
                else:
                    logger.debug(
                        "[THINKING] %s → %s: no <think> block in response",
                        self.name,
                        target_agent_id,
                    )
            raw_content = self._extract_json_content(response)
        except Exception as exc:
            logger.exception("LLM call failed for %s scanning %s", self.name, target_agent_id)
            raw_content = {
                "severity": Severity.CLEAN,
                "confidence": 0.0,
                "pii_labels_detected": [],
                "observation": f"Scan failed: {exc}",
                "tool_calls_made": [],
            }

        severity = Severity(raw_content.get("severity", Severity.CLEAN))
        confidence = float(raw_content.get("confidence", 0.0))
        pii_labels = raw_content.get("pii_labels_detected", [])
        observation = raw_content.get("observation", "")

        # Normalise labels:
        #  - strip category prefixes  ("Identity: person_name" → "person_name")
        #  - lowercase + underscore
        #  - map non-standard dataset variants ("user_name" → "username")
        #  - drop anything not in the known taxonomy
        _LABEL_ALIASES: dict[str, str] = {
            "user_name": "username",
            "first_name": "person_name",
            "last_name": "person_name",
        }
        pii_labels = [
            _LABEL_ALIASES.get(
                (raw := lbl.split(":", 1)[-1].strip().lower().replace(" ", "_")),
                raw,
            )
            for lbl in pii_labels
            if lbl
        ]
        pii_labels = list(dict.fromkeys(lbl for lbl in pii_labels if lbl in _ALL_PII_LABELS))

        # If the model flagged something but returned no valid label names, try
        # to recover them from the observation text.
        if not pii_labels and severity != Severity.CLEAN:
            pii_labels = self._recover_labels_from_observation(observation)

        # Drop labels that have an evidence pattern but no match in the document text.
        document_text = " ".join(
            str(a.get("content") or a.get("text") or a.get("diff") or "")
            for a in actions
        )
        if document_text and pii_labels:
            pii_labels = self._validate_labels_against_text(pii_labels, document_text)
        tool_calls_made = raw_content.get("tool_calls_made", [])

        signal = ThreatSignal(
            source_agent=self.name,
            target_agent_id=target_agent_id,
            domain=self.domain,
            severity=severity,
            confidence=confidence,
            pii_labels_detected=pii_labels,
            observation=observation,
            tool_calls_made=tool_calls_made,
            raw_tool_outputs=raw_content,
        )

        vote: ViolationVote | None = None
        if severity != Severity.CLEAN and confidence >= cfg.CONFIDENCE_THRESHOLD:
            vote = ViolationVote(
                source_agent=self.name,
                target_agent_id=target_agent_id,
                severity=severity,
                confidence=confidence,
                pii_labels_detected=pii_labels,
                observation=observation,
            )
            logger.info(
                "%s → VOTE %s on %s (conf=%.2f)",
                self.name,
                severity,
                target_agent_id,
                confidence,
            )
        else:
            logger.debug(
                "%s → %s on %s (conf=%.2f, below threshold or CLEAN)",
                self.name,
                severity,
                target_agent_id,
                confidence,
            )

        return signal, vote

    # ─── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _validate_labels_against_text(labels: list[str], text: str) -> list[str]:
        """
        Drop any claimed PII labels that have no textual footprint in ``text``.

        Labels that have no evidence pattern registered in
        ``_LABEL_EVIDENCE_PATTERNS`` are always kept (we can't disprove them).
        Labels with a registered pattern are only kept when the pattern matches.

        This catches the common small-model hallucination of confidently asserting
        a label (e.g. ``email_address``) on text that clearly doesn't contain it.
        """
        validated = []
        for label in labels:
            pattern = _LABEL_EVIDENCE_PATTERNS.get(label)
            if pattern is None or pattern.search(text):
                validated.append(label)
            else:
                logger.debug(
                    "Dropping hallucinated label %r — no evidence found in document text.",
                    label,
                )
        return validated

    @staticmethod
    def _recover_labels_from_observation(observation: str) -> list[str]:
        """
        Best-effort recovery of PII taxonomy labels from observation text.

        Called when the model produced a non-CLEAN verdict but left
        ``pii_labels_detected`` empty — a common failure mode for small
        quantised models that recognise a violation but don't echo back
        the exact Nemotron label names.

        Strategy (in order):
          1. Direct substring match against every taxonomy label (e.g. "password").
          2. Synonym map match for common English phrases (e.g. "credit card" →
             "credit_debit_card").
        """
        if not observation:
            return []

        lower_obs = observation.lower()

        # If the observation explicitly says nothing was found, don't recover —
        # the model's contradiction (severity=HIGH, observation="no PII detected")
        # is a model failure; injecting labels would be a false positive.
        _no_pii_phrases = (
            "no pii", "no pii detected", "no pii entities", "no pii found",
            "no entities detected", "no sensitive", "none detected", "nothing detected",
            "cannot be assessed", "no content",
        )
        if any(phrase in lower_obs for phrase in _no_pii_phrases):
            logger.debug("Skipping label recovery: observation denies PII presence.")
            return []
        recovered: set[str] = set()

        # 1. Direct taxonomy label match (replace underscores with spaces for
        #    prose matching: "email_address" → "email address")
        for label in _ALL_PII_LABELS:
            if label in lower_obs or label.replace("_", " ") in lower_obs:
                recovered.add(label)

        # 2. Synonym map
        for phrase, label in _LABEL_SYNONYMS.items():
            if phrase in lower_obs:
                recovered.add(label)

        if recovered:
            logger.debug(
                "Recovered PII labels from observation text: %s", sorted(recovered)
            )
        return sorted(recovered)

    @staticmethod
    def _extract_json_content(response: Any) -> dict:
        """Extract JSON dict from LLM response content."""
        # Claude (ChatAnthropic) with bind_tools returns structured tool_calls —
        # use them directly instead of re-parsing the raw content string.
        if hasattr(response, "tool_calls") and response.tool_calls:
            return response.tool_calls[0].get("args", {})

        content = response.content if hasattr(response, "content") else str(response)

        # Claude returns content as a list of blocks when tool use is involved.
        # Flatten to plain text so the rest of the method works unchanged.
        if isinstance(content, list):
            text_parts = []
            for block in content:
                if isinstance(block, dict):
                    if block.get("type") == "tool_use":
                        return block.get("input", {})
                    elif block.get("type") == "text":
                        text_parts.append(block.get("text", ""))
                elif hasattr(block, "text"):
                    text_parts.append(block.text)
            content = " ".join(text_parts)

        # Strip <think>…</think> reasoning blocks (Nemotron/Qwen3 local models).
        # Two passes: first remove complete blocks, then strip any unclosed <think>
        # (happens when the model's token budget runs out mid-reasoning).
        content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
        content = re.sub(r"<think>.*$", "", content, flags=re.DOTALL).strip()

        # Strip LM Studio / vLLM special tokens (e.g. <|begin_of_box|>)
        content = re.sub(r"<\|[\w_]+\|>", "", content).strip()

        # Strip markdown code fences if present
        if "```" in content:
            match = re.search(r"```(?:json)?\s*([\s\S]+?)```", content)
            if match:
                content = match.group(1).strip()

        try:
            return json.loads(content.strip())
        except json.JSONDecodeError:
            if not content.strip():
                logger.warning(
                    "LLM response was entirely a <think> block with no JSON output "
                    "(model hit token limit mid-reasoning). Increase NANO_MAX_TOKENS."
                )
            else:
                logger.warning("Failed to parse LLM JSON output: %s", content[:200])
            return {
                "severity": Severity.CLEAN,
                "confidence": 0.0,
                "pii_labels_detected": [],
                "observation": "JSON parse error in LLM output.",
                "tool_calls_made": [],
            }
