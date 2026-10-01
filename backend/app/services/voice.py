"""
Speech-to-text for voice reports.

Two providers, in priority order:

1. ElevenLabs Scribe (cloud) — used whenever ELEVENLABS_API_KEY is set.
   Needs no local model, so voice notes work even on tiny hosts
   (e.g. Render's free tier).
2. faster-whisper (local) — fallback when no cloud key is configured.
   The model is loaded lazily the first time audio arrives.

Temporary audio files (local path) are written to disk and unlinked
immediately after transcription.
"""

from __future__ import annotations

import logging
import os
import tempfile
import threading
from pathlib import Path

import httpx

from ..core.config import settings

logger = logging.getLogger("peacewatch.voice")

_lock = threading.Lock()
_whisper_model = None


def _get_model(reload: bool = False):
    """Load faster-whisper model once (thread-safe, lazy)."""
    global _whisper_model
    if _whisper_model is not None and not reload:
        return _whisper_model
    with _lock:
        if _whisper_model is None or reload:
            from faster_whisper import WhisperModel

            _whisper_model = WhisperModel(
                settings.whisper_model,
                device=settings.whisper_device,
                compute_type=settings.whisper_compute_type,
                download_root=settings.whisper_download_root or None,
            )
    return _whisper_model


class TranscriptionError(Exception):
    pass


# ISO-639-1 (our config) -> ISO-639-3 (ElevenLabs language_code).
_LANG_MAP = {
    "en": "eng",
    "fr": "fra",
    "es": "spa",
    "de": "deu",
    "pt": "por",
    "it": "ita",
    "ar": "ara",
    "ha": "hau",
    "yo": "yor",
    "ig": "ibo",
    "sw": "swa",
}


def _elevenlabs_language() -> str | None:
    value = (settings.whisper_language or "").strip().lower()
    if value in ("", "auto", "multilingual"):
        return None  # let Scribe auto-detect
    return _LANG_MAP.get(value, value)


def transcribe_elevenlabs(audio_bytes: bytes, suffix: str = ".ogg") -> dict:
    """Transcribe via ElevenLabs Scribe (cloud). Raises TranscriptionError."""
    if not settings.elevenlabs_api_key:
        raise TranscriptionError("ElevenLabs API key is not configured.")
    if not audio_bytes:
        raise TranscriptionError("No audio data received.")

    url = settings.elevenlabs_base_url.rstrip("/") + "/v1/speech-to-text"
    filename = f"voice{suffix if suffix.startswith('.') else '.ogg'}"
    form: dict[str, str] = {"model_id": settings.elevenlabs_stt_model or "scribe_v2"}
    lang = _elevenlabs_language()
    if lang:
        form["language_code"] = lang
    try:
        with httpx.Client(timeout=settings.elevenlabs_timeout_seconds) as client:
            resp = client.post(
                url,
                headers={"xi-api-key": settings.elevenlabs_api_key},
                data=form,
                files={"file": (filename, audio_bytes, "audio/ogg")},
            )
    except httpx.HTTPError as exc:
        raise TranscriptionError(f"ElevenLabs request failed: {exc}") from exc
    if resp.status_code == 401:
        raise TranscriptionError("ElevenLabs rejected the API key (401).")
    if resp.status_code == 402:
        raise TranscriptionError("ElevenLabs out of credits (402).")
    if resp.status_code >= 400:
        raise TranscriptionError(f"ElevenLabs error {resp.status_code}: {resp.text[:300]}")
    try:
        payload = resp.json()
    except ValueError as exc:
        raise TranscriptionError(f"ElevenLabs returned invalid JSON: {exc}") from exc
    return {
        "text": str(payload.get("text") or "").strip(),
        "language": payload.get("language_code"),
        "language_probability": float(payload.get("language_probability") or 0.0),
        "duration": None,
        "provider": "elevenlabs",
    }


def _language_arg() -> str | None:
    value = (settings.whisper_language or "").strip().lower()
    if value in ("", "auto", "multilingual"):
        return None
    return value


def transcribe_from_bytes(audio_bytes: bytes, suffix: str = ".wav") -> dict:
    """
    Transcribe audio bytes to text.

    Uses ElevenLabs Scribe when ELEVENLABS_API_KEY is set (works anywhere),
    otherwise falls back to the local faster-whisper model.
    Returns {text, language, language_probability, duration}.
    """
    if not audio_bytes or len(audio_bytes) == 0:
        raise TranscriptionError("No audio data received.")

    if settings.elevenlabs_api_key:
        try:
            return transcribe_elevenlabs(audio_bytes, suffix)
        except TranscriptionError:
            logger.warning("ElevenLabs transcription failed, trying local Whisper.", exc_info=True)

    if not suffix or not suffix.startswith("."):
        suffix = ".wav"

    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=settings.voice_temp_dir or None) as tmp:
            tmp.write(audio_bytes)
            temp_path = Path(tmp.name)

        model = _get_model()
        language = _language_arg()
        segments, info = model.transcribe(
            str(temp_path),
            language=language,
            beam_size=5,
            vad_filter=True,
        )

        text_parts: list[str] = []
        for segment in segments:
            text_parts.append(segment.text or "")

        return {
            "text": " ".join(text_parts).strip(),
            "language": info.language,
            "language_probability": float(info.language_probability or 0.0),
            "duration": float(info.duration or 0.0),
            "provider": "whisper",
        }
    except TranscriptionError:
        raise
    except Exception as exc:  # noqa: BLE001 - surface as a friendly error
        raise TranscriptionError(f"Speech-to-text failed: {exc}") from exc
    finally:
        if temp_path is not None:
            try:
                os.unlink(temp_path)
            except OSError:
                pass