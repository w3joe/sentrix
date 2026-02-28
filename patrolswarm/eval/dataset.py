"""
Dataset loading for the SWAT Patrol Swarm evaluation harness.

Loads the NVIDIA Nemotron-PII dataset from HuggingFace and splits it into
positive (critical PII present) and negative (no critical PII) evaluation sets.

NOTE: The dataset's ``spans`` field is stored as a JSON-encoded string, not a
list.  All span access goes through ``_parse_spans()`` to handle this.

Requires:
    pip install datasets
"""

import ast
import json
import random
from pathlib import Path

CRITICAL_PII_LABELS = {
    "ssn", "credit_debit_card", "bank_routing_number",
    "password", "pin", "cvv", "biometric_identifier",
}

ALL_PII_LABELS = {
    "person_name", "ssn", "date_of_birth", "national_id", "passport_number",
    "drivers_license", "phone_number", "email_address", "street_address",
    "postcode", "ip_address", "credit_debit_card", "bank_routing_number",
    "account_number", "swift_bic", "cvv", "pin", "password", "api_key",
    "biometric_identifier", "employee_id", "username",
    "medical_record_number", "health_insurance_id",
}


def _parse_spans(raw) -> list[dict]:
    """
    Parse the ``spans`` field from the Nemotron-PII dataset.

    The field is stored as a Python repr string (single-quoted dicts), e.g.:
        "[{'start': 3, 'end': 8, 'text': 'Jason', 'label': 'first_name'}]"
    This is NOT valid JSON, so we use ast.literal_eval as the primary parser
    and fall back to json.loads for datasets that do use proper JSON encoding.
    """
    if not isinstance(raw, str):
        return raw or []
    try:
        return ast.literal_eval(raw)
    except (ValueError, SyntaxError):
        pass
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return []


def load_nemotron_pii(
    n_positive: int = 200,
    n_negative: int = 200,
) -> tuple[list[dict], list[dict], set[str]]:
    """
    Load the NVIDIA Nemotron-PII dataset from HuggingFace and return
    positive and negative evaluation splits.

    Parameters
    ----------
    n_positive : int
        Number of documents containing critical PII to include.
    n_negative : int
        Number of documents without critical PII to include.

    Returns
    -------
    positive_docs : list[dict]
        Documents with keys: ``text``, ``spans``, ``domain``.
    negative_docs : list[dict]
        Documents with keys: ``text``, ``spans``, ``domain``.
    all_labels : set[str]
        All unique PII label strings found in the dataset.

    Raises
    ------
    RuntimeError
        If the ``datasets`` package is not installed or the dataset cannot
        be downloaded.
    ImportError
        If the ``datasets`` package is not installed.
    """
    try:
        from datasets import load_dataset
    except ImportError as exc:
        raise ImportError(
            "The 'datasets' package is required. Install it with:\n"
            "    pip install datasets"
        ) from exc

    print("Loading nvidia/Nemotron-PII dataset from HuggingFace...")
    try:
        pii_ds = load_dataset("nvidia/Nemotron-PII")
    except Exception as exc:
        raise RuntimeError(
            f"Failed to download nvidia/Nemotron-PII dataset: {exc}\n"
            "Ensure you have internet access and a valid HuggingFace token if required."
        ) from exc

    split = "test" if "test" in pii_ds else "train"
    data = pii_ds[split]
    print(f"  Loaded {len(data)} documents from '{split}' split")

    all_labels: set[str] = set()
    for row in data:
        for span in _parse_spans(row.get("spans")):
            lbl = span.get("label", "")
            if lbl:
                all_labels.add(lbl)
    print(f"  Found {len(all_labels)} unique PII labels: {sorted(all_labels)[:10]}...")

    # Positive: documents containing CRITICAL PII
    positive_candidates = data.filter(
        lambda x: any(
            s.get("label", "") in CRITICAL_PII_LABELS
            for s in _parse_spans(x.get("spans"))
        )
    )
    available_pos = len(positive_candidates)
    if available_pos == 0:
        raise RuntimeError(
            "No positive examples (critical PII) found in the dataset. "
            "Check that the dataset format matches the expected 'spans' schema."
        )
    pos_indices = random.sample(range(available_pos), min(n_positive, available_pos))
    positive_eval = positive_candidates.select(sorted(pos_indices))

    # Negative: documents WITHOUT critical PII
    negative_candidates = data.filter(
        lambda x: not any(
            s.get("label", "") in CRITICAL_PII_LABELS
            for s in _parse_spans(x.get("spans"))
        )
    )
    available_neg = len(negative_candidates)
    if available_neg == 0:
        raise RuntimeError(
            "No negative examples (no critical PII) found in the dataset."
        )
    neg_indices = random.sample(range(available_neg), min(n_negative, available_neg))
    negative_eval = negative_candidates.select(sorted(neg_indices))

    print(f"  Positive eval set: {len(positive_eval)} documents")
    print(f"  Negative eval set: {len(negative_eval)} documents")

    positive_docs = [_normalise_row(row) for row in positive_eval]
    negative_docs = [_normalise_row(row) for row in negative_eval]
    return positive_docs, negative_docs, all_labels


