"""
SWAT Patrol Swarm — Evaluation CLI

Run from the patrolswarm/ directory:

    # Mock mode using the pre-processed notebook dataset (default):
    python -m eval.run_eval --mode mock --n-positive 200

    # Explicit path to the processed dataset:
    python -m eval.run_eval --mode mock \\
        --dataset-path eval_output/pii_agent_swarm/agent_swarm_docs.parquet

    # Fall back to downloading directly from HuggingFace:
    python -m eval.run_eval --mode live --dataset-path hf --n-positive 200

    # Live mode with thinking logs captured to file:
    PATROL_THINKING=1 python -m eval.run_eval --mode live --n-positive 10 \\
        --log-file eval_output/thinking_eval.log

Outputs (written to --output-dir, default eval_output):
    eval_results.json          Raw results + metrics (for dashboard)
    eval_summary.png           2×2 metrics dashboard
    eval_confidence_dist.png   TP vs FP confidence histogram
    eval_latency.png           Swarm throughput curve
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

from .dataset import load_nemotron_pii, load_processed_pii
from .harness import run_evaluation
from .metrics import compute_metrics
from .charts import generate_eval_charts


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m eval.run_eval",
        description="SWAT Patrol Swarm — Evaluation Harness (NVIDIA Nemotron-PII)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument(
        "--mode",
        choices=["live", "mock"],
        default="mock",
        help=(
            "'live' calls the real patrol swarm (Brev NIM endpoints required); "
            "'mock' uses regex-based simulation (no LLM calls)."
        ),
    )
    p.add_argument(
        "--n-positive",
        type=int,
        default=3,
        metavar="N",
        help="Number of documents to evaluate (all are positive — all contain PII).",
    )
    p.add_argument(
        "--output-dir",
        type=str,
        default="eval_output",
        metavar="DIR",
        help="Directory to write eval_results.json and chart PNGs into.",
    )
    _default_dataset = str(
        Path(__file__).parent / "eval_output" / "pii_agent_swarm" / "agent_swarm_docs.parquet"
    )
    p.add_argument(
        "--dataset-path",
        type=str,
        default=_default_dataset,
        metavar="PATH",
        help=(
            "Path to the pre-processed PII parquet (or CSV) produced by "
            "nvidia_pii_processing.ipynb.  Defaults to the canonical notebook "
            "output.  Pass 'hf' to download the raw dataset from HuggingFace instead."
        ),
    )
    p.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
        help="Logging verbosity. INFO shows [THINKING] blocks when PATROL_THINKING=1.",
    )
    p.add_argument(
        "--log-file",
        dest="log_file",
        type=str,
        default=None,
        metavar="PATH",
        help="Mirror all agent logs to this file in addition to stderr.",
    )
    return p


def main() -> None:
    args = _build_parser().parse_args()
    output_dir = args.output_dir
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Configure logging before any patrol_swarm imports so [THINKING] logs appear.
    log_format = "%(asctime)s %(levelname)-8s %(name)s — %(message)s"
    log_datefmt = "%Y-%m-%dT%H:%M:%S"
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format=log_format,
        datefmt=log_datefmt,
        stream=sys.stderr,
    )
    if args.log_file:
        fh = logging.FileHandler(args.log_file, encoding="utf-8")
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(logging.Formatter(log_format, datefmt=log_datefmt))
        logging.getLogger().addHandler(fh)
        print(f"Agent logs captured to: {args.log_file}")

    _banner(args)

    # ── Load dataset ─────────────────────────────────────────────────────
    try:
        if args.dataset_path.lower() == "hf":
            positive_docs, negative_docs, all_labels = load_nemotron_pii(
                args.n_positive, 0
            )
        else:
            positive_docs, negative_docs, all_labels = load_processed_pii(
                args.dataset_path, args.n_positive
            )
    except (RuntimeError, ImportError, FileNotFoundError) as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    # ── Run evaluation ───────────────────────────────────────────────────
    results = asyncio.run(
        run_evaluation(positive_docs, negative_docs, mode=args.mode)
    )

    # ── Compute metrics ──────────────────────────────────────────────────
    metrics = compute_metrics(results)

    # ── Persist raw results ──────────────────────────────────────────────
    results_path = str(Path(output_dir) / "eval_results.json")
    payload = {"results": results, "metrics": metrics}
    with open(results_path, "w") as f:
        json.dump(payload, f, indent=2, default=str)
    print(f"\n  Saved {results_path}")

    # ── Generate charts ──────────────────────────────────────────────────
    print("\nGenerating evaluation charts...")
    chart_paths = generate_eval_charts(results, metrics, output_dir=output_dir)

    # ── Summary ──────────────────────────────────────────────────────────
    sep = "=" * 60
    print(f"\n{sep}")
    print("EVALUATION COMPLETE")
    print(sep)
    print(f"  Results:   {results_path}")
    for p in chart_paths:
        print(f"  Chart:     {p}")
    print()
    print("  Key numbers:")
    print(f"    Precision: {metrics['precision']:.1%}")
    print(f"    Recall:    {metrics['recall']:.1%}")
    print(f"    F1 Score:  {metrics['f1']:.1%}")
    print(f"    Accuracy:  {metrics['accuracy']:.1%}")
    print(sep)


def _banner(args: argparse.Namespace) -> None:
    sep = "=" * 60
    print(sep)
    print("SWAT PATROL SWARM — EVALUATION HARNESS")
    dataset_label = (
        "NVIDIA Nemotron-PII (HuggingFace)"
        if args.dataset_path.lower() == "hf"
        else args.dataset_path
    )
    print(f"Dataset:      {dataset_label}")
    print(f"Mode:         {args.mode.upper()}")
    print(f"Documents:    {args.n_positive}  (all PII-positive — recall-only eval)")
    print(f"Output dir:   {args.output_dir}")
    print(sep)


if __name__ == "__main__":
    main()
