"""
CLI entry point for sandboxv2.

Usage:
    python -m sandboxv2 --cycles 10 --agent-count 4 --cluster-id cluster-1
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from sandboxv2 import config
from sandboxv2.orchestrator import SandboxV2Orchestrator


def main() -> None:
    parser = argparse.ArgumentParser(
        description="SandboxV2 — text-based company simulation using Anthropic Claude"
    )
    parser.add_argument(
        "--cycles",
        type=int,
        default=10,
        help="Number of task cycles per agent (0 = run until Ctrl-C)",
    )
    parser.add_argument(
        "--agent-count",
        type=int,
        default=config.AGENT_COUNT,
        help=f"Number of agents to spawn (default: {config.AGENT_COUNT})",
    )
    parser.add_argument(
        "--cluster-id",
        type=str,
        default=config.CLUSTER_ID,
        help=f"Cluster ID for bridge_db grouping (default: {config.CLUSTER_ID})",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help=f"Anthropic model override (default: {config.ANTHROPIC_MODEL})",
    )
    parser.add_argument(
        "--run-dir",
        type=str,
        default=config.RUN_DIR,
        help=f"Base directory for sandbox runs (default: {config.RUN_DIR})",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level (default: INFO)",
    )
    args = parser.parse_args()

    # Configure logging
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    # Override model if specified
    if args.model:
        config.ANTHROPIC_MODEL = args.model

    # Validate API key
    if not config.ANTHROPIC_API_KEY:
        print("ERROR: ANTHROPIC_API_KEY environment variable is required", file=sys.stderr)
        sys.exit(1)

    # Create and run orchestrator
    orch = SandboxV2Orchestrator(
        agent_count=args.agent_count,
        cluster_id=args.cluster_id,
        run_dir_base=args.run_dir,
    )

    async def _run() -> None:
        await orch.init()
        await orch.run(cycles=args.cycles)

    asyncio.run(_run())


if __name__ == "__main__":
    main()