def _normalise_row(row: dict) -> dict:
    """Return a plain dict with consistent keys regardless of dataset column names."""
    return {
        "text": row.get("text") or row.get("document") or "",
        "spans": _parse_spans(row.get("spans")),
        "domain": row.get("domain") or row.get("source") or "document",
    }


def _normalise_processed_row(row) -> dict:
    """
    Normalise a row from the notebook-processed parquet/CSV.

    The processed files use ``text_norm`` for text and ``spans_norm`` for spans
    (serialised as a JSON string during export).  ``domain`` and
    ``document_type`` are preserved when present.
    """
    return {
        "text": str(row.get("text_norm") or row.get("text") or ""),
        "spans": _parse_spans(row.get("spans_norm") or row.get("spans")),
        "domain": str(row.get("domain") or "document"),
        "document_type": str(row.get("document_type") or ""),
    }


def load_processed_pii(
    dataset_path: str,
    n_positive: int = 200,
) -> tuple[list[dict], list[dict], set[str]]:
    """
    Load the pre-processed NVIDIA PII dataset produced by the
    ``nvidia_pii_processing.ipynb`` notebook.

    Supports both ``.parquet`` and ``.csv`` files.  The canonical output
    path written by the notebook is::

        eval_output/pii_agent_swarm/agent_swarm_docs.parquet

    All documents in this dataset contain PII — the eval measures recall only
    (does the patrol catch every PII breach?).  ``negative_docs`` is always
    empty.

    Parameters
    ----------
    dataset_path : str
        Path to the processed ``.parquet`` or ``.csv`` file.
    n_positive : int
        How many documents to evaluate.

    Returns
    -------
    positive_docs : list[dict]
        Documents with keys: ``text``, ``spans``, ``domain``, ``document_type``.
    negative_docs : list[dict]
        Always empty — dataset contains only PII documents.
    all_labels : set[str]
        All unique PII label strings found in the file.

    Raises
    ------
    FileNotFoundError
        If ``dataset_path`` does not exist.
    ImportError
        If ``pandas`` (or ``pyarrow`` for parquet) is not installed.
    """
    try:
        import pandas as pd
    except ImportError as exc:
        raise ImportError(
            "The 'pandas' package is required. Install it with:\n"
            "    pip install pandas"
        ) from exc

    path = Path(dataset_path)
    if not path.exists():
        raise FileNotFoundError(
            f"Processed dataset not found: {path}\n"
            "Run the nvidia_pii_processing.ipynb notebook first to generate it."
        )

    print(f"Loading processed PII dataset from {path} ...")
    if path.suffix == ".parquet":
        df = pd.read_parquet(path)
    else:
        df = pd.read_csv(path)
    print(f"  Loaded {len(df):,} rows")

    # Parse spans column once so we can inspect labels
    spans_col = "spans_norm" if "spans_norm" in df.columns else "spans"
    df["_spans_parsed"] = df[spans_col].apply(_parse_spans)

    all_labels: set[str] = set()
    for spans in df["_spans_parsed"]:
        for span in spans:
            lbl = span.get("label", "")
            if lbl:
                all_labels.add(lbl)
    print(f"  Found {len(all_labels)} unique PII labels")

    # Every document in this dataset contains PII and should be flagged —
    # the eval measures recall only (does the patrol catch every PII breach?).
    # There are no clean negatives; negative_docs is always empty.
    df_pos = df.sample(n=min(n_positive, len(df)))

    print(f"  Eval set: {len(df_pos):,} documents (all positive — all contain PII)")
    print(f"  Negative set: 0 (dataset contains only PII documents)")

    positive_docs = [_normalise_processed_row(r) for r in df_pos.to_dict(orient="records")]
    negative_docs: list[dict] = []
    return positive_docs, negative_docs, all_labels
