"""
AI incident extraction via OpenRouter.

Turns free text (English, French or Cameroonian Pidgin) into a structured
incident object. Strict JSON output is requested and every response is
validated with pydantic before it is trusted.

Nothing produced here ever claims an incident is "confirmed".
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx
from pydantic import BaseModel, Field, field_validator

from ..core.config import settings
from ..models.enums import ReportType

class ExtractedDetails(BaseModel):
    people: int | None = None
    vehicles: list[str] = Field(default_factory=list)
    weapons: list[str] = Field(default_factory=list)
    activity: str | None = None
    injuries: str | None = None
    property_damage: str | None = None
    emergency_services: list[str] = Field(default_factory=list)
    notes: str | None = None


class ExtractedLocation(BaseModel):
    latitude: float | None = None
    longitude: float | None = None


class ExtractedIncident(BaseModel):
    type: ReportType = ReportType.OTHER
    location: str | None = None
    approximate_location: ExtractedLocation = Field(default_factory=ExtractedLocation)
    summary: str | None = None
    details: ExtractedDetails = Field(default_factory=ExtractedDetails)
    priority: str = "low"

    @field_validator("priority")
    @classmethod
    def _clamp_priority(cls, value: str) -> str:
        if value not in ("low", "medium", "high"):
            return "low"
        return value


class ExtractionResult(BaseModel):
    incident: ExtractedIncident
    model: str | None = None
    success: bool = False
    error: str | None = None


class AIError(Exception):
    """Raised when the AI provider cannot be reached or rejects the request."""


class AINotConfiguredError(AIError):
    pass


def _provider_configs() -> list[dict[str, Any]]:
    """Provider chain in priority order: OpenRouter first, NVIDIA NIM fallback."""
    providers: list[dict[str, Any]] = []
    if settings.openrouter_api_key:
        providers.append(
            {
                "name": "openrouter",
                "api_key": settings.openrouter_api_key,
                "model": settings.openrouter_model,
                "base_url": settings.openrouter_base_url,
                "timeout": settings.openrouter_timeout_seconds,
            }
        )
    if settings.nvidia_api_key:
        providers.append(
            {
                "name": "nvidia",
                "api_key": settings.nvidia_api_key,
                "model": settings.nvidia_model,
                "base_url": settings.nvidia_base_url,
                "timeout": settings.nvidia_timeout_seconds,
            }
        )
    return providers


def ai_status() -> dict[str, Any]:
    """Report which AI providers are configured (never leaks keys)."""
    return {
        "openrouter_configured": bool(settings.openrouter_api_key),
        "openrouter_model": settings.openrouter_model or None,
        "nvidia_configured": bool(settings.nvidia_api_key),
        "nvidia_model": settings.nvidia_model or None,
        "whisper_configured": True,  # local, always available
    }


_INCIDENT_TYPE_DEFS = "\n".join(
    f"- {t.value}: {t.name.replace('_', ' ').title()}" for t in ReportType
)

_SYSTEM_PROMPT = f"""You are the incident-extraction engine of a community early-warning system.
You read a raw civilian report in English, French or Cameroonian Pidgin and convert it into structured data.

Incident types you may choose from:
{_INCIDENT_TYPE_DEFS}

Rules:
- Output ONLY one JSON object, valid JSON, no markdown, no extra text.
- Extract the incident type, the mentioned location, approximate coordinates (lat/lng) and a short NEUTRAL summary (present tense, third person, under 40 words).
- Extract important details: number of people involved, vehicles, possible weapons, time reference.
- If something is unknown, use null / empty arrays. Never invent coordinates: only provide approximate lat/lng when reasonably confident about a known place.
- Assess a priority: low, medium or high, based on the reported situation.
- NEVER claim the incident is confirmed. Do not use words like confirmed, verified, or certain.
- The report is anonymous: never include phone numbers, names or emails in any output field.
- Summaries and notes must be neutral and factual.
- Respond in English keys and English values (notes may keep short original terms in quotation marks).

