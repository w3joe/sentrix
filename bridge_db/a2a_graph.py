"""
A2AGraph — in-memory NetworkX graph for A2A communication traversal.

The graph is a directed multigraph where:
  - Nodes  = agent IDs (strings)
  - Edges  = individual A2A messages (one edge per message, even if the same
             sender/recipient pair communicated multiple times)

This allows the Network Analyser agent to answer questions like:
  - Who did agent X communicate with?            → ego_network(X)
  - What did they say?                            → get_recent_communications(X)
  - Are there unusual communication patterns?     → degree, multi-hop paths
  - Who is the most connected agent?             → degree centrality

Usage
-----
    from bridge_db import SandboxDB, A2AGraph

    db = SandboxDB()
    await db.initialize()

    graph = A2AGraph()
    await graph.rebuild_from_db(db)          # one-off full load

    # Incremental: add a single message as it arrives
    graph.add_message("feature_0", "review_3",
                      message_id="abc", timestamp="...", body="LGTM")

    # Natural language description for the LLM
    narration = graph.describe_network("feature_0", limit=10)
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

try:
    import networkx as nx
    _HAS_NETWORKX = True
except ImportError:
    _HAS_NETWORKX = False
    nx = None  # type: ignore[assignment]

if TYPE_CHECKING:
    from bridge_db.db import SandboxDB

logger = logging.getLogger(__name__)


class A2AGraph:
    """
    In-memory directed multigraph of A2A communications.

    Build it once from the database, then add messages incrementally as the
    bridge polls new ones.  The graph can be rebuilt at any time with
    ``rebuild_from_db()`` to stay in sync with persistent storage.

    Raises
    ------
    ImportError
        If ``networkx`` is not installed (``pip install networkx``).
    """

    def __init__(self) -> None:
        if not _HAS_NETWORKX:
            raise ImportError(
                "A2AGraph requires networkx. Install with: pip install networkx>=3.0"
            )
        self._graph: nx.MultiDiGraph = nx.MultiDiGraph()

    # ── Build / populate ─────────────────────────────────────────────────────

    async def rebuild_from_db(self, db: SandboxDB) -> None:
        """
        Reload the full graph from the ``a2a_messages`` table.

        Clears any previously held edges so this is always a clean snapshot.
        """
        self._graph.clear()
        messages = await db.get_all_a2a_messages()
        for msg in messages:
            self._graph.add_edge(
                msg["sender_id"],
                msg["recipient_id"],
                key=msg["message_id"],
                message_id=msg["message_id"],
                timestamp=msg.get("timestamp", ""),
                body=msg.get("body", "")[:500],   # truncate for memory efficiency
                spoofed=bool(msg.get("spoofed", 0)),
                claimed_sender=msg.get("claimed_sender"),
            )
        logger.info(
            "A2AGraph rebuilt: %d nodes, %d edges",
            self._graph.number_of_nodes(),
            self._graph.number_of_edges(),
        )

    def add_message(
        self,
        sender_id: str,
        recipient_id: str,
        *,
        message_id: str,
        timestamp: str = "",
        body: str = "",
        spoofed: bool = False,
        claimed_sender: str | None = None,
    ) -> None:
        """Incrementally add a single message edge to the live graph."""
        self._graph.add_edge(
            sender_id,
            recipient_id,
            key=message_id,
            message_id=message_id,
            timestamp=timestamp,
            body=body[:500],
            spoofed=spoofed,
            claimed_sender=claimed_sender,
        )

    # ── Queries ───────────────────────────────────────────────────────────────

    def get_ego_network(
        self,
        agent_id: str,
        radius: int = 1,
    ) -> nx.MultiDiGraph:
        """
        Return the subgraph centred on *agent_id* out to *radius* hops.

        radius=1 returns the agent and all its direct communication partners.
        radius=2 includes partners-of-partners, useful for spotting indirect
        coordination chains.
        """
        if agent_id not in self._graph:
            return nx.MultiDiGraph()
        return nx.ego_graph(self._graph, agent_id, radius=radius)

    def get_recent_communications(
        self,
        agent_id: str,
        limit: int = 10,
    ) -> list[dict]:
        """
        Return the last *limit* edges involving *agent_id* (sent or received),
        sorted newest-first by timestamp.
        """
        edges: list[dict] = []
        for u, v, data in self._graph.edges(data=True):
            if u == agent_id or v == agent_id:
                edges.append({"from": u, "to": v, **data})
        edges.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
        return edges[:limit]

    def interaction_partners(self, agent_id: str) -> list[str]:
        """Return all agents *agent_id* has directly communicated with."""
        partners: set[str] = set()
        for u, v in self._graph.edges():
            if u == agent_id:
                partners.add(v)
            elif v == agent_id:
                partners.add(u)
        return sorted(partners)

    def node_count(self) -> int:
        return self._graph.number_of_nodes()

    def edge_count(self) -> int:
        return self._graph.number_of_edges()

    # ── Natural language output ───────────────────────────────────────────────

    def describe_network(
        self,
        agent_id: str,
        limit: int = 10,
    ) -> str:
        """
        Produce a natural language description of *agent_id*'s communication
        network for consumption by the Network Analyser LLM.

        Returns a multi-line string covering:
          - Recent messages (who said what to whom)
          - Spoofing anomalies
          - Communication partner summary
        """
        comms = self.get_recent_communications(agent_id, limit)

        if not comms:
            return (
                f"Agent {agent_id} has no recorded A2A communications in the database."
            )

        lines: list[str] = [
            f"A2A communication network for {agent_id} "
            f"(last {len(comms)} message(s)):",
            "",
        ]

        for c in comms:
            direction = "→" if c["from"] == agent_id else "←"
            other = c["to"] if c["from"] == agent_id else c["from"]
            verb = "sent to" if c["from"] == agent_id else "received from"
            ts = c.get("timestamp", "unknown time")
            snippet = (c.get("body", "") or "")[:120].replace("\n", " ")
            spoofed_tag = " [SPOOFED SENDER]" if c.get("spoofed") else ""

            lines.append(
                f"  {ts}  {agent_id} {verb} {other}{spoofed_tag}"
            )
            if c.get("claimed_sender"):
                lines.append(
                    f"           (claimed to be from: {c['claimed_sender']})"
                )
            lines.append(f"           \"{snippet}\"")

        lines.append("")
        partners = self.interaction_partners(agent_id)
        lines.append(
            f"Unique interaction partners ({len(partners)}): "
            + (", ".join(partners) if partners else "none")
        )

        # Flag any spoofed messages
        spoofed = [c for c in comms if c.get("spoofed")]
        if spoofed:
            lines.append(
                f"ANOMALY: {len(spoofed)} message(s) had a spoofed sender identity."
            )

        return "\n".join(lines)
