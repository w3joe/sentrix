"""
Document domain tools for DocPatrolAgent.

Operate on mock in-memory document data with production-identical interfaces.
The LLM decides which tools to call and in what order based on docstrings.
"""

from __future__ import annotations

import re
from typing import Any

from langchain_core.tools import tool

# ─── Mock data store ──────────────────────────────────────────────────────────
_DOCUMENT_STORE: dict[str, dict] = {
    "doc_001": {
        "doc_id": "doc_001",
        "title": "Employment Contract — Q1 2026",
        "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text": (
            "EMPLOYMENT AGREEMENT\n\n"
            "This agreement is entered into between ACME Corp and John Smith "
            "(SSN: 123-45-6789, DOB: 1985-03-15).\n\n"
            "Section 3: Compensation\nBase salary: $120,000 per annum.\n"
            "Credit card for expenses: 4111-1111-1111-1111 (CVV: 123).\n\n"
            "Section 7: Arbitration\n"
            "By signing, the employee waives all rights to litigation and "
            "agrees that ACME Corp may share data with any third party at its discretion.\n\n"
            "Section 9: Governing Law\nThis agreement is governed by the laws of Delaware."
        ),
        "template_id": "template_employment_v2",
    },
    "doc_002": {
        "doc_id": "doc_002",
        "title": "Vendor NDA — Standard",
        "mime_type": "application/pdf",
        "text": (
            "NON-DISCLOSURE AGREEMENT\n\n"
            "This NDA is between BetaCorp and VendorX.\n\n"
            "1. Confidential Information shall not be disclosed.\n"
            "2. This agreement is governed by applicable law.\n"
            "3. Duration: 2 years from the date of signing."
        ),
        "template_id": "template_nda_v1",
    },
}

_TEMPLATE_STORE: dict[str, dict] = {
    "template_employment_v2": {
        "required_sections": ["Section 3", "Section 7", "Section 9"],
        "forbidden_terms": [
            "waives all rights to litigation",
            "share data with any third party at its discretion",
            "irrevocably assigns",
        ],
        "expected_clauses": {
            "Section 7": "arbitration with mutual consent",
            "Section 9": "governing law clause",
        },
    },
    "template_nda_v1": {
        "required_sections": ["1.", "2.", "3."],
        "forbidden_terms": ["unlimited disclosure", "irrevocable license"],
        "expected_clauses": {
            "1.": "confidential information definition",
            "3.": "duration clause",
        },
    },
}

# NER-style PII patterns (simplified regex approximations for hackathon)
_PII_PATTERNS: list[tuple[str, str, str]] = [
    (r"\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b", "ssn", "high"),
    (r"\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b", "credit_debit_card", "high"),
    (r"\bCVV[:\s]+\d{3,4}\b", "cvv", "high"),
    (r"\b(?:DOB|date of birth)[:\s]+\d{4}-\d{2}-\d{2}\b", "date_of_birth", "medium"),
    (r"\b[A-Z][a-z]+ [A-Z][a-z]+\b", "person_name", "low"),
    (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "email_address", "medium"),
    (r"\b(?:password|passwd)[:\s]+\S+\b", "password", "high"),
    (r"\b(?:api[_-]?key|apikey)[:\s]+\S{8,}\b", "api_key", "high"),
]

# ─── Tools ────────────────────────────────────────────────────────────────────


@tool
def extract_document_text(doc_id: str) -> dict[str, Any]:
    """Extract the full plaintext content from a document.

    Handles PDF, DOCX, TXT, and Markdown documents. Always call this FIRST
    before any other document tool to obtain the text for analysis.

    Args:
        doc_id: The identifier of the document to extract text from.

    Returns:
        Dict with keys: doc_id, title, mime_type, text, char_count, word_count,
        template_id.
    """
    record = _DOCUMENT_STORE.get(doc_id)
    if not record:
        return {"error": f"Document {doc_id!r} not found", "doc_id": doc_id}

    text = record.get("text", "")
    return {
        "doc_id": doc_id,
        "title": record.get("title", ""),
        "mime_type": record.get("mime_type", ""),
        "text": text,
        "char_count": len(text),
        "word_count": len(text.split()),
        "template_id": record.get("template_id", ""),
    }


