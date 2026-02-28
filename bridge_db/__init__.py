"""
bridge_db — persistent storage for sandbox bridge output.

Stores the three observable sandbox artefacts in a queryable SQLite database:
  - agent_registry   : agent identities and declared scope
  - a2a_messages     : all inter-agent communications (graph-traversable via A2AGraph)
  - action_logs      : agent actions with inputs and outputs

The A2A table is backed by an in-memory NetworkX MultiDiGraph (a2a_graph.py)
so the Network Analyser agent can traverse who-spoke-to-whom relationships
without loading and re-parsing raw text files each time.

Usage
-----
    from bridge_db import SandboxDB, A2AGraph

    db = SandboxDB()
    await db.initialize()           # create tables if not present

    graph = A2AGraph()
    await graph.rebuild_from_db(db) # load full communication graph into memory
"""

from bridge_db.db import SandboxDB
from bridge_db.a2a_graph import A2AGraph

__all__ = ["SandboxDB", "A2AGraph"]
