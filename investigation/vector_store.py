"""
InvestigationVectorStore — ChromaDB wrapper for semantic evidence retrieval.

Three persistent collections:
  action_logs  : agent tool calls, indexed per agent for Investigator queries
  a2a_messages : inter-agent communications, for Network Analyser ranking
  past_cases   : concluded CaseFile summaries, for Superintendent precedent search

Indexing is lazy — triggered when an investigation opens, not at startup.
Uses ChromaDB's default all-MiniLM-L6-v2 embedding (384-dim), zero config.
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

import investigation.config as cfg

if TYPE_CHECKING:
    from investigation.models import CaseFile

logger = logging.getLogger(__name__)


class InvestigationVectorStore:
    """
    Thin async-compatible wrapper around ChromaDB for investigation evidence retrieval.

    All methods are synchronous (ChromaDB's Python client is synchronous).
    Call from async contexts via asyncio.to_thread() if needed, or directly —
    ChromaDB local operations are fast enough for investigation use.

    Parameters
    ----------
    persist_dir : str | None
        Directory to persist ChromaDB collections.
        Defaults to CHROMA_PERSIST_DIR from investigation.config.
    """

    def __init__(self, persist_dir: str | None = None) -> None:
        self._persist_dir = persist_dir or cfg.CHROMA_PERSIST_DIR
        self._client = None
        self._action_logs_col = None
        self._a2a_messages_col = None
        self._past_cases_col = None

    def _ensure_client(self) -> None:
        """Lazy-initialise ChromaDB client and collections on first use."""
        if self._client is not None:
            return
        try:
            import chromadb
        except ImportError:
            raise ImportError(
                "ChromaDB is required: pip install chromadb>=0.5.0"
            )
        os.makedirs(self._persist_dir, exist_ok=True)
        self._client = chromadb.PersistentClient(path=self._persist_dir)
        self._action_logs_col = self._client.get_or_create_collection(
            name="action_logs",
            metadata={"hnsw:space": "cosine"},
        )
        self._a2a_messages_col = self._client.get_or_create_collection(
            name="a2a_messages",
            metadata={"hnsw:space": "cosine"},
        )
        self._past_cases_col = self._client.get_or_create_collection(
            name="past_cases",
            metadata={"hnsw:space": "cosine"},
        )
        logger.info("ChromaDB initialised at %s", self._persist_dir)

    # ── Indexing ───────────────────────────────────────────────────────────────

    def index_agent_actions(self, agent_id: str, actions: list[dict]) -> None:
        """
        Index an agent's action logs into the action_logs collection.

        Document format: "{action_type}: {tool_name} — {input_summary} → {output_summary}"
        Metadata: agent_id, action_id, action_type, violation, critical, timestamp
        Skip-if-exists: uses add() with error suppression for duplicate IDs.
        """
        self._ensure_client()
        if not actions:
            return

        documents, ids, metadatas = [], [], []
        for action in actions:
            action_id = action.get("action_id", "")
            if not action_id:
                continue
            doc = (
                f"{action.get('action_type', 'unknown')}: "
                f"{action.get('tool_name', '')} — "
                f"{action.get('input_summary', '')[:300]} → "
                f"{action.get('output_summary', '')[:300]}"
            )
            documents.append(doc)
            ids.append(f"action_{action_id}")
            metadatas.append({
                "agent_id": agent_id,
                "action_id": action_id,
                "action_type": action.get("action_type", ""),
                "violation": int(action.get("violation", 0)),
                "critical": int(action.get("critical", 0)),
                "timestamp": str(action.get("timestamp", "")),
            })

        if not documents:
            return

        try:
            self._action_logs_col.add(
                documents=documents,
                ids=ids,
                metadatas=metadatas,
            )
            logger.debug("Indexed %d action logs for agent %s", len(documents), agent_id)
        except Exception as exc:
            # ChromaDB raises if IDs already exist — silently skip duplicates
            logger.debug("action_logs index (some may be duplicates): %s", exc)

    def index_a2a_messages(self, agent_id: str, messages: list[dict]) -> None:
        """
        Index A2A messages into the a2a_messages collection.

        Document format: "{sender_id} → {recipient_id}: {body}"
        Metadata: agent_id (the investigation target), sender_id, recipient_id, spoofed, message_id
        """
        self._ensure_client()
        if not messages:
            return

        documents, ids, metadatas = [], [], []
        for msg in messages:
            message_id = msg.get("message_id", "")
            if not message_id:
                continue
            body = (msg.get("body", "") or "")[:400]
            doc = f"{msg.get('sender_id', '')} → {msg.get('recipient_id', '')}: {body}"
            documents.append(doc)
            ids.append(f"msg_{message_id}")
            metadatas.append({
                "agent_id": agent_id,
                "message_id": message_id,
                "sender_id": msg.get("sender_id", ""),
                "recipient_id": msg.get("recipient_id", ""),
                "spoofed": int(msg.get("spoofed", 0)),
                "timestamp": str(msg.get("timestamp", "")),
            })

        if not documents:
            return

        try:
            self._a2a_messages_col.add(
                documents=documents,
                ids=ids,
                metadatas=metadatas,
            )
            logger.debug("Indexed %d A2A messages for agent %s", len(documents), agent_id)
        except Exception as exc:
            logger.debug("a2a_messages index (some may be duplicates): %s", exc)

    def index_case_file(self, case_file) -> None:
        """
        Index a concluded CaseFile into past_cases for precedent matching.

        Document format: "{crime_classification}: {key_findings}. {evidence_summary}"
        Metadata: investigation_id, verdict, sentence, crime_classification
        """
        self._ensure_client()
        investigation_id = case_file.investigation_id
        crime = str(case_file.crime_classification)
        findings = "; ".join(case_file.key_findings[:5]) if case_file.key_findings else ""
        evidence = case_file.evidence_summary[:400]
        doc = f"{crime}: {findings}. {evidence}"

        try:
            self._past_cases_col.add(
                documents=[doc],
                ids=[f"case_{investigation_id}"],
                metadatas=[{
                    "investigation_id": investigation_id,
                    "verdict": str(case_file.verdict),
                    "sentence": str(case_file.sentence),
                    "crime_classification": crime,
                    "target_agent_id": case_file.target_agent_id,
                }],
            )
            logger.debug("Indexed case file %s into past_cases", investigation_id)
        except Exception as exc:
            logger.debug("past_cases index: %s", exc)

    # ── Querying ───────────────────────────────────────────────────────────────

    def query_relevant_actions(
        self,
        query: str,
        agent_id: str,
        n: int = 20,
    ) -> list[dict]:
        """
        Return up to *n* action logs most semantically relevant to *query*,
        filtered to *agent_id*.

        Returns list of action metadata dicts with an added "document" key.
        """
        self._ensure_client()
        try:
            results = self._action_logs_col.query(
                query_texts=[query],
                n_results=min(n, max(1, self._action_logs_col.count())),
                where={"agent_id": agent_id},
            )
            return self._unpack_results(results)
        except Exception as exc:
            logger.warning("query_relevant_actions failed: %s", exc)
            return []

    def query_relevant_messages(
        self,
        query: str,
        agent_id: str,
        n: int = 10,
    ) -> list[dict]:
        """
        Return up to *n* A2A messages most semantically relevant to *query*,
        filtered to messages involving *agent_id* (sender or recipient).
        """
        self._ensure_client()
        try:
            results = self._a2a_messages_col.query(
                query_texts=[query],
                n_results=min(n, max(1, self._a2a_messages_col.count())),
                where={"agent_id": agent_id},
            )
            return self._unpack_results(results)
        except Exception as exc:
            logger.warning("query_relevant_messages failed: %s", exc)
            return []

    def query_similar_cases(self, query: str, n: int = 5) -> list[dict]:
        """
        Return up to *n* past cases most semantically similar to *query*.
        Used by Superintendent for precedent matching.
        """
        self._ensure_client()
        count = self._past_cases_col.count()
        if count == 0:
            return []
        try:
            results = self._past_cases_col.query(
                query_texts=[query],
                n_results=min(n, count),
            )
            return self._unpack_results(results)
        except Exception as exc:
            logger.warning("query_similar_cases failed: %s", exc)
            return []

    def query_cross_agent_actions(
        self,
        query: str,
        exclude_agent: str,
        n: int = 10,
    ) -> list[dict]:
        """
        Return up to *n* action logs matching *query* from agents OTHER THAN
        *exclude_agent*. Used by Damage Analyst to detect propagation.
        """
        self._ensure_client()
        count = self._action_logs_col.count()
        if count == 0:
            return []
        try:
            results = self._action_logs_col.query(
                query_texts=[query],
                n_results=min(n, count),
                where={"agent_id": {"$ne": exclude_agent}},
            )
            return self._unpack_results(results)
        except Exception as exc:
            logger.warning("query_cross_agent_actions failed: %s", exc)
            return []

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _unpack_results(results: dict) -> list[dict]:
        """Flatten ChromaDB query results into a list of dicts."""
        out = []
        if not results or not results.get("ids"):
            return out
        ids = results["ids"][0]
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]
        for i, chroma_id in enumerate(ids):
            entry = dict(metas[i]) if i < len(metas) else {}
            entry["chroma_id"] = chroma_id
            entry["document"] = docs[i] if i < len(docs) else ""
            entry["distance"] = distances[i] if i < len(distances) else None
            out.append(entry)
        return out