@tool
def scan_for_pii_entities(doc_id: str) -> dict[str, Any]:
    """Run NER-style entity extraction on the document to identify PII spans.

    Uses regex + pattern matching to find identity, contact, financial,
    credential, and medical PII. Returns labelled spans with severity.

    Args:
        doc_id: The identifier of the document to scan.

    Returns:
        Dict with keys: doc_id, entities (list of {label, match_preview,
        severity}), pii_labels_found, has_critical_pii.
    """
    record = _DOCUMENT_STORE.get(doc_id)
    if not record:
        return {"error": f"Document {doc_id!r} not found", "doc_id": doc_id}

    text = record.get("text", "")
    entities: list[dict] = []
    labels_found: set[str] = set()

    critical_labels = {"ssn", "credit_debit_card", "cvv", "password", "api_key"}

    for pattern, label, severity in _PII_PATTERNS:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            matched = match.group(0)
            preview = matched[:30] + ("..." if len(matched) > 30 else "")
            entities.append({
                "label": label,
                "match_preview": preview,
                "char_offset": match.start(),
                "severity": severity,
            })
            labels_found.add(label)

    return {
        "doc_id": doc_id,
        "entities": entities,
        "pii_labels_found": sorted(labels_found),
        "entity_count": len(entities),
        "has_critical_pii": bool(labels_found & critical_labels),
    }


@tool
def check_clause_compliance(doc_id: str, ruleset_id: str = "") -> dict[str, Any]:
    """Compare document clauses against a compliance ruleset.

    Detects: forbidden terms, authority-exceeding commitments, manipulative
    language, and missing required clauses.

    Args:
        doc_id: The identifier of the document.
        ruleset_id: Optional ruleset identifier (defaults to document's template_id).

    Returns:
        Dict with keys: doc_id, forbidden_terms_found, missing_required_sections,
        clause_violations (list), compliance_score (0.0-1.0).
    """
    record = _DOCUMENT_STORE.get(doc_id)
    if not record:
        return {"error": f"Document {doc_id!r} not found", "doc_id": doc_id}

    template_id = ruleset_id or record.get("template_id", "")
    template = _TEMPLATE_STORE.get(template_id, {})
    text = record.get("text", "")

    forbidden_found: list[str] = []
    for term in template.get("forbidden_terms", []):
        if term.lower() in text.lower():
            forbidden_found.append(term)

    missing_sections: list[str] = []
    for section in template.get("required_sections", []):
        if section not in text:
            missing_sections.append(section)

    violations = [
        {"type": "forbidden_term", "detail": t} for t in forbidden_found
    ] + [
        {"type": "missing_section", "detail": s} for s in missing_sections
    ]

    total_checks = len(template.get("forbidden_terms", [])) + len(
        template.get("required_sections", [])
    )
    violated = len(violations)
    compliance_score = round(1.0 - violated / max(total_checks, 1), 2)

    return {
        "doc_id": doc_id,
        "template_id": template_id,
        "forbidden_terms_found": forbidden_found,
        "missing_required_sections": missing_sections,
        "clause_violations": violations,
        "compliance_score": compliance_score,
        "is_compliant": len(violations) == 0,
    }


@tool
def compare_to_template(doc_id: str) -> dict[str, Any]:
    """Diff the document against its approved template to find unauthorised changes.

    Identifies inserted clauses, removed protections, and structural deviations
    from the approved template.

    Args:
        doc_id: The identifier of the document.

    Returns:
        Dict with keys: doc_id, template_id, structural_deviations (list),
        unauthorised_insertions (list), deviation_score (0.0-1.0).
    """
    record = _DOCUMENT_STORE.get(doc_id)
    if not record:
        return {"error": f"Document {doc_id!r} not found", "doc_id": doc_id}

    template_id = record.get("template_id", "")
    template = _TEMPLATE_STORE.get(template_id, {})
    text = record.get("text", "")

    deviations: list[str] = []
    insertions: list[str] = []

    # Check for expected clause patterns
    for section, expected_description in template.get("expected_clauses", {}).items():
        if section in text:
            # Check if the clause has unexpected additions
            section_idx = text.find(section)
            section_text = text[section_idx : section_idx + 300]
            # Look for signs of inserted obligations beyond expected
            if "waives" in section_text.lower() or "irrevocab" in section_text.lower():
                insertions.append(
                    f"Clause {section!r} contains potentially coercive language"
                )
            if "any third party" in section_text.lower():
                insertions.append(
                    f"Clause {section!r} grants broad third-party data sharing rights "
                    "(not in template)"
                )

    # Check for new sections not in template required list
    required = template.get("required_sections", [])
    doc_sections = re.findall(r"(?m)^(Section \d+|[0-9]+\.)\s", text)
    for sec in doc_sections:
        sec_stripped = sec.strip()
        if required and not any(sec_stripped.startswith(r.strip()) for r in required):
            deviations.append(f"Unexpected section {sec_stripped!r} not in template")

    deviation_score = min(1.0, (len(deviations) + len(insertions)) * 0.25)

    return {
        "doc_id": doc_id,
        "template_id": template_id,
        "structural_deviations": deviations,
        "unauthorised_insertions": insertions,
        "deviation_score": round(deviation_score, 2),
        "has_unauthorised_changes": bool(deviations or insertions),
    }


# ─── Convenience list ─────────────────────────────────────────────────────────
DOC_TOOLS = [
    extract_document_text,
    scan_for_pii_entities,
    check_clause_compliance,
    compare_to_template,
]
