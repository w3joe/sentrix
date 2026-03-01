"""
SandboxV2 Orchestrator — initialises agents, assigns tasks, runs the simulation.

Entry point:
    orch = SandboxV2Orchestrator()
    await orch.init()
    await orch.run(cycles=10)
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import signal
import uuid
from datetime import datetime

import anthropic

from sandboxv2 import config
from sandboxv2.agents.coding import CodingAgent
from sandboxv2.agents.document import DocumentAgent
from sandboxv2.agents.email import EmailAgent
from sandboxv2.agents.review import ReviewAgent
from sandboxv2.agents.base import BaseAgentV2
from sandboxv2.persistence import PersistenceLayer
from sandboxv2.roles import (
    ROLE_CYCLE,
    build_agent_id,
    build_registry_profile,
    get_role_for_index,
)
from sandboxv2.tasks import TaskPool

from bridge_db.db import SandboxDB

logger = logging.getLogger(__name__)

# Map role prefix → agent class (matches SCHEMA.md role cycle)
_AGENT_CLASSES: dict[str, type[BaseAgentV2]] = {
    "feature": CodingAgent,
    "test": CodingAgent,
    "refactor": CodingAgent,
    "review": ReviewAgent,
    "email": EmailAgent,
    "legal": DocumentAgent,
}


class SandboxV2Orchestrator:
    """
    Main orchestrator for the sandboxv2 company simulation.

    Parameters
    ----------
    agent_count : int
        Number of agents to spawn (cycles through roles).
    cluster_id : str
        Cluster ID for grouping in bridge_db.
    run_dir_base : str
        Base directory for sandbox run output.
    """

    def __init__(
        self,
        agent_count: int | None = None,
        cluster_id: str | None = None,
        run_dir_base: str | None = None,
    ) -> None:
        self._agent_count = agent_count or config.AGENT_COUNT
        self._cluster_id = cluster_id or config.CLUSTER_ID
        self._run_dir_base = run_dir_base or config.RUN_DIR
        self._run_dir: str = ""
        self._agents: list[BaseAgentV2] = []
        self._task_pool: TaskPool | None = None
        self._persistence: PersistenceLayer | None = None
        self._db: SandboxDB | None = None
        self._shutdown = asyncio.Event()

    @property
    def run_dir(self) -> str:
        return self._run_dir

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def init(self) -> None:
        """
        Initialise the simulation:
          1. Create timestamped run directory with subdirs
          2. Initialise bridge_db
          3. Register cluster and agents
          4. Instantiate agent objects
          5. Load task pool
        """
        # 1. Create run directory
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        run_id = uuid.uuid4().hex[:6]
        self._run_dir = os.path.join(
            self._run_dir_base, f"sandboxv2_{ts}_{run_id}"
        )
        for subdir in ("agent_messages", "activity", "simulated_prs", "simulated_emails", "simulated_documents"):
            os.makedirs(os.path.join(self._run_dir, subdir), exist_ok=True)
        logger.info("Run directory: %s", self._run_dir)

        # 2. Initialise bridge_db
        self._db = SandboxDB(config.BRIDGE_DB_PATH)
        await self._db.initialize()

        # 3. Set up persistence
        self._persistence = PersistenceLayer(self._db, self._run_dir)

        # Register cluster
        await self._persistence.register_cluster(
            cluster_id=self._cluster_id,
            name=config.CLUSTER_NAME,
            description=f"SandboxV2 simulation host — {config.COMPANY_NAME}",
        )

        # Build agent registry
        registry: dict[str, dict] = {}
        agent_configs: list[tuple[str, type[BaseAgentV2]]] = []

        for i in range(self._agent_count):
            role = get_role_for_index(i)
            agent_id = build_agent_id(role, i)
            profile = build_registry_profile(role, self._cluster_id)
            registry[agent_id] = profile

            cls = _AGENT_CLASSES.get(role.agent_id_prefix, BaseAgentV2)
            agent_configs.append((agent_id, cls))

        await self._persistence.register_agents(registry)

        # Re-set agent_status after upsert (INSERT OR REPLACE resets it)
        for agent_id in registry:
            await self._db.set_agent_status(agent_id, "idle")

        # 4. Instantiate agents
        client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
        all_ids = [aid for aid, _ in agent_configs]

        self._agents = []
        for i, (agent_id, cls) in enumerate(agent_configs):
            role = get_role_for_index(i)
            agent = cls(
                agent_id=agent_id,
                role=role,
                client=client,
                persistence=self._persistence,
                all_agent_ids=all_ids,
            )
            self._agents.append(agent)

        # 5. Load task pool
        self._task_pool = TaskPool()

        logger.info(
            "Initialised %d agents: %s",
            len(self._agents),
            [a.agent_id for a in self._agents],
        )

    async def run(self, cycles: int = 0) -> None:
        """
        Run the simulation.

        Parameters
        ----------
        cycles : int
            Number of task cycles per agent.  0 = run until SIGINT.
        """
        if not self._agents:
            raise RuntimeError("Call init() before run()")

        # Set up signal handling for graceful shutdown
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, self._handle_shutdown)

        logger.info("Starting simulation: %d cycles (0=infinite)", cycles)

        # Launch concurrent agent loops
        tasks = [
            asyncio.create_task(self._agent_loop(agent, cycles))
            for agent in self._agents
        ]

        # Wait for all agents to finish or shutdown signal
        done, pending = await asyncio.wait(
            tasks, return_when=asyncio.FIRST_EXCEPTION
        )

        # Cancel pending tasks on shutdown
        for t in pending:
            t.cancel()

        # Check for exceptions
        for t in done:
            if t.exception():
                logger.error("Agent task failed: %s", t.exception())

        logger.info("Simulation complete. Run dir: %s", self._run_dir)

    def _handle_shutdown(self) -> None:
        logger.info("Shutdown signal received")
        self._shutdown.set()

    # ── Agent loop ────────────────────────────────────────────────────────────

    async def _agent_loop(self, agent: BaseAgentV2, cycles: int) -> None:
        """
        Main loop for a single agent: claim task → execute → sleep → repeat.

        Parameters
        ----------
        agent : BaseAgentV2
            The agent instance.
        cycles : int
            Max cycles (0 = infinite).
        """
        cycle = 0
        while not self._shutdown.is_set():
            if cycles > 0 and cycle >= cycles:
                break

            try:
                # Claim a task
                task = self._task_pool.claim(agent.role.agent_type)

                # Execute
                await self._db.set_agent_status(agent.agent_id, "working")
                await agent.run_task(task)
                await self._db.set_agent_status(agent.agent_id, "idle")

                cycle += 1

                # Sleep with jitter
                jitter = random.uniform(0, config.AGENT_JITTER_SEC)
                sleep_time = config.TASK_INTERVAL_SEC + jitter

                # Use wait with timeout so we can respond to shutdown
                try:
                    await asyncio.wait_for(
                        self._shutdown.wait(), timeout=sleep_time
                    )
                    # If we get here, shutdown was signalled
                    break
                except asyncio.TimeoutError:
                    # Normal — sleep completed, continue to next task
                    pass

            except Exception as e:
                logger.error("[%s] Error in cycle %d: %s", agent.agent_id, cycle, e)
                # Back off on error
                await asyncio.sleep(5)
                cycle += 1

        logger.info("[%s] Agent loop finished after %d cycles", agent.agent_id, cycle)
