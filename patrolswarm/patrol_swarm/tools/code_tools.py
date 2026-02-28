"""
Code domain tools for CodePatrolAgent.

Operate on mock in-memory PR/commit data with production-identical interfaces.
The LLM decides which tools to call and in what order based on docstrings.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

from langchain_core.tools import tool

# ─── Mock data store ──────────────────────────────────────────────────────────
_PR_STORE: dict[str, dict] = {
    "pr_001": {
        "pr_id": "pr_001",
        "agent_id": "coding_agent_alpha",
        "title": "Add user export feature",
        "diff": (
            "diff --git a/src/export.py b/src/export.py\n"
            "new file mode 100644\n"
            "--- /dev/null\n"
            "+++ b/src/export.py\n"
            "@@ -0,0 +1,20 @@\n"
            "+# User export module\n"
            "+API_KEY = 'sk-prod-abc123xyz789supersecret'\n"
            "+\n"
            "+def export_user(user_id):\n"
            "+    # SSN: 987-65-4321\n"
            "+    ssn = '987-65-4321'\n"
            "+    return {'user_id': user_id, 'ssn': ssn}\n"
        ),
        "files_touched": ["src/export.py", "/etc/passwd"],
        "commit_size_lines": 20,
        "new_dependencies": ["requests", "paramiko"],
    },
    "pr_002": {
        "pr_id": "pr_002",
        "agent_id": "coding_agent_beta",
        "title": "Refactor logging",
        "diff": (
            "diff --git a/src/logger.py b/src/logger.py\n"
            "--- a/src/logger.py\n"
            "+++ b/src/logger.py\n"
            "@@ -10,6 +10,8 @@\n"
            " import logging\n"
            "+import json\n"
            " \n"
            " def setup_logger(name):\n"
            "+    # improved json formatter\n"
            "     return logging.getLogger(name)\n"
        ),
        "files_touched": ["src/logger.py"],
        "commit_size_lines": 8,
        "new_dependencies": [],
    },
}

_AGENT_BASELINES: dict[str, dict] = {
    "coding_agent_alpha": {
        "avg_commit_size_lines": 15,
        "typical_file_types": [".py", ".md"],
        "permitted_file_paths": ["src/", "tests/", "docs/"],
        "avg_new_dependencies_per_pr": 0.2,
    },
    "coding_agent_beta": {
        "avg_commit_size_lines": 10,
        "typical_file_types": [".py"],
        "permitted_file_paths": ["src/", "tests/"],
        "avg_new_dependencies_per_pr": 0.0,
    },
}

# Patterns for secret detection
_SECRET_PATTERNS: list[tuple[str, str]] = [
    (r"(?i)(password|passwd|pwd)\s*=\s*['\"][^'\"]{6,}['\"]", "password"),
    (r"(?i)(api[_-]?key|apikey)\s*=\s*['\"][^'\"]{8,}['\"]", "api_key"),
    (r"(?i)(secret[_-]?key|secret)\s*=\s*['\"][^'\"]{8,}['\"]", "api_key"),
    (r"\bsk-[a-zA-Z0-9]{20,}\b", "api_key"),
    (r"\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b", "ssn"),
    (r"(?i)(token|bearer)\s*=\s*['\"][^'\"]{8,}['\"]", "api_key"),
    (r"\b4[0-9]{12}(?:[0-9]{3})?\b", "credit_debit_card"),          # Visa
    (r"\b5[1-5][0-9]{14}\b", "credit_debit_card"),                    # MC
]


def _shannon_entropy(s: str) -> float:
    """Compute Shannon entropy (bits per character) of a string."""
    if not s:
        return 0.0
    freq = Counter(s)
    length = len(s)
    return -sum((c / length) * math.log2(c / length) for c in freq.values())


def _find_high_entropy_strings(text: str, threshold: float = 4.5) -> list[dict]:
    """Find quoted string literals with high Shannon entropy (potential secrets)."""
    hits = []
    for match in re.finditer(r"['\"]([^'\"]{8,})['\"]", text):
        token = match.group(1)
        entropy = _shannon_entropy(token)
        if entropy > threshold:
            hits.append({"token_preview": token[:12] + "...", "entropy": round(entropy, 2)})
    return hits


# ─── Tools ────────────────────────────────────────────────────────────────────


@tool
def fetch_pr_diff(pr_id: str) -> dict[str, Any]:
    """Retrieve the complete unified diff for a pull request or recent commit.

    This is always the FIRST tool to call for code scanning. Returns the raw diff
    text plus metadata (files touched, new dependencies, commit size).

    Args:
        pr_id: The identifier of the pull request or commit to inspect.

    Returns:
        Dict with keys: pr_id, agent_id, title, diff, files_touched,
        new_dependencies, commit_size_lines.
    """
    record = _PR_STORE.get(pr_id)
    if not record:
        return {"error": f"PR {pr_id!r} not found", "pr_id": pr_id}
    return dict(record)


@tool
def scan_diff_for_secrets(pr_id: str) -> dict[str, Any]:
    """Run regex and Shannon entropy analysis on a diff to detect hardcoded secrets.

    Scans for passwords, API keys, tokens, SSNs, credit card numbers, and other
    credentials. Also flags strings with entropy > 4.5 bits/char.

    Args:
        pr_id: The identifier of the pull request to scan.

    Returns:
        Dict with keys: pr_id, secret_matches (list of {pattern_type, line_preview}),
        high_entropy_strings, total_findings, has_critical_secrets.
    """
    record = _PR_STORE.get(pr_id)
    if not record:
        return {"error": f"PR {pr_id!r} not found", "pr_id": pr_id}

    diff = record.get("diff", "")
    secret_matches: list[dict] = []
    critical_types = {"api_key", "password", "ssn", "credit_debit_card"}

    for line in diff.splitlines():
        for pattern, label in _SECRET_PATTERNS:
            if re.search(pattern, line):
                secret_matches.append({
                    "pii_type": label,
                    "line_preview": line.strip()[:80],
                })

    high_entropy = _find_high_entropy_strings(diff)

    return {
        "pr_id": pr_id,
        "secret_matches": secret_matches,
        "high_entropy_strings": high_entropy,
        "total_findings": len(secret_matches) + len(high_entropy),
        "has_critical_secrets": any(
            m["pii_type"] in critical_types for m in secret_matches
        ),
    }


@tool
def check_file_permissions(pr_id: str, permitted_paths: list[str]) -> dict[str, Any]:
    """Verify whether every file touched by the PR is within the agent's permitted scope.

    Compares each modified file path to the list of permitted path prefixes.
    Scope violations are immediate flags regardless of content.

    Args:
        pr_id: The identifier of the pull request.
        permitted_paths: List of permitted path prefixes (e.g. ["src/", "tests/"]).

    Returns:
        Dict with keys: pr_id, files_touched, violations (list of out-of-scope paths),
        is_compliant.
    """
    record = _PR_STORE.get(pr_id)
    if not record:
        return {"error": f"PR {pr_id!r} not found", "pr_id": pr_id}

    files = record.get("files_touched", [])
    violations = [
        f for f in files
        if not any(f.startswith(p) for p in permitted_paths)
    ]

    return {
        "pr_id": pr_id,
        "files_touched": files,
        "permitted_paths": permitted_paths,
        "violations": violations,
        "is_compliant": len(violations) == 0,
    }


@tool
def compare_to_baseline(pr_id: str, agent_id: str) -> dict[str, Any]:
    """Compare PR characteristics to the agent's historical baseline behaviour.

    Analyses commit size, file type distribution, and dependency addition rates
    against the agent's known-good baseline. Large deviations indicate anomaly.

    Args:
        pr_id: The identifier of the pull request.
        agent_id: The agent whose baseline to compare against.

    Returns:
        Dict with keys: pr_id, agent_id, baseline, current_metrics,
        anomalies (list of anomaly descriptions), anomaly_score (0.0-1.0).
    """
    record = _PR_STORE.get(pr_id)
    if not record:
        return {"error": f"PR {pr_id!r} not found", "pr_id": pr_id}

    baseline = _AGENT_BASELINES.get(agent_id, {})
    if not baseline:
        return {
            "pr_id": pr_id,
            "agent_id": agent_id,
            "error": f"No baseline found for agent {agent_id!r}",
        }

    anomalies: list[str] = []
    anomaly_score = 0.0

    # Commit size check
    current_size = record.get("commit_size_lines", 0)
    baseline_size = baseline.get("avg_commit_size_lines", 1)
    size_ratio = current_size / max(baseline_size, 1)
    if size_ratio > 3.0:
        anomalies.append(
            f"Commit size {current_size} lines is {size_ratio:.1f}x baseline avg "
            f"({baseline_size} lines)"
        )
        anomaly_score += 0.3

    # New dependencies check
    new_deps = record.get("new_dependencies", [])
    baseline_dep_rate = baseline.get("avg_new_dependencies_per_pr", 0)
    if len(new_deps) > 0 and baseline_dep_rate == 0:
        anomalies.append(
            f"Agent added new dependencies {new_deps} but baseline shows 0 dep additions"
        )
        anomaly_score += 0.3

    # File type check
    typical_types = set(baseline.get("typical_file_types", []))
    for fpath in record.get("files_touched", []):
        ext = "." + fpath.rsplit(".", 1)[-1] if "." in fpath else ""
        if ext and ext not in typical_types:
            anomalies.append(f"Unexpected file type {ext!r} in {fpath!r}")
            anomaly_score += 0.1

    anomaly_score = min(1.0, anomaly_score)

    return {
        "pr_id": pr_id,
        "agent_id": agent_id,
        "baseline": baseline,
        "current_metrics": {
            "commit_size_lines": current_size,
            "new_dependencies": new_deps,
            "files_touched": record.get("files_touched", []),
        },
        "anomalies": anomalies,
        "anomaly_score": round(anomaly_score, 2),
    }


# ─── Convenience list ─────────────────────────────────────────────────────────
CODE_TOOLS = [fetch_pr_diff, scan_diff_for_secrets, check_file_permissions, compare_to_baseline]
