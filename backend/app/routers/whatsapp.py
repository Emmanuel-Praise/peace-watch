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

Privacy: the sender's phone number is only stored as a SHA-256 hash
(anonymous_id_sha256 on the report row) — never the raw number.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from collections import OrderedDict
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.database import SessionLocal
from ..services.pipeline import IncomingError, ingest_text

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
        "For danger right now, always call local emergency services first. 🚨"
    )


def _thanks_reply() -> str:
    return (
        f"You're welcome! 🙏 *{settings.bot_name}* is here 24/7.\n"
        "Send another report anytime — stay safe."
    )


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

    # Interactive (button / list replies) carry their text in a nested field.
    body = ""
    if msg_type == "text":
        body = ((msg.get("text") or {}) or {}).get("body") or ""
    elif msg_type == "interactive":
        interactive = msg.get("interactive") or {}
        body = (
            ((interactive.get("button_reply") or {}).get("title"))
            or ((interactive.get("list_reply") or {}).get("title"))
            or ""
        )
    else:
        await _send_text(
            from_number,
            "Sorry, I can only read *text* reports for now. 🙏\n"
            "Please describe the incident in words (what + where + when).",
        )
        return 0

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

    try:
        result = await ingest_text(
            db,
            text=body,
            anonymous_id=f"wa:{from_number}",
            source="whatsapp",
        )
        await db.commit()
        report_id = getattr(result.report, "id", None)
        itype = getattr(result.report, "type", "incident")
        prio = getattr(result.report, "priority", None) or getattr(result.report, "severity", "low")
        await _send_text(from_number, _confirmation_reply(str(itype), str(prio), report_id))
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
