"""Quarter-head registry: register, list, verify (admin)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..models import QuarterHead
from ..models.report import utcnow
from ..schemas import QuarterHeadCreate, QuarterHeadOut, QuarterHeadStatusUpdate

router = APIRouter(prefix="/quarter-heads", tags=["quarter-heads"])


def _mask(number: str) -> str:
    digits = "".join(ch for ch in number if ch.isdigit())
    if len(digits) <= 3:
        return "***"
    return f"***{digits[-3:]}"


def _out(head: QuarterHead) -> QuarterHeadOut:
    return QuarterHeadOut(
        id=head.id,
        name=head.name,
        wa_number_masked=_mask(head.wa_number or ""),
        quarter_name=head.quarter_name,
        city=head.city,
        latitude=head.latitude,
        longitude=head.longitude,
        has_id_document=bool(head.id_media_path or head.id_media_id),
        notes=head.notes,
        status=head.status,
        created_at=head.created_at,
        verified_at=head.verified_at,
    )


@router.get("", response_model=list[QuarterHeadOut])
async def list_heads(
    status: str | None = None, session: AsyncSession = Depends(get_db)
) -> list[QuarterHeadOut]:
    stmt = select(QuarterHead).order_by(QuarterHead.created_at.desc()).limit(200)
    if status in ("pending", "verified", "rejected"):
        stmt = select(QuarterHead).where(QuarterHead.status == status).order_by(
            QuarterHead.created_at.desc()
        ).limit(200)
    heads = list((await session.execute(stmt)).scalars())
    return [_out(h) for h in heads]


@router.post("", response_model=QuarterHeadOut, status_code=201)
async def register_head(
    payload: QuarterHeadCreate, session: AsyncSession = Depends(get_db)
) -> QuarterHeadOut:
    """Manual registration (dashboard / admin). WhatsApp flow uses the same table."""
    head = QuarterHead(
        name=payload.name.strip(),
        wa_number="".join(ch for ch in payload.wa_number if ch.isdigit() or ch == "+").strip(),
        quarter_name=payload.quarter_name.strip(),
        city=(payload.city or "").strip() or None,
        latitude=payload.latitude,
        longitude=payload.longitude,
        notes=payload.notes,
        status="pending",
    )
    session.add(head)
    await session.commit()
    await session.refresh(head)
    return _out(head)


@router.patch("/{head_id}/status", response_model=QuarterHeadOut)
async def set_head_status(
    head_id: int,
    payload: QuarterHeadStatusUpdate,
    session: AsyncSession = Depends(get_db),
) -> QuarterHeadOut:
    """Verify or reject a quarter head. Only verified heads get area reports."""
    head = await session.get(QuarterHead, head_id)
    if head is None:
        raise HTTPException(status_code=404, detail="Quarter head not found.")
    head.status = payload.status
    head.verified_at = utcnow() if payload.status == "verified" else None
    await session.commit()
    await session.refresh(head)
    return _out(head)
