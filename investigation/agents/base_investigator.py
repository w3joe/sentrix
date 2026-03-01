"""
BaseInvestigator — shared LLM client and JSON extraction for all investigation agents.

Mirrors patrolswarm/patrol_swarm/agents/base_patrol.py. All four investigation
agents inherit from this class. Uses Nemotron Super (49B) for deeper reasoning.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

import investigation.config as cfg

logger = logging.getLogger(__name__)


class BaseInvestigator:
    """
    Abstract base for all investigation pipeline agents.

    Provides:
      - Nemotron Super LLM client (configured from investigation.config)
      - _call_llm(system_prompt, human_text) → dict (parsed JSON)
      - _extract_json_content(response) → dict
      - Thinking block logging (if INVESTIGATION_THINKING=1)

    Subclasses implement a single async run(state) → dict method that
    reads from InvestigationState and returns the state update dict.
    """

    def __init__(self) -> None:
        if cfg.DEPLOYMENT == "claude":
            from langchain_anthropic import ChatAnthropic
            self._llm = ChatAnthropic(
                api_key=cfg.ACTIVE_API_KEY,
                model=cfg.ACTIVE_MODEL,
                temperature=cfg.INVESTIGATION_TEMPERATURE,
                max_tokens=cfg.INVESTIGATION_MAX_TOKENS,
            )
        else:
            self._llm = ChatOpenAI(
                base_url=cfg.ACTIVE_ENDPOINT,
                api_key=cfg.ACTIVE_API_KEY,
                model=cfg.ACTIVE_MODEL,
                temperature=cfg.INVESTIGATION_TEMPERATURE,
                max_tokens=cfg.INVESTIGATION_MAX_TOKENS,
            )

    async def _call_llm(self, system_prompt: str, human_text: str) -> dict:
        """
        Send system + human messages to Nemotron Super and return parsed JSON.

        Strips <think> blocks before JSON parsing. Logs thinking content if
        INVESTIGATION_THINKING=1. Falls back to empty dict on parse failure.
        """
        messages = [
            SystemMessage(content=cfg.NO_THINK_PREFIX + system_prompt),
            HumanMessage(content=human_text),
        ]
        try:
            response = await self._llm.ainvoke(messages)
            if cfg.INVESTIGATION_THINKING:
                raw = str(response.content) if hasattr(response, "content") else str(response)
                think_match = re.search(r"<think>(.*?)</think>", raw, flags=re.DOTALL)
                if think_match:
                    logger.info(
                        "[THINKING] %s:\n%s",
                        self.__class__.__name__,
                        think_match.group(1).strip(),
                    )
            return self._extract_json_content(response)
        except Exception as exc:
            logger.exception("LLM call failed in %s: %s", self.__class__.__name__, exc)
            return {}

    @staticmethod
    def _extract_json_content(response: Any) -> dict:
        """Extract and parse JSON from LLM response content."""
        content = response.content if hasattr(response, "content") else str(response)

        # Strip <think>…</think> blocks (complete and unclosed)
        content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
        content = re.sub(r"<think>.*$", "", content, flags=re.DOTALL).strip()

        # Strip LM Studio special tokens
        content = re.sub(r"<\|[\w_]+\|>", "", content).strip()

        # Strip markdown code fences
        if "```" in content:
            match = re.search(r"```(?:json)?\s*([\s\S]+?)```", content)
            if match:
                content = match.group(1).strip()

        try:
            return json.loads(content.strip())
        except json.JSONDecodeError:
            if not content.strip():
                logger.warning(
                    "%s: LLM response was entirely a <think> block. "
                    "Increase INVESTIGATION_MAX_TOKENS.",
                    "BaseInvestigator",
                )
            else:
                logger.warning(
                    "Failed to parse JSON from LLM output: %s", content[:300]
                )
            return {}
