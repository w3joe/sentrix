#!/usr/bin/env python3
"""CLI entrypoint for the agentic sandbox.

Usage:
    python -m sandbox.run [--reuse]
    python -m sandbox.run --init-only [--reuse]

Flags:
    --reuse       Reuse the most recent sandbox directory instead of creating
                  a new one.
    --init-only   Initialise the sandbox (clone repo, plant assets) but do not
                  start the agent loop.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from sandbox.orchestrator import SandboxOrchestrator


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Agentic Sandbox — Production Mimicry for Police Swarm",
    )
    parser.add_argument(
        "--reuse",
        action="store_true",
        help="Reuse the most recent sandbox directory",
    )
    parser.add_argument(
        "--init-only",
        action="store_true",
        help="Only initialise the sandbox; do not start agents",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    orch = SandboxOrchestrator(reuse_last=args.reuse)

    try:
        sandbox_root = orch.init()
    except Exception:
        logging.exception("Failed to initialise sandbox")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"  Sandbox ready: {sandbox_root}")
    print(f"  Session ID:    {orch.telemetry.session_id}")
    print(f"  Telemetry:     {sandbox_root / 'telemetry' / 'events.jsonl'}")
    print(f"  Agents:        {[a.agent_id for a in orch.agents]}")
    print(f"{'='*60}\n")

    if args.init_only:
        print("--init-only: sandbox initialised. Exiting.")
        return

    try:
        asyncio.run(orch.run())
    except KeyboardInterrupt:
        print("\nShutting down sandbox (Ctrl+C) …")


if __name__ == "__main__":
    main()
