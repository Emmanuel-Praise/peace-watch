"""
WhatsApp / Meta Cloud API webhook.

Meta calls this endpoint in two situations:

1. GET  .../api/whatsapp/webhook  ->  webhook *verification* handshake.
   Meta sends ?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=X.
   We reply with X (plain text) only when the verify token matches.
2. POST .../api/whatsapp/webhook  ->  incoming message events.
   Text messages are scrubbed and pushed through the standard incident
   pipeline (report -> AI extraction -> corroboration -> dashboard), exactly
   like the /ingest endpoint. Other / unsupported messages are acknowledged.

Privacy: the sender's phone number is only stored as a SHA-256 hash
(anonymous_id_sha256 on the report row) — never the raw number.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.database import get_db
from ..services.pipeline import IncomingError, ingest_text

logger = logging.getLogger("peacewatch.whatsapp")

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])

_GRAPH_VERSION = "v21.0"


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
) -> Response:
    """Answer Meta's webhook verification handshake."""
    if (
        hub_mode == "subscribe"
        and hub_verify_token == settings.whatsapp_verify_token
        and hub_challenge is not None
    ):
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Webhook verification failed.")


async def _maybe_reply(to: str, text: str) -> None:
    """Send a confirmation reply when access token + phone id are configured."""
    if not settings.whatsapp_access_token or not settings.whatsapp_phone_number_id:
        return
    url = (
        f"https://graph.facebook.com/{_GRAPH_VERSION}/"
        f"{settings.whatsapp_phone_number_id}/messages"
    )
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
            await client.post(url, headers=headers, json=payload)
    except httpx.HTTPError:
        logger.warning("WhatsApp auto-reply delivery failed.", exc_info=True)


async def _handle_messages(db: AsyncSession, value: dict[str, Any]) -> int:
    """Create reports from every text message in one webhook 'value' block."""
    created = 0
    for msg in value.get("messages", []) or []:
        from_number = str(msg.get("from") or "").strip()
        msg_type = msg.get("type")

        if not msg_type:
            continue  # delivery receipts / status updates -> just ack
        if msg_type != "text":
            await _maybe_reply(
                from_number,
                "Sorry, I can only process text reports right now. Please send your report as text.",
            )
            continue

        body = ((msg.get("text") or {}) or {}).get("body") or ""
        if not body.strip():
            continue

        try:
            result = await ingest_text(
                db,
                text=body,
                anonymous_id=f"wa:{from_number}",
                source="whatsapp",
            )
            created += 1
            await _maybe_reply(from_number, result.message)
        except IncomingError as exc:
            await _maybe_reply(
                from_number,
                f"Sorry, I could not process that message: {exc}. Please try again.",
            )
    return created


async def _process_payload(db: AsyncSession, payload: dict[str, Any]) -> None:
    """Run in the background after we have acknowledged Meta with 200.

    AI extraction can take longer than Meta's ~20 s webhook timeout, so the
    actual work happens here (in-process background task), not in the handler.
    """
    try:
        created = 0
        for entry in payload.get("entry", []) or []:
            for change in entry.get("changes", []) or []:
                value = change.get("value") or {}
                created += await _handle_messages(db, value)
        await db.commit()
        logger.info("WhatsApp webhook processed %s report(s).", created)
    except Exception:  # noqa: BLE001 - never kill the request on processing errors
        logger.exception("WhatsApp webhook background processing failed.")


@router.post("/webhook")
async def webhook_event(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Receive Meta webhook events and ingest WhatsApp text reports.

    Responds to Meta immediately (200) and processes messages in the
    background, because AI extraction may exceed Meta's response window.
    """
    raw = await request.body()
    if not _signature_ok(raw, request.headers.get("X-Hub-Signature-256")):
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")

    try:
        payload = json.loads(raw or b"{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON body: {exc}") from exc

    background_tasks.add_task(_process_payload, db, payload)

    # Meta expects a fast 200 — acknowledge the event instantly.
    return {"received": True, "processing": "background"}