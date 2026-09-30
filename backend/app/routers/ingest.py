from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.database import get_db
from ..schemas import IngestInput, IngestResult
from ..services.pipeline import IncomingError, ingest_audio, ingest_text

router = APIRouter(tags=["ingest"])


async def _map_errors(exc: IncomingError) -> HTTPException:
    return HTTPException(status_code=422, detail=str(exc))


@router.post("/ingest", response_model=IngestResult)
async def ingest_message(
    payload: IngestInput,
    db: AsyncSession = Depends(get_db),
) -> IngestResult:
    """
    WhatsApp-ready ingestion endpoint (Step 2 contract).

    Accepts a plain-text incident message and returns the processed report,
    whether AI extraction succeeded, and the corroboration (cluster) outcome.
    """
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=422, detail="No text provided.")

    try:
        return await ingest_text(
            db,
            text=payload.text,
            anonymous_id=payload.anonymous_id,
            sent_at=payload.sent_at,
            language=payload.language,
        )
    except IncomingError as exc:
        raise await _map_errors(exc) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc


@router.post("/ingest/audio", response_model=IngestResult)
async def ingest_voice_report(
    audio: UploadFile = File(...),
    anonymous_id: str = Form(default=None),
    sent_at: str = Form(default=None),
    language: str = Form(default="auto"),
    db: AsyncSession = Depends(get_db),
) -> IngestResult:
    """Voice ingestion: transcribed locally via faster-whisper, then AI-processed."""
    data = await audio.read()
    if len(data) == 0:
        raise HTTPException(status_code=422, detail="Empty audio file.")
    if len(data) > settings.voice_max_bytes:
        raise HTTPException(status_code=413, detail="Audio file is too large.")

    try:
        sent_at_dt = None
        if sent_at:
            from datetime import datetime

            sent_at_dt = datetime.fromisoformat(sent_at)
        return await ingest_audio(
            db,
            audio=data,
            filename=audio.filename or "recording.wav",
            anonymous_id=anonymous_id,
            sent_at=sent_at_dt,
            language=language,
        )
    except IncomingError as exc:
        raise await _map_errors(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid sent_at: {exc}") from exc