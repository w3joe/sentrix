"""
Metrics computation for the SWAT Patrol Swarm evaluation harness.

``compute_metrics`` takes the raw results dict produced by
``harness.run_evaluation`` and returns a structured metrics dict containing:

  - Confusion matrix counts (TP / FP / FN / TN)
  - Precision, Recall, F1, Accuracy
  - Per-label recall across the NVIDIA Nemotron-PII label taxonomy
  - Confidence score distributions for true/false positives
  - Severity distribution across flagged documents
"""

from collections import defaultdict

import numpy as np

from .dataset import CRITICAL_PII_LABELS


def compute_metrics(results: dict) -> dict:
    """
    Compute precision, recall, F1, accuracy, and per-label recall from
    evaluation results.

    Parameters
    ----------
    results :
        Dict returned by ``harness.run_evaluation`` with keys ``positive``,
        ``negative``, and ``metadata``.

    Returns
    -------
    dict
        Metrics dict ready for serialisation and chart generation.
    """
    pos = results["positive"]
    neg = results["negative"]

    tp = sum(1 for r in pos if r["flagged"])
    fn = sum(1 for r in pos if not r["flagged"])
    fp = sum(1 for r in neg if r["flagged"])
    tn = sum(1 for r in neg if not r["flagged"])

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1        = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0 else 0.0
    )
    accuracy  = (tp + tn) / (tp + tn + fp + fn) if (tp + tn + fp + fn) > 0 else 0.0

    # ── Per-label detection rates (from Nemotron-PII taxonomy) ──────────
    label_stats: dict = defaultdict(lambda: {"actual": 0, "detected": 0})
    for r in pos:
        for label in r["actual_labels"]:
            label_stats[label]["actual"] += 1
            if label in r["detected_labels"]:
                label_stats[label]["detected"] += 1

    per_label: dict = {}
    for label, stats in label_stats.items():
        rate = stats["detected"] / stats["actual"] if stats["actual"] > 0 else 0.0
        per_label[label] = {
            "actual_count": stats["actual"],
            "detected_count": stats["detected"],
            "recall": round(rate, 4),
        }

    # ── Confidence distributions ─────────────────────────────────────────
    tp_confs = [r["confidence"] for r in pos if r["flagged"]]
    fp_confs = [r["confidence"] for r in neg if r["flagged"]]

    confidence_distribution = {
        "true_positive_mean": round(float(np.mean(tp_confs)), 4) if tp_confs else 0.0,
        "true_positive_std":  round(float(np.std(tp_confs)), 4)  if tp_confs else 0.0,
        "false_positive_mean": round(float(np.mean(fp_confs)), 4) if fp_confs else 0.0,
        "false_positive_std":  round(float(np.std(fp_confs)), 4)  if fp_confs else 0.0,
    }

    # ── Severity distribution (flagged documents only) ───────────────────
    severity_dist: dict = defaultdict(int)
    for r in pos:
        if r["flagged"]:
            severity_dist[r["severity"]] += 1

    metrics: dict = {
        "confusion_matrix": {"tp": tp, "fn": fn, "fp": fp, "tn": tn},
        "precision": round(precision, 4),
        "recall":    round(recall, 4),
        "f1":        round(f1, 4),
        "accuracy":  round(accuracy, 4),
        "per_label": per_label,
        "confidence_distribution": confidence_distribution,
        "severity_distribution": dict(severity_dist),
        "total_evaluated": len(pos) + len(neg),
    }

    _print_report(metrics)
    return metrics


# ─────────────────────────────────────────────
# Pretty-print helpers
# ─────────────────────────────────────────────
def _print_report(metrics: dict) -> None:
    cm = metrics["confusion_matrix"]
    width = 60

    print("\n" + "=" * width)
    print("PATROL SWARM EVALUATION RESULTS")
    print("=" * width)
    print(f"  Documents evaluated:  {metrics['total_evaluated']}")
    print(f"  True Positives (caught):   {cm['tp']}")
    print(f"  False Negatives (missed):  {cm['fn']}")
    if cm['fp'] + cm['tn'] > 0:
        print(f"  False Positives:           {cm['fp']}")
        print(f"  True Negatives:            {cm['tn']}")
    else:
        print(f"  (No negative documents — recall-only evaluation)")
    print(f"  {'─' * (width - 4)}")
    print(f"  Recall:               {metrics['recall']:.2%}  ← primary metric")
    if cm['fp'] + cm['tn'] > 0:
        print(f"  Precision:            {metrics['precision']:.2%}")
        print(f"  F1 Score:             {metrics['f1']:.2%}")
        print(f"  Accuracy:             {metrics['accuracy']:.2%}")
    print(f"  {'─' * (width - 4)}")
    print("  Per-label recall:")

    sorted_labels = sorted(
        metrics["per_label"].items(), key=lambda x: -x[1]["recall"]
    )
    for label, stats in sorted_labels:
        bar = "█" * int(stats["recall"] * 20)
        print(
            f"    {label:30s} {stats['recall']:.1%} {bar} "
            f"({stats['detected_count']}/{stats['actual_count']})"
        )

    print("=" * width)
