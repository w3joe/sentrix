"""
Evaluation harness — patrol swarm interface for the eval loop.

Provides two evaluation backends:

* ``mock_patrol_evaluate`` — pure-Python regex mock, no LLM calls required.
  Simulates realistic ~90 % recall / ~88 % precision for testing the harness
  and charting pipeline without Brev NIM endpoints.

* ``live_patrol_evaluate`` — calls the real patrol swarm via
  ``patrol_swarm.sweep.evaluate_single_document``.  Requires the
  ``patrol_swarm`` package and Brev NIM endpoints to be running.

``run_evaluation`` drives the full positive/negative evaluation loop and
returns a structured results dict consumed by ``metrics.compute_metrics``
and ``charts.generate_eval_charts``.
"""

import asyncio
import random
import re
import time
from datetime import datetime, timezone
from typing import Optional

from .dataset import CRITICAL_PII_LABELS

# ─────────────────────────────────────────────
# Shared agent profile used during evaluation
# ─────────────────────────────────────────────
MOCK_AGENT_PROFILE: dict = {
    "id": "eval-target-001",
    "name": "eval-email-agent",
    "role": "email_agent",
    "agent_type": "email",
    "declared_scope": "internal email",
    "permitted_tools": ["email_send", "email_read"],
    "permitted_domains": ["internal.company.com"],
    "data_scope": ["internal_only"],
    "status": "active",
    "criminal_points": 0,
}

# ─────────────────────────────────────────────
# Domain normaliser
# ─────────────────────────────────────────────
_EMAIL_KEYWORDS = frozenset({"email", "mail", "inbox", "message", "correspondence"})
_CODE_KEYWORDS  = frozenset({"code", "software", "dev", "git", "commit", "pull request", "pr"})


def _normalise_patrol_domain(raw_domain: str) -> str:
    """
    Map any dataset domain string to one of the three patrol agent domains.

    ``evaluate_single_document`` in sweep.py uses ``document_domain`` to set
    ``profile["agent_type"]``, which the patrol registry matches on.  Valid
    values are ``"email"``, ``"code"``, and ``"document"``.

    The Nemotron-PII dataset uses industry names ("Brokerage", "Mortgage",
    "Healthcare", etc.) which don't match any patrol domain, causing all
    targets to be silently skipped.  This function normalises them.
    """
    d = raw_domain.lower()
    if any(kw in d for kw in _EMAIL_KEYWORDS):
        return "email"
    if any(kw in d for kw in _CODE_KEYWORDS):
        return "code"
    return "document"


# Pre-compiled patterns for the mock evaluator
_PII_PATTERNS: dict[str, re.Pattern] = {
    "ssn": re.compile(r"\d{3}-\d{2}-\d{4}"),
    "credit_debit_card": re.compile(r"\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}"),
    "password": re.compile(r"p@ss|password|P@SS", re.IGNORECASE),
    "pin": re.compile(r"pin[=:\s]\d{4}", re.IGNORECASE),
    "cvv": re.compile(r"cvv[=:\s]\d{3}", re.IGNORECASE),
    "bank_routing_number": re.compile(r"\b\d{9}\b"),
    "biometric_identifier": re.compile(r"BIOMETRIC_\d+", re.IGNORECASE),
}


# ─────────────────────────────────────────────
# Mock evaluator
# ─────────────────────────────────────────────
async def mock_patrol_evaluate(
    document_text: str,
    document_domain: str,
    agent_profile: dict,
    permitted_scope: list[str],
) -> Optional[dict]:
    """
    Simulate patrol swarm behaviour with realistic accuracy characteristics.

    Uses regex heuristics to detect critical PII labels, then applies
    probabilistic noise to simulate:
      - ~90 % recall  (true positive rate)
      - ~88 % precision  (12 % false positive rate on negatives)
      - ~85 % per-label detection rate

    Returns a ``PatrolFlag``-shaped dict when flagged, ``None`` when clean.
    This is a drop-in replacement for ``live_patrol_evaluate`` during offline
    testing and harness development.
    """
    await asyncio.sleep(random.uniform(0.01, 0.05))

    detected_labels = [
        label
        for label, pattern in _PII_PATTERNS.items()
        if pattern.search(document_text)
    ]
    has_critical = bool(detected_labels)

    if has_critical:
        flagged = random.random() < 0.90
        if flagged:
            # Per-label recall ~85 %
            detected_labels = [l for l in detected_labels if random.random() < 0.85]
            if not detected_labels:
                detected_labels = [random.choice(list(CRITICAL_PII_LABELS))]
        else:
            detected_labels = []
    else:
        # False positive rate ~12 %
        flagged = random.random() < 0.12
        if flagged:
            detected_labels = [random.choice(list(CRITICAL_PII_LABELS))]

    if not flagged:
        return None

    return {
        "flag_id": f"eval-flag-{random.randint(10_000, 99_999)}",
        "target_agent_id": agent_profile["id"],
        "consensus_severity": random.choice(["HIGH", "MEDIUM", "LOW"]),
        "consensus_confidence": round(random.uniform(0.65, 0.98), 3),
        "pii_labels_union": detected_labels,
        "combined_evidence": (
            f"Detected {len(detected_labels)} PII entities in {document_domain} content."
        ),
        "pheromone_level": round(random.uniform(0.4, 0.95), 3),
        "votes": [
            {
                "source_agent": "email_patrol",
                "severity": "HIGH",
                "confidence": round(random.uniform(0.6, 0.99), 3),
            },
            {
                "source_agent": "doc_patrol",
                "severity": "MEDIUM",
                "confidence": round(random.uniform(0.5, 0.95), 3),
            },
        ],
    }


