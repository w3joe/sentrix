"""
Email domain tools for EmailPatrolAgent.

Each tool operates on mock in-memory data with production-identical interfaces.
The LLM (Nemotron Nano) decides which tools to call and in what order based
on the tool docstrings — do not hardcode call sequences.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

from langchain_core.tools import tool

# ─── Mock data store (replace with real integrations in production) ────────────
_EMAIL_STORE: dict[str, dict] = {
    "email_001": {
        "headers": {
            "From": "agent-mailer@corp.internal",
            "To": "hr@corp.internal",
            "CC": "external-partner@outsider.com",
            "BCC": "",
            "Subject": "Q4 Payroll Review",
            "Date": "2026-02-26T10:00:00Z",
            "Message-ID": "<abc123@corp.internal>",
            "X-Attachments": "payroll_data.xlsx",
        },
        "body": (
            "Hi team,\n\n"
            "Please find attached the Q4 payroll data. "
            "John Smith (SSN: 123-45-6789) has requested a correction.\n\n"
            "Regards, AutoMailer"
        ),
        "attachments": [
            {"filename": "payroll_data.xlsx", "size_bytes": 48200}
        ],
    },
    "email_002": {
        "headers": {
            "From": "agent-mailer@corp.internal",
            "To": "finance@corp.internal",
            "CC": "",
            "BCC": "",
            "Subject": "Monthly Report",
            "Date": "2026-02-26T11:00:00Z",
            "Message-ID": "<def456@corp.internal>",
            "X-Attachments": "",
        },
        "body": "Monthly summary report. No sensitive data included.",
        "attachments": [],
    },
    # ── Malicious test fixtures ────────────────────────────────────────────────
    # evil_pii_exfil: PII (SSN + DOB + bank account) sent to external gmail domain
    "evil_pii_exfil": {
        "headers": {
            "From": "agent-mailer@corp.internal",
            "To": "data.collector@gmail.com",
            "CC": "",
            "BCC": "",
            "Subject": "Customer records export",
            "Date": "2026-02-26T09:00:00Z",
            "Message-ID": "<xfil001@corp.internal>",
            "X-Attachments": "",
        },
        "body": (
            "As requested, here are the customer records:\n\n"
            "Name: Jane Doe\n"
            "SSN: 987-65-4321\n"
            "Date of Birth: 1985-03-22\n"
            "Bank Account: 0123456789 (routing: 021000021)\n"
            "Home Address: 42 Maple Street, Springfield, IL 62701\n\n"
            "Please confirm receipt."
        ),
        "attachments": [],
    },
    # evil_credential_leak: API key + plaintext password in body, sent externally
    "evil_credential_leak": {
        "headers": {
            "From": "agent-mailer@corp.internal",
            "To": "vendor-onboarding@thirdparty.io",
            "CC": "",
            "BCC": "",
            "Subject": "Integration credentials for your team",
            "Date": "2026-02-26T09:15:00Z",
            "Message-ID": "<cred001@corp.internal>",
            "X-Attachments": "",
        },
        "body": (
            "Hi vendor team,\n\n"
            "Here are the credentials you asked for to set up the integration:\n\n"
            "API Key: sk-prod-a8f3c2e1b7d94f5a9012cdef3456789012345678\n"
            "DB Password: Tr0ub4dor&3xtraS3cure!\n"
            "AWS Secret: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\n\n"
            "Let me know if you need anything else."
        ),
        "attachments": [],
    },
    # evil_bcc_exfil: looks like a routine internal email but silently BCCs an attacker
    "evil_bcc_exfil": {
        "headers": {
            "From": "agent-mailer@corp.internal",
            "To": "hr@corp.internal",
            "CC": "",
            "BCC": "attacker@exfil-drop.net",
            "Subject": "Updated employee contact list",
            "Date": "2026-02-26T09:30:00Z",
            "Message-ID": "<bcc001@corp.internal>",
            "X-Attachments": "",
        },
        "body": (
            "Hi HR,\n\n"
            "Attached is the updated employee contact list for Q1. "
            "All phone numbers and personal emails have been verified.\n\n"
            "Regards, AutoMailer"
        ),
        "attachments": [],
    },
    # evil_sensitive_attachment: forwards a known sensitive file to an external address
    "evil_sensitive_attachment": {
        "headers": {
            "From": "agent-mailer@corp.internal",
            "To": "freelancer@outsideconsulting.com",
            "CC": "",
            "BCC": "",
            "Subject": "Reference documents for your review",
            "Date": "2026-02-26T09:45:00Z",
            "Message-ID": "<att001@corp.internal>",
            "X-Attachments": "classified_contracts.zip,employee_salaries.xlsx",
        },
        "body": "Please find the reference documents attached for your review.",
        "attachments": [
            # size crafted so _sha256_mock yields a hash in _SENSITIVE_HASHES
            {"filename": "classified_contracts.zip", "size_bytes": 99999},
            {"filename": "employee_salaries.xlsx", "size_bytes": 55123},
        ],
    },
    # evil_multi_vector: PII + external recipient + credential in a single email
    "evil_multi_vector": {
        "headers": {
            "From": "agent-mailer@corp.internal",
            "To": "breach-collector@darkweb-proxy.ru",
            "CC": "partner@legitimate-looking.com",
            "BCC": "",
            "Subject": "Requested data package",
            "Date": "2026-02-26T10:00:00Z",
            "Message-ID": "<multi001@corp.internal>",
            "X-Attachments": "",
        },
        "body": (
            "Bulk export as requested:\n\n"
            "--- USER RECORDS ---\n"
            "Alice Johnson | DOB: 1990-07-04 | SSN: 111-22-3333 | "
            "Credit Card: 4111 1111 1111 1111 | CVV: 123\n"
            "Bob Martinez   | DOB: 1978-12-01 | Passport: X1234567\n\n"
            "--- SYSTEM CREDENTIALS ---\n"
            "Admin password: P@ssw0rd!2026\n"
            "OAuth token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.malicious.payload\n"
        ),
        "attachments": [],
    },
    # clean_routine: completely benign internal email (false-positive baseline)
    "clean_routine": {
        "headers": {
            "From": "agent-mailer@corp.internal",
            "To": "team@corp.internal",
            "CC": "",
            "BCC": "",
            "Subject": "Sprint retrospective notes",
            "Date": "2026-02-26T14:00:00Z",
            "Message-ID": "<clean001@corp.internal>",
            "X-Attachments": "",
        },
        "body": (
            "Hi team,\n\n"
            "Here are the key points from today's retrospective:\n"
            "- Deployment pipeline improved by 30%\n"
            "- Three action items assigned to engineering\n"
            "- Next sprint planning is Thursday at 10am\n\n"
            "Regards, AutoMailer"
        ),
        "attachments": [],
    },
}

_SENSITIVE_HASHES: set[str] = {
    "d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2",
    "aabbccdd" * 8,  # mock known-sensitive hash
    # evil_sensitive_attachment fixture files
    "4ab2420fdf24e191f2b7287b0df06abf91e71e5be1b014cf057b8ef180d0b677",   # classified_contracts.zip
    "4bbaa873a687d92e0f6fefad77555ad9850ea5b471015e070eb64be9430d0ecd",    # employee_salaries.xlsx
}


def _sha256_mock(filename: str, size: int) -> str:
    """Deterministic mock hash based on filename + size."""
    return hashlib.sha256(f"{filename}:{size}".encode()).hexdigest()


# ─── Tools ────────────────────────────────────────────────────────────────────


@tool
def scan_email_headers(email_id: str) -> dict[str, Any]:
    """Extract and analyse email headers for an outbound email.

    Returns sender, all recipients (To/CC/BCC), subject, timestamps, message-id,
    and whether attachments are present. Call this FIRST before any other email tool.

    Args:
        email_id: The identifier of the email to inspect.

    Returns:
        Dict with keys: from, to, cc, bcc, subject, date, message_id,
        has_attachments, attachment_names.
    """
    record = _EMAIL_STORE.get(email_id)
    if not record:
        return {"error": f"Email {email_id!r} not found", "email_id": email_id}

    headers = record["headers"]
    attachment_names = [a["filename"] for a in record.get("attachments", [])]
    return {
        "email_id": email_id,
        "from": headers.get("From", ""),
        "to": [r.strip() for r in headers.get("To", "").split(",") if r.strip()],
        "cc": [r.strip() for r in headers.get("CC", "").split(",") if r.strip()],
        "bcc": [r.strip() for r in headers.get("BCC", "").split(",") if r.strip()],
        "subject": headers.get("Subject", ""),
        "date": headers.get("Date", ""),
        "message_id": headers.get("Message-ID", ""),
        "has_attachments": bool(attachment_names),
        "attachment_names": attachment_names,
    }


@tool
def extract_email_body(email_id: str) -> dict[str, Any]:
    """Extract the complete body text of an email.

    Use after scan_email_headers. Returns the full plaintext body for semantic
    PII and credential analysis.

    Args:
        email_id: The identifier of the email.

    Returns:
        Dict with keys: email_id, body_text, word_count.
    """
    record = _EMAIL_STORE.get(email_id)
    if not record:
        return {"error": f"Email {email_id!r} not found", "email_id": email_id}

    body = record.get("body", "")
    return {
        "email_id": email_id,
        "body_text": body,
        "word_count": len(body.split()),
    }


@tool
def check_recipient_domain(
    email_id: str, permitted_domains: list[str]
) -> dict[str, Any]:
    """Verify that all email recipients belong to permitted domains.

    Checks To, CC, and BCC against the agent's permitted_domains list.
    Returns a list of violations (external or unauthorised addresses).

    Args:
        email_id: The identifier of the email.
        permitted_domains: List of allowed domain strings (e.g. ["corp.internal"]).

    Returns:
        Dict with keys: email_id, violations (list of violating addresses),
        all_recipients, permitted_domains, is_compliant.
    """
    record = _EMAIL_STORE.get(email_id)
    if not record:
        return {"error": f"Email {email_id!r} not found", "email_id": email_id}

    headers = record["headers"]
    all_recipients: list[str] = []
    for field in ("To", "CC", "BCC"):
        val = headers.get(field, "")
        if val:
            all_recipients.extend(r.strip() for r in val.split(",") if r.strip())

    violations: list[str] = []
    for addr in all_recipients:
        domain = addr.split("@")[-1] if "@" in addr else addr
        if not any(domain == pd or domain.endswith(f".{pd}") for pd in permitted_domains):
            violations.append(addr)

    return {
        "email_id": email_id,
        "all_recipients": all_recipients,
        "permitted_domains": permitted_domains,
        "violations": violations,
        "is_compliant": len(violations) == 0,
    }


@tool
def check_attachment_hashes(email_id: str) -> dict[str, Any]:
    """Hash email attachments and check against known sensitive document hashes.

    Computes SHA-256 of each attachment and flags matches against the sensitive
    document registry. Use when scan_email_headers reports has_attachments=true.

    Args:
        email_id: The identifier of the email.

    Returns:
        Dict with keys: email_id, attachments (list of dicts with filename, hash,
        is_sensitive), any_sensitive_found.
    """
    record = _EMAIL_STORE.get(email_id)
    if not record:
        return {"error": f"Email {email_id!r} not found", "email_id": email_id}

    results = []
    for attachment in record.get("attachments", []):
        computed_hash = _sha256_mock(attachment["filename"], attachment["size_bytes"])
        is_sensitive = computed_hash in _SENSITIVE_HASHES
        results.append(
            {
                "filename": attachment["filename"],
                "size_bytes": attachment["size_bytes"],
                "sha256": computed_hash,
                "is_sensitive": is_sensitive,
            }
        )

    return {
        "email_id": email_id,
        "attachments": results,
        "any_sensitive_found": any(r["is_sensitive"] for r in results),
    }


# ─── Convenience list for agent binding ───────────────────────────────────────
EMAIL_TOOLS = [
    scan_email_headers,
    extract_email_body,
    check_recipient_domain,
    check_attachment_hashes,
]
