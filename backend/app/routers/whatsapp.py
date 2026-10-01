"""
WhatsApp / Meta Cloud API webhook.

Meta calls this endpoint in two situations:

1. GET  .../api/whatsapp/webhook  ->  webhook *verification* handshake.
   Meta sends ?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=X.
   We reply with X (plain text) only when the verify token matches.
2. POST .../api/whatsapp/webhook  ->  incoming message events.
   Text messages are answered fast (200 to Meta immediately) and processed
   in the background: greeting/help/thanks get an instant chatbot reply,
   real incident text goes through the standard pipeline
   (report -> AI extraction -> corroboration -> dashboard).
   Voice notes are downloaded from Meta, transcribed locally and ingested
   the same way. Photos/documents are accepted as quarter-head ID proof
   during registration. Reports with no usable location trigger a
   follow-up question, and verified quarter heads of the area are
   notified over WhatsApp.

Privacy: ordinary reporters are only stored as a SHA-256 hash
(anonymous_id_sha256 on the report row) — never the raw number.
Quarter heads explicitly register, so their WhatsApp number IS stored
in the quarter_heads table (needed to forward area reports to them).
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.database import SessionLocal
from ..models import QuarterHead, Report
from ..models.report import utcnow
from ..services.notify import find_matching_heads, head_alert_text
from ..services.pipeline import IncomingError, ingest_text
from ..services.voice import TranscriptionError, transcribe_from_bytes

logger = logging.getLogger("peacewatch.whatsapp")

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])

_GRAPH_VERSION = "v21.0"

# In-memory dedup of Meta message IDs (Meta retries webhooks on timeout).
# Bounded LRU so it cannot grow forever.
_SEEN_IDS: OrderedDict[str, float] = OrderedDict()
_SEEN_MAX = 2000
_SEEN_TTL_SECONDS = 24 * 3600


def _already_seen(msg_id: str) -> bool:
    if not msg_id:
        return False
    now = time.time()
    # Evict expired entries opportunistically.
    while _SEEN_IDS:
        oldest_id, oldest_ts = next(iter(_SEEN_IDS.items()))
        if now - oldest_ts < _SEEN_TTL_SECONDS:
            break
        _SEEN_IDS.popitem(last=False)
    if msg_id in _SEEN_IDS:
        return True
    _SEEN_IDS[msg_id] = now
    if len(_SEEN_IDS) > _SEEN_MAX:
        _SEEN_IDS.popitem(last=False)
    return False


def _signature_ok(body: bytes, signature_header: str | None) -> bool:
    """Verify X-Hub-Signature-256 when a Meta App Secret is configured."""
    if not settings.whatsapp_app_secret or not signature_header:
        return True  # validation stays disabled until WHATSAPP_APP_SECRET is set
    expected = "sha256=" + hmac.new(
        settings.whatsapp_app_secret.encode("utf-8"), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


@router.get("/webhook")
async def verify_webhook(
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
):
    """Answer Meta's webhook verification handshake.

    - With ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=X (Meta's
      handshake): echoes X as plain text when the token matches, else 403.
    - With no query params (human opening the URL in a browser): returns a
      friendly JSON status with 200 so you can see the webhook is live
      instead of a scary "Not Found".
    """
    if hub_mode is None and hub_verify_token is None and hub_challenge is None:
        return {
            "status": "ok",
            "service": "whatsapp webhook",
            "bot": settings.bot_name,
            "hint": "Add ?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=123 to test verification.",
            "verify_token_configured": bool(settings.whatsapp_verify_token),
        }
    if (
        hub_mode == "subscribe"
        and hub_verify_token == settings.whatsapp_verify_token
        and hub_challenge is not None
    ):
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Webhook verification failed.")


def _graph_url() -> str:
    return (
        f"https://graph.facebook.com/{_GRAPH_VERSION}/"
        f"{settings.whatsapp_phone_number_id}/messages"
    )


def _bot_configured() -> bool:
    return bool(settings.whatsapp_access_token and settings.whatsapp_phone_number_id)


def _auth_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.whatsapp_access_token}",
        "Content-Type": "application/json",
    }


_MEDIA_MAX_BYTES = 12 * 1024 * 1024

_MIME_SUFFIX = {
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/amr": ".amr",
    "audio/aac": ".aac",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}


async def _download_media(media_id: str) -> tuple[bytes, str]:
    """Download a Meta media object. Returns (bytes, mime_type)."""
    if not _bot_configured():
        raise IncomingError("WhatsApp media download is not configured.")
    async with httpx.AsyncClient(timeout=30) as client:
        meta = await client.get(
            f"https://graph.facebook.com/{_GRAPH_VERSION}/{media_id}",
            headers=_auth_headers(),
        )
        if meta.status_code >= 400:
            raise IncomingError(f"Could not fetch that attachment (error {meta.status_code}).")
        media_url = (meta.json() or {}).get("url") or ""
        mime = (meta.json() or {}).get("mime_type") or ""
        if not media_url:
            raise IncomingError("Could not fetch that attachment.")
        data_resp = await client.get(media_url, headers=_auth_headers())
        if data_resp.status_code >= 400:
            raise IncomingError("Could not download that attachment.")
        data = data_resp.content
    if not data or len(data) > _MEDIA_MAX_BYTES:
        raise IncomingError("That file is too large. Please send one under 12 MB.")
    return data, mime


def _id_upload_dir() -> Path:
    # backend/uploads/ids (gitignored; ephemeral on Render free tier).
    root = Path(__file__).resolve().parent.parent.parent
    target = root / "uploads" / "ids"
    target.mkdir(parents=True, exist_ok=True)
    return target


def _save_id_document(data: bytes, suffix: str, wa_number: str) -> str:
    digest = hashlib.sha256(f"{wa_number}:{time.time()}".encode()).hexdigest()[:16]
    name = f"qh_{digest}{suffix}"
    path = _id_upload_dir() / name
    path.write_bytes(data)
    return str(path)


async def _send_text(to: str, text: str) -> bool:
    """Send one WhatsApp text message. Returns True on success."""
    if not _bot_configured():
        logger.warning("WhatsApp reply skipped: access token / phone id not set.")
        return False
    headers = {
        "Authorization": f"Bearer {settings.whatsapp_access_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text[:4000]},
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_graph_url(), headers=headers, json=payload)
        if resp.status_code >= 400:
            logger.warning("WhatsApp send failed %s: %s", resp.status_code, resp.text[:500])
            return False
        return True
    except httpx.HTTPError:
        logger.warning("WhatsApp auto-reply delivery failed.", exc_info=True)
        return False


async def _mark_read(message_id: str) -> None:
    """Send a read receipt so the sender sees blue ticks quickly."""
    if not _bot_configured() or not message_id:
        return
    headers = {
        "Authorization": f"Bearer {settings.whatsapp_access_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "status": "read",
        "message_id": message_id,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(_graph_url(), headers=headers, json=payload)
    except httpx.HTTPError:
        pass  # read receipts are best-effort


_GREETINGS = {
    "hi", "hello", "hey", "salut", "bonjour", "bonsoir", "good morning",
    "good afternoon", "good evening", "yo", "start", "menu", "help",
    "info", "infos", "bonjour!", "hello!",
}
_THANKS = {"thanks", "thank you", "thankyou", "merci", "merci beaucoup", "thx"}


def _norm(text: str) -> str:
    return " ".join(text.strip().lower().split())


def _greeting_reply(name: str = "") -> str:
    hello = f"Hello {name}! " if name else "Hello! "
    return (
        f"{hello}Welcome to *{settings.bot_name}*. 🕊️\n\n"
        "I record anonymous safety reports for your community.\n\n"
        "👉 Just describe what happened, e.g.:\n"
        "_\"Armed robbery on Oxford Street, two men near the bus stop.\"_\n\n"
        "Type *help* anytime for examples. Your phone number is never stored."
    )


def _help_reply() -> str:
    return (
        f"*{settings.bot_name}* — how to report 📝\n\n"
        "Send one message per incident with:\n"
        "1️⃣ What happened\n"
        "2️⃣ Where (street / area / landmark)\n"
        "3️⃣ When (now, 10 min ago, last night…)\n\n"
        "Examples:\n"
        "• _\"Fire behind Kantamanto market, smoke from a shop, 20 min ago.\"_\n"
        "• _\"Flooding at Kaneshie market, road blocked, happening now.\"_\n\n"
        "Other commands:\n"
        "• *hi* — welcome message\n"
        "• *thanks* — close the chat\n\n"
        "🎙️ You can also send a *voice note* instead of typing.\n"
        "👤 Leading a quarter? Type *\"register as quarter head\"*.\n\n"
        "For danger right now, always call local emergency services first. 🚨"
    )


def _thanks_reply() -> str:
    return (
        f"You're welcome! 🙏 *{settings.bot_name}* is here 24/7.\n"
        "Send another report anytime — stay safe."
    )


# --- Conversational layer: understand intent BEFORE filing a report --------

_CONV_STATE: dict[str, dict[str, Any]] = {}
_CONV_TTL_SECONDS = 30 * 60

_INCIDENT_KEYWORDS = {
    # English
    "robbery", "robbed", "robber", "theft", "thief", "thieves", "steal",
    "stole", "stolen", "snatch", "vandal", "fire", "burn", "smoke", "flood",
    "flooded", "flooding", "attack", "fight", "fighting", "violence",
    "violent", "beat", "beaten", "stab", "gun", "knife", "weapon", "shot",
    "shooting", "accident", "crash", "emergency", "medical", "ambulance",
    "collapsed", "suspicious", "strange", "kidnap", "rape", "assault",
    "harass", "break-in", "break in", "burglary", "burglar", "arson",
    "explosion", "drown", "riot", "protest", "dead", "body", "injured",
    "injury", "wound", "bleeding", "unconscious", "missing", "lost child",
    "trapped", "blocked road", "fallen tree", "collapsed building",
    # French
    "vol", "volé", "voleur", "incendie", "feu", "inondation", "inondé",
    "agression", "agressé", "accident", "urgence", "suspect", "bizarre",
    "cambriolage", "bagarre", "violence", "arme", "couteau", "blessé",
    "saignement", "effondré", "noyade", "disparu", "coincé",
    # Pidgin / local
    "thief", "rogue", "wahala", "palava", "chakara",
}

_REPORT_INTENT = {
    "i want to report", "i wanna report", "want to report",
    "report an incident", "report something", "report a case",
    "i have a report", "i need to report", "let me report",
    "how do i report", "how to report", "how can i report",
    "je veux signaler", "je veux faire un signalement",
}

_CAPABILITY_Q = {
    "what can you do", "what do you do", "who are you", "who is this",
    "how does this work", "how do you work", "how does it work",
    "what is this", "what's this", "what is community watch",
    "que peux-tu faire", "qui es-tu", "comment ça marche",
}


def _get_state(number: str) -> dict[str, Any]:
    st = _CONV_STATE.get(number)
    if st and (time.time() - st.get("ts", 0) < _CONV_TTL_SECONDS):
        return st
    return {}


def _set_awaiting(number: str, reason: str = "details", **extra: Any) -> None:
    _CONV_STATE[number] = {"awaiting": reason, "ts": time.time(), **extra}


def _clear_state(number: str) -> None:
    _CONV_STATE.pop(number, None)


def _contains_any(text_low: str, phrases: set[str]) -> bool:
    return any(p in text_low for p in phrases)


def _looks_like_incident(text: str) -> bool:
    low = text.lower()
    if _contains_any(low, _INCIDENT_KEYWORDS):
        return True
    # Long message with a concrete place cue is probably a real description
    # even without a keyword match ("Two men near the bus stop…").
    # NOTE: bare "at"/"in"/"area" are deliberately NOT cues — phrases like
    # "i want to report an incident in my area" carry no real detail.
    if len(text.split()) >= 6 and any(
        cue in low for cue in (
            " near ", " behind ", " opposite ", " next to ",
            " along ", " around ", " street", " road", " market", " stop",
            " quarter", " village", " town",
            " près", " derrière ", " marché ",
            " rue ", " route ", " quartier ",
        )
    ):
        return True
    return False


def _is_vague_report_request(text: str) -> bool:
    low = text.lower()
    return _contains_any(low, _REPORT_INTENT) and not _looks_like_incident(text)


def _is_capability_question(text: str) -> bool:
    low = text.lower()
    return _contains_any(low, _CAPABILITY_Q)


def _is_generic_question(text: str) -> bool:
    stripped = text.strip()
    if not stripped.endswith("?"):
        return False
    return not _looks_like_incident(text)


def _ask_for_details_reply() -> str:
    return (
        "Of course — I'm listening. 🙏\n\n"
        "Tell me in one message:\n"
        "1️⃣ *What* happened?\n"
        "2️⃣ *Where* exactly (street / area / landmark)?\n"
        "3️⃣ *When* (now, 10 min ago, last night…)?\n\n"
        "Example: _\"Two men snatched a bag near the bus stop on Oxford Street, 10 min ago.\"_"
    )


def _clarify_reply() -> str:
    return (
        "Hmm, I want to get this right. 🤔\n\n"
        "Are you trying to *report an incident*? If yes, describe it like:\n"
        "_\"Fire behind Kantamanto market, happening now.\"_\n\n"
        "Or type *help* to see what I can do."
    )


def _capability_reply(name: str = "") -> str:
    hello = f"Hello {name}! " if name else ""
    return (
        f"{hello}I'm *{settings.bot_name}*, your community safety assistant. 🕊️\n\n"
        "Here's what I can do:\n"
        "📝 Record anonymous incident reports (robbery, fire, flood, …)\n"
        "🎙️ Understand voice notes too — just talk\n"
        "📊 Send them to the community dashboard for review\n"
        "👤 Register you as a *quarter head* so you receive your area's reports\n\n"
        "To report, just tell me what happened + where + when.\n"
        "Type *help* for examples."
    )


_REGISTER_INTENT = {
    "quarter head", "quarterhead", "quarter-head",
    "chef de quartier", "chef du quartier", "chef quartier",
    "register as head", "become head", "become a head",
    "i want to register", "i wanna register", "i need to register",
    "je veux m'inscrire", "je veux devenir chef", "devenir chef",
    "register me", "sign me up",
}


def _is_register_intent(text: str) -> bool:
    return _contains_any(text.lower(), _REGISTER_INTENT)


def _qh_ask_name_reply() -> str:
    return (
        "Great! Let's register you as a *quarter head*. 👤\n\n"
        "You'll receive every verified report from your area on this number.\n\n"
        "First — what is your *full name*?"
    )


def _qh_ask_area_reply(name: str) -> str:
    first = name.split()[0] if name else "Thanks"
    return (
        f"{first}, noted! ✅\n\n"
        "Which *quarter* are you head of, and in which *town/city*?\n"
        "Example: _\"Mokolo quarter, Yaoundé\"_"
    )


def _qh_ask_id_reply() -> str:
    return (
        "Perfect. 📍\n\n"
        "Last step: please send a *photo of your ID or any document*\n"
        "(ID card, attestation, chief's note…) so we can verify you.\n\n"
        "Or type *skip* to finish without a document."
    )


def _qh_done_reply() -> str:
    return (
        "🎉 *Registration received!*\n\n"
        "Our team will verify your details shortly.\n"
        "Once verified, you'll automatically receive new reports "
        "from your area here on WhatsApp.\n\n"
        "Thank you for watching over your community. 🕊️"
    )


def _ask_location_reply() -> str:
    return (
        "One more thing to help your quarter head find it 📍\n\n"
        "Which *quarter / town* exactly did this happen in?\n"
        "Example: _\"Mokolo, Yaoundé\"_\n\n"
        "You can also share your live *location* 📎 (Attach → Location)."
    )


async def _notify_heads(db: AsyncSession, report_id: int, skip_number: str = "") -> int:
    """Forward a report to verified quarter heads of its area. Returns count."""
    try:
        from ..models import Report as _Report

        report = await db.get(_Report, report_id)
        if report is None:
            return 0
        heads = await find_matching_heads(db, report)
        sent = 0
        for head in heads:
            if head.wa_number and head.wa_number == skip_number:
                continue
            if await _send_text(head.wa_number, head_alert_text(report)):
                sent += 1
        if sent:
            logger.info("Notified %s quarter head(s) about report %s.", sent, report_id)
        return sent
    except Exception:  # noqa: BLE001 - notifications must never break the flow
        logger.exception("Quarter-head notification failed.")
        return 0


def _confirmation_reply(incident_type: str, priority: str, report_id: int | None) -> str:
    ref = f" (ref #{report_id})" if report_id else ""
    return (
        "✅ *Report received*{ref}, thank you!\n\n"
        "Type: *{itype}*\n"
        "Priority: *{prio}*\n\n"
        "Our team will review it on the dashboard. "
        "Send more details anytime in a new message.".format(
            ref=ref, itype=incident_type.replace("_", " ").title(), prio=priority
        )
    )


def _split_area(area_text: str) -> tuple[str, str | None]:
    """"Mokolo quarter, Yaoundé" -> ("Mokolo quarter", "Yaoundé")."""
    clean = " ".join(area_text.split())[:200]
    if "," in clean:
        first, rest = clean.split(",", 1)
        return first.strip() or clean, rest.strip() or None
    return clean, None


async def _create_qh(
    db: AsyncSession,
    wa_number: str,
    name: str,
    area_text: str,
    lat: float | None = None,
    lng: float | None = None,
    media_id: str | None = None,
    media_path: str | None = None,
) -> QuarterHead:
    quarter, city = _split_area(area_text or "Unknown")
    head = QuarterHead(
        name=name.strip()[:120] or "Unknown",
        wa_number=wa_number,
        quarter_name=quarter[:150],
        city=(city[:150] if city else None),
        latitude=lat,
        longitude=lng,
        id_media_id=media_id,
        id_media_path=media_path,
        status="pending",
    )
    db.add(head)
    await db.commit()
    await db.refresh(head)
    return head


async def _ingest_and_confirm(
    db: AsyncSession, body: str, from_number: str, source: str = "whatsapp"
) -> int:
    """File a report, confirm to the reporter, notify heads, ask for location if missing."""
    try:
        result = await ingest_text(
            db,
            text=body,
            anonymous_id=f"wa:{from_number}",
            source=source,
        )
        await db.commit()
        report_id = getattr(result.report, "id", None)
        itype = getattr(result.report, "type", "incident")
        prio = getattr(result.report, "priority", None) or getattr(result.report, "severity", "low")
        await _send_text(from_number, _confirmation_reply(str(itype), str(prio), report_id))
        if report_id is not None:
            report = await db.get(Report, report_id)
            if report is not None and not (report.location_name or "").strip():
                _set_awaiting(from_number, f"loc_{report_id}")
                await _send_text(from_number, _ask_location_reply())
            else:
                await _notify_heads(db, report_id, skip_number=from_number)
        return 1
    except IncomingError as exc:
        await db.rollback()
        await _send_text(
            from_number,
            f"Sorry, I could not save that report: {exc}.\n"
            "Please try again with what happened + where it happened.",
        )
        return 0
    except Exception:  # noqa: BLE001
        logger.exception("WhatsApp message processing failed.")
        await db.rollback()
        await _send_text(
            from_number,
            f"Thanks — I saved the key details, but {_bot_name()} had a hiccup analysing it. "
            "Our team will still review it. 🙏",
        )
        return 0


async def _handle_qh_text(
    db: AsyncSession, body: str, from_number: str, state: dict[str, Any]
) -> int | None:
    """Quarter-head registration steps. Returns int when handled, None to fall through."""
    step = state.get("awaiting")
    if step == "qh_name":
        if _looks_like_incident(body) or _is_vague_report_request(body) or _is_capability_question(body):
            _clear_state(from_number)
            return None  # changed topic -> normal flow
        name = " ".join(body.split())[:120]
        if len(name) < 2:
            await _send_text(from_number, "Please tell me your *full name* to continue registration.")
            return 0
        _set_awaiting(from_number, "qh_area", qh_name=name)
        await _send_text(from_number, _qh_ask_area_reply(name))
        return 0
    if step == "qh_area":
        if _looks_like_incident(body):
            _clear_state(from_number)
            return None
        area = " ".join(body.split())[:200]
        if len(area) < 2:
            await _send_text(from_number, "Which *quarter and town* are you head of? Example: _\"Mokolo quarter, Yaoundé\"_")
            return 0
        _set_awaiting(from_number, "qh_id", qh_name=state.get("qh_name", ""), qh_area=area)
        await _send_text(from_number, _qh_ask_id_reply())
        return 0
    if step == "qh_id":
        if body.strip().lower() in {"skip", "no", "none", "no document", "pas de document", "non"}:
            await _create_qh(db, from_number, state.get("qh_name", ""), state.get("qh_area", ""))
            _clear_state(from_number)
            await _send_text(from_number, _qh_done_reply())
            return 0
        if _looks_like_incident(body):
            _clear_state(from_number)
            return None
        await _send_text(
            from_number,
            "Please send a *photo of your document* 📷 so we can verify you — "
            "or type *skip* to finish without one.",
        )
        return 0
    return None


async def _handle_loc_text(
    db: AsyncSession, body: str, from_number: str, report_id: int
) -> int | None:
    """Location follow-up for a report filed without location. None -> fall through."""
    if _looks_like_incident(body):
        _clear_state(from_number)
        return None  # it's a new incident, not the location
    loc = " ".join(body.split())[:200]
    if len(loc) < 2:
        await _send_text(from_number, _ask_location_reply())
        return 0
    report = await db.get(Report, report_id)
    if report is None:
        _clear_state(from_number)
        return None
    report.location_name = loc
    await db.commit()
    _clear_state(from_number)
    sent = await _notify_heads(db, report.id, skip_number=from_number)
    if sent:
        await _send_text(
            from_number,
            f"Got it — attached *{loc}* to your report #{report.id}. ✅\n"
            f"I've forwarded it to {sent} quarter head(s) in that area. 🙏",
        )
    else:
        await _send_text(
            from_number,
            f"Got it — attached *{loc}* to your report #{report.id}. ✅\n"
            "Our team will route it to the right quarter head. 🙏",
        )
    return 0


async def _handle_location_message(db: AsyncSession, msg: dict[str, Any], from_number: str) -> int:
    loc = msg.get("location") or {}
    try:
        lat = float(loc.get("latitude")) if loc.get("latitude") is not None else None
        lng = float(loc.get("longitude")) if loc.get("longitude") is not None else None
    except (TypeError, ValueError):
        lat, lng = None, None
    name = str(loc.get("name") or loc.get("address") or "").strip()[:200]
    state = _get_state(from_number)
    awaiting = state.get("awaiting") or ""
    if awaiting == "qh_area":
        _set_awaiting(
            from_number, "qh_id",
            qh_name=state.get("qh_name", ""),
            qh_area=name or state.get("qh_area", ""),
            qh_lat=lat, qh_lng=lng,
        )
        await _send_text(from_number, _qh_ask_id_reply())
        return 0
    if awaiting.startswith("loc_"):
        try:
            report_id = int(awaiting.split("_", 1)[1])
        except ValueError:
            _clear_state(from_number)
            return 0
        report = await db.get(Report, report_id)
        if report is None:
            _clear_state(from_number)
            return 0
        if lat is not None and lng is not None:
            report.latitude, report.longitude = lat, lng
        if name:
            report.location_name = name
        await db.commit()
        _clear_state(from_number)
        sent = await _notify_heads(db, report.id, skip_number=from_number)
        await _send_text(
            from_number,
            f"📍 Location saved for report #{report.id}. Thank you!\n"
            + (f"Forwarded to {sent} quarter head(s). 🙏" if sent else "Our team will route it. 🙏"),
        )
        return 0
    await _send_text(
        from_number,
        "📍 Location received! Now please *describe what happened there* in words:\n"
        "_\"Theft near the market, 10 min ago.\"_",
    )
    _set_awaiting(from_number, "details")
    return 0


async def _handle_audio_message(db: AsyncSession, msg: dict[str, Any], from_number: str) -> int:
    audio = msg.get("audio") or msg.get("voice") or {}
    media_id = str(audio.get("id") or "")
    if not media_id:
        return 0
    await _send_text(from_number, "🎙️ Listening to your voice note… one moment.")
    try:
        data, mime = await _download_media(media_id)
    except IncomingError as exc:
        await _send_text(
            from_number,
            f"Sorry, I couldn't fetch that voice note: {exc}\n"
            "Please type your report instead. 🙏",
        )
        return 0
    suffix = _MIME_SUFFIX.get((mime or "").split(";")[0].strip().lower(), ".ogg")
    try:
        transcript = await asyncio.to_thread(transcribe_from_bytes, data, suffix)
        text = (transcript.get("text") or "").strip()
    except TranscriptionError:
        logger.warning("WhatsApp voice transcription failed.", exc_info=True)
        await _send_text(
            from_number,
            "Sorry, I couldn't understand that voice note (voice service is unavailable right now). 🙏\n"
            "Please *type* your report: what happened + where + when.",
        )
        return 0
    if len(text) < 3:
        await _send_text(
            from_number,
            "I couldn't hear any speech in that voice note. 🎙️\n"
            "Please try again, or *type* your report instead.",
        )
        return 0
    return await _handle_text_body(db, text, from_number, source="whatsapp_voice")


async def _handle_media_message(
    db: AsyncSession, msg: dict[str, Any], from_number: str, msg_type: str
) -> int:
    media = (msg.get(msg_type) or {}) if isinstance(msg.get(msg_type), dict) else {}
    media_id = str(media.get("id") or "")
    caption = str(media.get("caption") or "").strip()
    state = _get_state(from_number)
    if (state.get("awaiting") or "") == "qh_id" and media_id:
        try:
            data, mime = await _download_media(media_id)
        except IncomingError as exc:
            await _send_text(
                from_number,
                f"I couldn't fetch that document: {exc}\nPlease resend the photo, or type *skip*.",
            )
            return 0
        suffix = _MIME_SUFFIX.get((mime or "").split(";")[0].strip().lower(), ".jpg")
        path = _save_id_document(data, suffix, from_number)
        await _create_qh(
            db, from_number, state.get("qh_name", ""), state.get("qh_area", ""),
            state.get("qh_lat"), state.get("qh_lng"), media_id, path,
        )
        _clear_state(from_number)
        await _send_text(from_number, _qh_done_reply())
        return 0
    # Photo/document outside registration: process any incident caption.
    if caption and (_looks_like_incident(caption) or _is_vague_report_request(caption)):
        await _send_text(from_number, "Photo received. ✅ Processing your description…")
        return await _handle_text_body(db, caption, from_number)
    await _send_text(
        from_number,
        "Photo/document received. ✅\n\n"
        "• To *report*, describe the incident in words (what + where + when).\n"
        "• To lead your area, type *\"register as quarter head\"*.",
    )
    return 0


async def _handle_one_message(db: AsyncSession, msg: dict[str, Any], sender_name: str = "") -> int:
    """Process a single Meta message dict. Returns 1 if a report was created."""
    msg_id = str(msg.get("id") or "")
    if msg_id and _already_seen(msg_id):
        return 0
    from_number = str(msg.get("from") or "").strip()
    if not from_number:
        return 0
    msg_type = msg.get("type")
    if not msg_type:
        return 0  # delivery receipts / status updates -> just ack

    # Blue ticks fast so the chat feels alive.
    await _mark_read(msg_id)

    # Non-text types have dedicated handlers (audio, photos, locations…).
    if msg_type == "location":
        return await _handle_location_message(db, msg, from_number)
    if msg_type in ("audio", "voice"):
        return await _handle_audio_message(db, msg, from_number)
    if msg_type in ("image", "document"):
        return await _handle_media_message(db, msg, from_number, msg_type)
    if msg_type not in ("text", "interactive"):
        if not msg_type:
            return 0  # delivery receipts / status updates -> just ack
        await _send_text(
            from_number,
            "Sorry, I can only read *text* reports for now. 🙏\n"
            "Please describe the incident in words (what + where + when).",
        )
        return 0

    # Interactive (button / list replies) carry their text in a nested field.
    if msg_type == "text":
        body = ((msg.get("text") or {}) or {}).get("body") or ""
    else:
        interactive = msg.get("interactive") or {}
        body = (
            ((interactive.get("button_reply") or {}).get("title"))
            or ((interactive.get("list_reply") or {}).get("title"))
            or ""
        )

    return await _handle_text_body(db, body, from_number, sender_name)


async def _handle_text_body(
    db: AsyncSession, body: str, from_number: str,
    sender_name: str = "", source: str = "whatsapp",
) -> int:
    """Route a text message through chatbot understanding. Returns 1 if a report was filed."""
    body = (body or "").strip()
    if not body:
        return 0

    short = _norm(body)
    if short in _GREETINGS or short in {"hi there", "hey there"}:
        await _send_text(from_number, _greeting_reply(sender_name))
        return 0
    if short in _THANKS:
        await _send_text(from_number, _thanks_reply())
        return 0
    if short in {"help", "menu", "info", "infos", "aide"} or body.strip() == "?":
        await _send_text(from_number, _help_reply())
        return 0
    if len(short) < 4:
        await _send_text(
            from_number,
            "Could you describe the incident in a bit more detail? 🙏\n"
            "Example: _\"Theft near Nungua market, this morning.\"_",
        )
        return 0

    # --- Conversational understanding (stateless + short-term context) ---
    state = _get_state(from_number)
    awaiting = state.get("awaiting") or ""

    # Capability / identity questions -> answer, never file a report.
    if _is_capability_question(body):
        _clear_state(from_number)
        await _send_text(from_number, _capability_reply(sender_name))
        return 0

    # Quarter-head registration flow (multi-step) has priority while active.
    if awaiting in ("qh_name", "qh_area", "qh_id"):
        handled = await _handle_qh_text(db, body, from_number, state)
        if handled is not None:
            return handled
        # Fell through (user changed topic) -> continue to normal flow below.

    # Location follow-up for a report filed without location.
    if awaiting.startswith("loc_"):
        try:
            loc_report_id = int(awaiting.split("_", 1)[1])
        except ValueError:
            _clear_state(from_number)
            loc_report_id = 0
        if loc_report_id:
            handled = await _handle_loc_text(db, body, from_number, loc_report_id)
            if handled is not None:
                return handled
            # Fell through (it's a new incident) -> continue below.

    # Someone wants to register as quarter head -> start the flow.
    if _is_register_intent(body):
        _set_awaiting(from_number, "qh_name")
        await _send_text(from_number, _qh_ask_name_reply())
        return 0

    # "I want to report…" with no actual details yet -> ask, don't file.
    if _is_vague_report_request(body):
        _set_awaiting(from_number, "details")
        await _send_text(from_number, _ask_for_details_reply())
        return 0

    # We asked for details and the user is still vague -> guide again.
    if awaiting and not _looks_like_incident(body):
        if _is_generic_question(body):
            await _send_text(from_number, _clarify_reply())
        else:
            await _send_text(from_number, _ask_for_details_reply())
        return 0

    # Chit-chat / unclear one-liners that carry no incident info ->
    # hold a normal conversation instead of filing an empty "report".
    if not awaiting and not _looks_like_incident(body) and len(body.split()) <= 12:
        _set_awaiting(from_number, "details")
        await _send_text(from_number, _clarify_reply())
        return 0

    _clear_state(from_number)
    return await _ingest_and_confirm(db, body, from_number, source)


def _bot_name() -> str:
    return settings.bot_name or "Community Watch"


async def _process_payload(payload: dict[str, Any]) -> None:
    """Run AFTER we answered Meta with 200 (own DB session — never reuse the request one)."""
    try:
        created = 0
        async with SessionLocal() as db:
            for entry in payload.get("entry", []) or []:
                for change in entry.get("changes", []) or []:
                    value = change.get("value") or {}
                    contacts = {c.get("wa_id"): c for c in value.get("contacts", []) or []}
                    for msg in value.get("messages", []) or []:
                        wa_id = str(msg.get("from") or "")
                        profile = (contacts.get(wa_id) or {}).get("profile") or {}
                        sender_name = str(profile.get("name") or "").strip()
                        created += await _handle_one_message(db, msg, sender_name)
        logger.info("WhatsApp webhook processed %s report(s).", created)
    except Exception:  # noqa: BLE001 - never kill the request on processing errors
        logger.exception("WhatsApp webhook background processing failed.")


@router.post("/webhook")
async def webhook_event(request: Request, background_tasks: BackgroundTasks) -> dict[str, Any]:
    """Receive Meta webhook events.

    Responds to Meta immediately (200) and processes messages in the
    background, because AI extraction may exceed Meta's response window.
    A FRESH database session is opened in the background worker — the
    request never shares its session with the background task.
    """
    raw = await request.body()
    if not _signature_ok(raw, request.headers.get("X-Hub-Signature-256")):
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")

    try:
        payload = json.loads(raw or b"{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON body: {exc}") from exc

    background_tasks.add_task(_process_payload, payload)

    # Meta expects a fast 200 — acknowledge the event instantly.
    return {"received": True, "processing": "background"}
