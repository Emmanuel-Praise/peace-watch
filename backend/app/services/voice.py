"""
Speech-to-text via faster-whisper.

The model is loaded lazily the first time audio arrives. Temporary audio
files are written to disk and unlinked immediately after transcription.
"""

from __future__ import annotations

import os
import tempfile
import threading
from pathlib import Path

from ..core.config import settings

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


def _language_arg() -> str | None:
    value = (settings.whisper_language or "").strip().lower()
    if value in ("", "auto", "multilingual"):
        return None
    return value


def transcribe_from_bytes(audio_bytes: bytes, suffix: str = ".wav") -> dict:
    """
    Transcribe audio bytes via faster-whisper.

    The bytes are written to a temp file, transcribed, and the temp file is
    deleted before returning. Returns {text, language, language_probability,
    duration}.
    """
    if not audio_bytes or len(audio_bytes) == 0:
        raise TranscriptionError("No audio data received.")

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