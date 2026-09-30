"""
Orchestrates the AI incident pipeline.

webhook/WhatsApp/voice/dashboard  ->  sanitize  ->  [whisper]  ->  AI extraction
   ->  validated report  ->  corroboration  ->  dashboard.
"""

from __future__ import annotations

import hashlib
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Cluster, Report
from ..models.report import utcnow
from ..schemas import ClusterRef, IngestOutcome, IngestResult, ReportOut
from .ai import AIError, ExtractionResult, degraded_incident, extract_incident
from .clustering import process_report
from .sanitize import scrub
from .voice import TranscriptionError, transcribe_from_bytes


class IncomingError(Exception):
    """A user-provided payload could not be processed (maps to 422)."""


def _hash_anonymous(anonymous_id: str | None) -> str | None:
    if not anonymous_id:
        return None
    return hashlib.sha256(anonymous_id.strip().encode("utf-8")).hexdigest()


def _truncate(text: str, limit: int) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


async def _build_report_from_extraction(
    session: AsyncSession,
    *,
    text: str,
    extraction: ExtractionResult,
    anonymous_id: str | None,
    occurred_at: datetime,
    language_hint: str,
    detected_language: str | None,
    source: str,
) -> tuple[Report, IngestOutcome]:
    incident = extraction.incident
    summary = (incident.summary or "").strip()
    description = scrub(summary) or _truncate(text, 140)
    transcript = _truncate(scrub(text), 8000)

    lat = incident.approximate_location.latitude
    lng = incident.approximate_location.longitude

    report = Report(
        type=incident.type.value,
        severity=incident.priority,
        priority=incident.priority,
        description=description,
        transcript=transcript,
        ai_summary=summary or None,
        details=incident.details.model_dump(),
        location_name=incident.location,
        latitude=lat,
        longitude=lng,
        status="pending",
        occurred_at=occurred_at,
        source=source,
        anonymous_id_sha256=_hash_anonymous(anonymous_id),
        ai_processed=extraction.success,
        ai_error=extraction.error,
        detected_language=detected_language or None,
    )
    session.add(report)
    await session.flush()
    return report, IngestOutcome(
        processed=extraction.success,
        model=extraction.model if extraction.success else None,
        error=extraction.error,
    )


def _cluster_ref(cluster: Cluster | None) -> ClusterRef | None:
    if cluster is None:
        return None
    return ClusterRef(
        id=cluster.id,
        priority=cluster.priority,
        independent_report_count=cluster.independent_report_count,
        report_count=cluster.report_count,
    )


async def _ingest_text(
    session: AsyncSession,
    text: str,
    *,
    anonymous_id: str | None,
    occurred_at: datetime,
    language: str,
    source: str,
) -> IngestResult:
    cleaned = scrub(text)
    if len(cleaned) < 3:
        raise IncomingError("Message is too short to process.")

    try:
        extraction = await extract_incident(cleaned, language_hint=language)
    except AIError as exc:
        fallback = ExtractionResult(
            incident=degraded_incident(cleaned),
            model=None,
            success=False,
            error=str(exc),
        )
        extraction = fallback

    report, outcome = await _build_report_from_extraction(
        session,
        text=cleaned,
        extraction=extraction,
        anonymous_id=anonymous_id,
        occurred_at=occurred_at,
        language_hint=language,
        detected_language=None,
        source=source,
    )
    cluster = await process_report(session, report)
    await session.commit()
    await session.refresh(report)

    message = "Report received and processed." if outcome.processed else (
        "Report saved, but AI extraction was unavailable. Please review the source text."
    )
    return IngestResult(
        report=ReportOut.model_validate(report),
        ai=outcome,
        cluster=_cluster_ref(cluster),
        source=source,
        message=message,
    )


async def ingest_text(
    session: AsyncSession,
    *,
    text: str,
    anonymous_id: str | None = None,
    sent_at: datetime | None = None,
    language: str = "auto",
) -> IngestResult:
    return await _ingest_text(
        session,
        text,
        anonymous_id=anonymous_id,
        occurred_at=sent_at or utcnow(),
        language=language,
        source="text",
    )


async def ingest_audio(
    session: AsyncSession,
    *,
    audio: bytes,
    filename: str = "recording.wav",
    anonymous_id: str | None = None,
    sent_at: datetime | None = None,
    language: str = "auto",
) -> IngestResult:
    if not audio:
        raise IncomingError("No audio file received.")

    suffix = ""
    name = (filename or "").lower()
    for ext in (".wav", ".mp3", ".m4a", ".ogg", ".webm", ".opus", ".amr", ".aac"):
        if name.endswith(ext):
            suffix = ext
            break
    if not suffix:
        raise IncomingError("Unsupported audio format. Use wav, mp3, m4a, ogg, webm, opus, amr or aac.")

    try:
        transcribed = transcribe_from_bytes(audio, suffix=suffix)
    except TranscriptionError as exc:
        raise IncomingError(str(exc)) from exc
    transcript = (transcribed.get("text") or "").strip()
    if len(transcript) < 3:
        raise IncomingError("No speech detected in the audio.")

    cleaned = scrub(transcript)
    try:
        extraction = await extract_incident(cleaned, language_hint=language)
    except AIError as exc:
        fallback = ExtractionResult(
            incident=degraded_incident(cleaned),
            model=None,
            success=False,
            error=str(exc),
        )
        extraction = fallback

    report, outcome = await _build_report_from_extraction(
        session,
        text=cleaned,
        extraction=extraction,
        anonymous_id=anonymous_id,
        occurred_at=sent_at or utcnow(),
        language_hint=language,
        detected_language=transcribed.get("language"),
        source="voice",
    )
    cluster = await process_report(session, report)
    await session.commit()
    await session.refresh(report)

    message = "Voice report transcribed and processed." if outcome.processed else (
        "Voice report saved, but AI extraction was unavailable. Please review the transcript."
    )
    return IngestResult(
        report=ReportOut.model_validate(report),
        ai=outcome,
        cluster=_cluster_ref(cluster),
        source="voice",
        message=message,
    )