# ─────────────────────────────────────────────
# Live evaluator
# ─────────────────────────────────────────────
async def live_patrol_evaluate(
    document_text: str,
    document_domain: str,
    agent_profile: dict,
    permitted_scope: list[str],
) -> Optional[dict]:
    """
    Call the actual patrol swarm via ``patrol_swarm.sweep.evaluate_single_document``.

    Requires:
      - The ``patrol_swarm`` package importable from the current environment.
      - Brev NIM endpoints configured via the ``.env`` file.

    Raises ``RuntimeError`` if the import fails (rather than silently falling
    back to mock), so evaluation runs are never quietly degraded in live mode.
    """
    try:
        from patrol_swarm.sweep import evaluate_single_document  # type: ignore[import]
    except ImportError as exc:
        raise RuntimeError(
            "Cannot import patrol_swarm — ensure you are running from the "
            "patrolswarm/ directory with the package installed.\n"
            f"Original error: {exc}"
        ) from exc

    result = await evaluate_single_document(
        document_text=document_text,
        document_domain=document_domain,
        agent_profile=agent_profile,
        permitted_scope=permitted_scope,
    )
    return result.model_dump() if result is not None else None


# ─────────────────────────────────────────────
# Evaluation loop
# ─────────────────────────────────────────────
async def run_evaluation(
    positive_docs: list[dict],
    negative_docs: list[dict],
    mode: str = "mock",
) -> dict:
    """
    Run the full evaluation loop over positive and negative document sets.

    Parameters
    ----------
    positive_docs :
        Documents that contain critical PII and *should* be flagged.
    negative_docs :
        Documents that are clean and *should not* be flagged.
    mode :
        ``"mock"`` to use the offline regex evaluator, ``"live"`` to call
        the real patrol swarm endpoints.

    Returns
    -------
    dict
        Structured results dict with keys ``positive``, ``negative``,
        and ``metadata``.  Passed directly to ``compute_metrics`` and
        ``generate_eval_charts``.
    """
    evaluate_fn = live_patrol_evaluate if mode == "live" else mock_patrol_evaluate

    results: dict = {
        "positive": [],
        "negative": [],
        "metadata": {
            "mode": mode,
            "n_positive": len(positive_docs),
            "n_negative": len(negative_docs),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "critical_pii_labels": sorted(CRITICAL_PII_LABELS),
        },
    }

    # ── Evaluate positive documents ──────────────────────────────────────
    print(f"\nEvaluating {len(positive_docs)} positive documents (should flag)...")
    start = time.monotonic()

    for i, doc in enumerate(positive_docs):
        text = doc.get("text", "")
        spans = doc.get("spans", [])
        raw_domain = doc.get("domain", "document")
        domain = _normalise_patrol_domain(raw_domain)
        actual_labels = [
            s["label"] for s in spans if s.get("label")
        ]

        # ── Debug: show what we're about to evaluate ──────────────────
        preview = text[:120].replace("\n", " ")
        print(
            f"\n  [+{i+1}] domain={raw_domain!r} → patrol={domain!r}"
            f"\n         labels={actual_labels}"
            f"\n         text preview: {preview!r}"
        )

        flag = await evaluate_fn(text, domain, MOCK_AGENT_PROFILE, ["internal_only"])

        outcome = (
            f"FLAGGED  severity={flag['consensus_severity']} "
            f"confidence={flag['consensus_confidence']} "
            f"detected={flag['pii_labels_union']}"
            if flag else "clean (no flag)"
        )
        print(f"         → {outcome}")

        results["positive"].append({
            "doc_index": i,
            "flagged": flag is not None,
            "ground_truth": True,
            "actual_labels": actual_labels,
            "detected_labels": flag["pii_labels_union"] if flag else [],
            "confidence": flag["consensus_confidence"] if flag else 0.0,
            "severity": flag.get("consensus_severity", "CLEAN") if flag else "CLEAN",
        })

        if (i + 1) % 50 == 0:
            elapsed = time.monotonic() - start
            print(f"  [{i + 1}/{len(positive_docs)}] {elapsed:.1f}s elapsed")

    # ── Evaluate negative documents ──────────────────────────────────────
    print(f"\nEvaluating {len(negative_docs)} negative documents (should NOT flag)...")
    neg_start = time.monotonic()

    for i, doc in enumerate(negative_docs):
        text = doc.get("text", "")
        raw_domain = doc.get("domain", "document")
        domain = _normalise_patrol_domain(raw_domain)

        # ── Debug: show what we're about to evaluate ──────────────────
        preview = text[:120].replace("\n", " ")
        print(
            f"\n  [-{i+1}] domain={raw_domain!r} → patrol={domain!r}"
            f"\n         text preview: {preview!r}"
        )

        flag = await evaluate_fn(text, domain, MOCK_AGENT_PROFILE, ["internal_only"])

        outcome = (
            f"FLAGGED  severity={flag['consensus_severity']} "
            f"confidence={flag['consensus_confidence']} "
            f"detected={flag['pii_labels_union']}"
            if flag else "clean (no flag)"
        )
        print(f"         → {outcome}")

        results["negative"].append({
            "doc_index": i,
            "flagged": flag is not None,
            "ground_truth": False,
            "actual_labels": [],
            "detected_labels": flag["pii_labels_union"] if flag else [],
            "confidence": flag["consensus_confidence"] if flag else 0.0,
            "severity": flag.get("consensus_severity", "CLEAN") if flag else "CLEAN",
        })

        if (i + 1) % 50 == 0:
            elapsed = time.monotonic() - neg_start
            print(f"  [{i + 1}/{len(negative_docs)}] {elapsed:.1f}s elapsed")

    total_time = time.monotonic() - start
    results["metadata"]["total_eval_time_sec"] = round(total_time, 2)
    return results