JSON schema:
{{
  "incident_type": "one of the incident types above",
  "location": "place name as mentioned, or null",
  "approximate_location": {{"latitude": number|null, "longitude": number|null}},
  "summary": "short neutral summary or null",
  "details": {{
    "people": number|null,
    "vehicles": ["...", ...],
    "weapons": ["...", ...],
    "activity": "short action description or null",
    "injuries": "harm reported or null",
    "property_damage": "damage reported or null",
    "emergency_services": ["police", "fire", "ambulance", ...],
    "notes": "short neutral note or null"
  }},
  "priority": "low"|"medium"|"high"
}}"""

_LANGUAGE_HINTS = {
    "auto": "The report may mix English, French or Cameroonian Pidgin. Understand whichever is used.",
    "en": "The report is written in English.",
    "fr": "The report is written in French.",
    "pidgin": "The report is written in Cameroonian Pidgin.",
}


def _build_messages(text: str, language_hint: str) -> list[dict[str, str]]:
    hint = _LANGUAGE_HINTS.get(language_hint, _LANGUAGE_HINTS["auto"])
    user = (
        f"Language context: {hint}\n\n"
        f"Raw civilian report (anonymous):\n{text[: settings.ai_max_input_chars]}"
    )
    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]


def _extract_json(text: str) -> Any:
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in model output")
    return json.loads(text[start : end + 1])


def degraded_incident(text: str) -> ExtractedIncident:
    """Minimal, safe fallback used when the model output cannot be trusted."""
    return ExtractedIncident(
        type=ReportType.OTHER,
        summary=text[: settings.ai_summary_max_length] or None,
        priority="low",
    )


def _validate_payload(data: Any) -> ExtractedIncident:
    if not isinstance(data, dict):
        raise ValueError("AI output is not an object")

    type_value = str(data.get("incident_type", "")).strip().lower()
    try:
        incident_type = ReportType(type_value)
    except ValueError:
        incident_type = ReportType.OTHER
        # fall through; summary still validated below

    loc = data.get("approximate_location") or {}
    lat = loc.get("latitude") if isinstance(loc, dict) else None
    lng = loc.get("longitude") if isinstance(loc, dict) else None

    details = data.get("details") or {}
    if not isinstance(details, dict):
        details = {}

    def _str_list(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        out = []
        for item in value:
            if isinstance(item, str):
                out.append(item)
        return out[:10]

    incident = ExtractedIncident(
        type=incident_type,
        location=_clean_str(data.get("location")),
        approximate_location=ExtractedLocation(
            latitude=_clean_coord(lat, -90, 90),
            longitude=_clean_coord(lng, -180, 180),
        ),
        summary=_clean_str(data.get("summary")),
        details=ExtractedDetails(
            people=_clean_int(details.get("people")),
            vehicles=_str_list(details.get("vehicles")),
            weapons=_str_list(details.get("weapons")),
            activity=_clean_str(details.get("activity")),
            injuries=_clean_str(details.get("injuries")),
            property_damage=_clean_str(details.get("property_damage")),
            emergency_services=_str_list(details.get("emergency_services")),
            notes=_clean_str(details.get("notes")),
        ),
        priority=_clean_str(data.get("priority")) or "low",
    )
    if not isinstance(incident.location, str) or not incident.location:
        incident.location = None
    return incident


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        cleaned = " ".join(value.split())
        return cleaned[:2000] or None
    return None


def _clean_coord(value: Any, min_v: float, max_v: float) -> float | None:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if min_v <= f <= max_v and f != 0 else None


def _clean_int(value: Any) -> int | None:
    try:
        i = int(value)
    except (TypeError, ValueError):
        return None
    return i if 0 <= i <= 10000 else None


async def _call_provider(provider: dict[str, Any], text: str, language_hint: str) -> str:
    """Call one OpenAI-compatible provider and return the raw message content."""
    headers = {
        "Authorization": f"Bearer {provider['api_key']}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": provider["model"],
        "messages": _build_messages(text, language_hint),
        "temperature": 0.0,
        "max_tokens": 800,
    }

    try:
        async with httpx.AsyncClient(timeout=provider["timeout"]) as client:
            response = await client.post(
                f"{provider['base_url']}/chat/completions",
                headers=headers,
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise AIError(f"AI provider unreachable: {exc}") from exc

    if response.status_code >= 400:
        raise AIError(
            f"AI provider error {response.status_code}: {response.text[:300]}"
        )

    try:
        body = response.json()
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as exc:
        raise AIError("Unexpected response shape from AI provider.") from exc

    if not isinstance(content, str) or not content.strip():
        raise AIError("AI provider returned an empty response.")
    return content


async def extract_incident(
    text: str,
    language_hint: str = "auto",
) -> ExtractionResult:
    """Extract structured data from raw text, trying each provider in order."""
    providers = _provider_configs()
    if not providers:
        raise AINotConfiguredError(
            "No AI provider configured. Set OPENROUTER_API_KEY or NVIDIA_API_KEY in backend/.env."
        )

    last_error: AIError | None = None
    for provider in providers:
        try:
            content = await _call_provider(provider, text, language_hint)
        except AIError as exc:
            last_error = exc
            continue  # fall through to the next provider

        try:
            data = _extract_json(content)
            incident = _validate_payload(data)
        except (ValueError, json.JSONDecodeError) as exc:
            # The provider answered but the output was unusable — try the next one.
            last_error = AIError(f"AI output failed validation: {exc}")
            continue

        incident.summary = _trim_summary(incident.summary)
        if not isinstance(incident.type, ReportType):
            incident.type = ReportType.OTHER

        return ExtractionResult(
            incident=incident,
            model=provider["model"],
            success=True,
        )

    raise last_error or AIError("All AI providers failed.")


def _trim_summary(summary: str | None) -> str | None:
    if not summary:
        return None
    return summary[: settings.ai_summary_max_length]