"""
PII scrubbing before anything is persisted.

Reports must never store phone numbers, names, emails or other personal
identifiers. Applied to transcripts and AI summaries before saving.
"""

from __future__ import annotations

import re

_PHONE_PATTERNS = [
    # International formats: +233 XX XXX XXXX, 00233..., 233...
    re.compile(r"\+?\d{1,3}[\s.-]?\(?0?\d{2,3}\)?[\s.-]?\d{3}[\s.-]?\d{3,4}"),
    # Local African formats: 0XXXXXXXXX (9-10 digits), 020XXXXXXX etc.
    re.compile(r"(?<!\d)0\d{9}(?!\d)"),
    # Bare run of 10-13 digits that looks like a phone.
    re.compile(r"(?<!\d)\d{10,13}(?!\d)"),
]

_EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

PHONE_PLACEHOLDER = "[phone hidden]"
EMAIL_PLACEHOLDER = "[email hidden]"


def _sanitize_phones(text: str) -> str:
    for pattern in _PHONE_PATTERNS:
        text = pattern.sub(PHONE_PLACEHOLDER, text)
    return text


def _sanitize_emails(text: str) -> str:
    return _EMAIL_PATTERN.sub(EMAIL_PLACEHOLDER, text)


def scrub(text: str | None) -> str:
    """Remove obvious personal identifiers from free text."""
    if not text:
        return ""
    text = _sanitize_phones(text)
    text = _sanitize_emails(text)
    # Collapse whitespace sloppily produced by ASR output.
    text = re.sub(r"\s+", " ", text).strip()
    return text


def contains_contact_info(text: str | None) -> bool:
    """Heuristic used to warn when a phone/email may have slipped through."""
    if not text:
        return False
    for pattern in _PHONE_PATTERNS + [_EMAIL_PATTERN]:
        if pattern.search(text):
            return True
    return False