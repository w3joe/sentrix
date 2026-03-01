"""
CLI entrypoint for the Patrol Swarm.

Usage:
    # Single sweep cycle against a specific sandbox run:
    python -m patrol_swarm.main --mode single --sandbox-run ../sandbox_runs/sandbox_20260226_215749_16f339

    # Single sweep cycle using the SANDBOX_RUN env var (or auto-detect latest):
    SANDBOX_RUN=latest python -m patrol_swarm.main --mode single

    # Continuous scheduler with sandbox run:
    python -m patrol_swarm.main --mode continuous --sandbox-run ../sandbox_runs/sandbox_*

    # Evaluate a single document file:
    python -m patrol_swarm.main --mode eval --domain email --file /path/to/email.txt

Environment variables required:
    SANDBOX_RUN          — Path to a sandbox run directory, or "latest" to auto-detect
    BREV_NANO_ENDPOINT   — Brev NIM endpoint for Nemotron 3 Nano
    BREV_SUPER_ENDPOINT  — Brev NIM endpoint for Nemotron 3 Super
    BREV_API_KEY         — Brev API key
    LANGCHAIN_API_KEY    — LangSmith API key (optional but recommended)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

import patrol_swarm.config as cfg

# Configure logging before any patrol_swarm imports
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("patrol_swarm.main")

# ─── Sandbox run loader ───────────────────────────────────────────────────────


def _resolve_sandbox_run(sandbox_run: str) -> tuple[dict, dict]:
    """
    Resolve a --sandbox-run argument to (agent_registry, pending_actions).

    Accepts:
      - "latest"    : auto-detect the most recent run under ../sandbox_runs/
      - a directory : path to a specific sandbox run directory
    """
    from patrol_swarm.sandbox_bridge import (
        latest_sandbox_run,
        load_sandbox_run,
    )

    if sandbox_run.lower() == "latest":
        # Look relative to the patrolswarm/ package (one level up from patrol_swarm/)
        package_dir = Path(__file__).resolve().parent.parent
        candidates = [
            package_dir / "sandbox_runs",       # patrolswarm/sandbox_runs/
            package_dir.parent / "sandbox_runs", # project root sandbox_runs/
            package_dir.parent / "sandbox",      # project root sandbox/ (local runs)
        ]
        run_path = None
        for base in candidates:
            run_path = latest_sandbox_run(base)
            if run_path:
                logger.info("Auto-detected latest sandbox run: %s", run_path)
                break
        if run_path is None:
            logger.error(
                "No sandbox runs found. Run the sandbox first, or pass an explicit path."
            )
            sys.exit(1)
    else:
        run_path = Path(sandbox_run)

    try:
        return load_sandbox_run(run_path)
    except FileNotFoundError as exc:
        logger.error("Sandbox run load error: %s", exc)
        sys.exit(1)


# ─── Mode handlers ────────────────────────────────────────────────────────────


async def run_single(args: argparse.Namespace) -> None:
    """Execute one sweep cycle and print results."""
    from patrol_swarm.sweep import run_sweep_cycle

    sandbox_run = args.sandbox_run or cfg.SANDBOX_RUN
    if not sandbox_run:
        logger.error(
            "No data source specified. Pass --sandbox-run PATH or set SANDBOX_RUN env var."
        )
        sys.exit(1)

    agent_registry, pending_actions = _resolve_sandbox_run(sandbox_run)
    logger.info(
        "Running single sweep cycle against sandbox run (agents=%d, active=%d)…",
        len(agent_registry),
        sum(1 for v in pending_actions.values() if v),
    )

    flags, final_state = await run_sweep_cycle(
        agent_registry=agent_registry,
        pending_actions=pending_actions,
    )

    print("\n" + "═" * 60)
    print(f"SWEEP COMPLETE | Cycle {final_state.get('current_cycle', 1)}")
    print(f"PatrolFlags produced: {len(flags)}")
    print("═" * 60)

    if flags:
        for flag in flags:
            print("\n🚨 PATROL FLAG:")
            print(flag.model_dump_json(indent=2))

        # POST each flag to the investigation API (same as continuous mode)
        import httpx
        for flag in flags:
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        f"http://localhost:{cfg.INVESTIGATION_API_PORT}"
                        "/api/investigation/investigate",
                        json=flag.to_superintendent_payload(),
                        timeout=5.0,
                    )
                    inv_id = resp.json().get("investigation_id")
                    logger.info(
                        "Investigation opened for %s → %s",
                        flag.target_agent_id,
                        inv_id,
                    )
            except Exception as exc:
                logger.warning(
                    "Could not reach investigation API for %s: %s",
                    flag.target_agent_id,
                    exc,
                )
    else:
        print("\n✅ No violations detected this cycle.")

    phero = final_state.get("pheromone_map", {})
    if phero:
        print(f"\nPheromone map: {json.dumps(phero, indent=2)}")

    sweeps = final_state.get("sweep_results", [])
    if sweeps:
        print(f"\nSweep metrics: {json.dumps(sweeps[-1], indent=2, default=str)}")


async def run_continuous(args: argparse.Namespace) -> None:
    """Start the APScheduler-driven continuous patrol loop with durable persistence."""
    from patrol_swarm.persistence import get_checkpointer, load_persisted_state
    from patrol_swarm.sweep import start_scheduler

    logger.info("Starting continuous patrol swarm (Ctrl+C to stop)…")

    from patrol_swarm.sandbox_bridge import SandboxLiveConnector, latest_sandbox_run

    sandbox_run = args.sandbox_run or cfg.SANDBOX_RUN
    if not sandbox_run:
        logger.error(
            "No data source specified. Pass --sandbox-run PATH or set SANDBOX_RUN env var."
        )
        sys.exit(1)

    if sandbox_run.lower() == "latest":
        package_dir = Path(__file__).resolve().parent.parent
        candidates = [
            package_dir / "sandbox_runs",
            package_dir.parent / "sandbox_runs",
            package_dir.parent / "sandbox",
        ]
        run_path = None
        for base in candidates:
            run_path = latest_sandbox_run(base)
            if run_path:
                logger.info("Auto-detected latest sandbox run: %s", run_path)
                break
        if run_path is None:
            logger.error(
                "No sandbox runs found. Run the sandbox first, or pass an explicit path."
            )
            sys.exit(1)
    else:
        run_path = Path(sandbox_run)

    connector = SandboxLiveConnector(run_path)
    try:
        agent_registry = connector.get_agent_registry()
    except FileNotFoundError as exc:
        logger.error("Sandbox run load error: %s", exc)
        sys.exit(1)

    logger.info(
        "Live connector attached to %s (%d agents)",
        run_path.name,
        len(agent_registry),
    )
    _pending_actions_fn = connector.get_pending_actions

    async with get_checkpointer() as checkpointer:
        # Report whether we're resuming or cold-starting
        prior = await load_persisted_state(checkpointer)
        if prior:
            cycle = prior.get("current_cycle", 0)
            phero = prior.get("pheromone_map", {})
            logger.info(
                "Resuming from persisted state: cycle=%d, "
                "pheromone_entries=%d (process restart survived)",
                cycle, len(phero),
            )
        else:
            logger.info("No prior checkpoint found — cold start.")

        scheduler = start_scheduler(
            agent_registry=agent_registry,
            pending_actions_fn=_pending_actions_fn,
            checkpointer=checkpointer,
        )

        try:
            while True:
                await asyncio.sleep(3600)
        except (KeyboardInterrupt, asyncio.CancelledError):
            logger.info("Interrupt received — shutting down scheduler…")
            scheduler.stop()


async def run_eval(args: argparse.Namespace) -> None:
    """Evaluate a single document file through the swarm pipeline."""
    from patrol_swarm.sweep import evaluate_single_document

    if not args.file:
        logger.error("--file is required for eval mode")
        sys.exit(1)

    fpath = Path(args.file)
    if not fpath.exists():
        logger.error("File not found: %s", fpath)
        sys.exit(1)

    document_text = fpath.read_text(encoding="utf-8")
    domain = args.domain or "document"

    logger.info("Evaluating %s as domain=%s…", fpath.name, domain)

    agent_profile = {
        "declared_scope": f"evaluation of {domain} artefact",
    }
    permitted_scope: list[str] = []

    flag = await evaluate_single_document(
        document_text=document_text,
        document_domain=domain,
        agent_profile=agent_profile,
        permitted_scope=permitted_scope,
    )

    if flag:
        print("\n🚨 PATROL FLAG PRODUCED:")
        print(flag.model_dump_json(indent=2))
    else:
        print("\n✅ Document evaluated as CLEAN — no quorum reached.")


# ─── Argument parsing + main ──────────────────────────────────────────────────


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="patrol_swarm",
        description="SWAT Patrol Swarm — stigmergic AI agent oversight system",
    )
    parser.add_argument(
        "--mode",
        choices=["single", "continuous", "eval"],
        default="single",
        help="Execution mode (default: single)",
    )
    parser.add_argument(
        "--sandbox-run",
        dest="sandbox_run",
        type=str,
        default=None,
        metavar="PATH",
        help=(
            "Path to a sandbox run directory (e.g. ../sandbox_runs/sandbox_20260226_*). "
            "Pass 'latest' to auto-detect the most recent run. "
            "Falls back to SANDBOX_RUN env var if not provided."
        ),
    )
    parser.add_argument(
        "--domain",
        choices=["email", "code", "document"],
        default="document",
        help="Document domain for eval mode",
    )
    parser.add_argument(
        "--file",
        type=str,
        default=None,
        help="Path to document file for eval mode",
    )
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
        help="Logging verbosity",
    )
    parser.add_argument(
        "--thinking",
        action="store_true",
        default=False,
        help=(
            "Enable model chain-of-thought reasoning. "
            "Suppresses /no_think prefix and logs <think> blocks at INFO level. "
            "Equivalent to PATROL_THINKING=1."
        ),
    )
    parser.add_argument(
        "--log-file",
        dest="log_file",
        type=str,
        default=None,
        metavar="PATH",
        help="Write all agent logs to this file in addition to stdout.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    # Apply --thinking BEFORE any patrol_swarm import so config.py picks it up.
    # All patrol_swarm modules are lazily imported inside the handler functions.
    if args.thinking:
        os.environ["PATROL_THINKING"] = "1"

    # Adjust log level
    logging.getLogger().setLevel(getattr(logging, args.log_level))

    # Optional file capture — attach a handler so all agent logs go to disk too.
    if args.log_file:
        fh = logging.FileHandler(args.log_file, encoding="utf-8")
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)-8s %(name)s — %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
        ))
        logging.getLogger().addHandler(fh)
        logger.info("Agent logs captured to: %s", args.log_file)

    if args.thinking:
        logger.info("Thinking mode ON — model chain-of-thought will be logged")

    mode_map = {
        "single": run_single,
        "continuous": run_continuous,
        "eval": run_eval,
    }

    handler = mode_map[args.mode]
    asyncio.run(handler(args))


if __name__ == "__main__":
    main()
