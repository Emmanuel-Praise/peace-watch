"""Match reports to verified quarter heads by area name.

Matching is deliberately simple substring logic (works without PostGIS):
a head matches when their quarter/city name appears in the report's area
text or vice versa. Coordinates refine it when both sides have them.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import QuarterHead, Report

_MAX_HEADS_PER_REPORT = 10


def _norm(text: str | None) -> str:
    return " ".join((text or "").strip().lower().split())


def report_area_text(report: Report) -> str:
    parts = [report.location_name or "", report.description or ""]
    details = report.details if isinstance(report.details, dict) else {}
    if isinstance(details, dict):
        for key in ("location", "area", "quarter", "city"):
            value = details.get(key)
            if isinstance(value, str):
                parts.append(value)
    return " ".join(p for p in parts if p)


def head_matches_area(head: QuarterHead, area_text: str) -> bool:
    area = _norm(area_text)
    quarter = _norm(head.quarter_name)
    city = _norm(head.city)
    if not area:
        return False
    if quarter and (quarter in area or area in quarter):
        return True
    if city and len(city) >= 3 and (city in area or area in city):
        return True
    return False


async def find_matching_heads(session: AsyncSession, report: Report) -> list[QuarterHead]:
    area = report_area_text(report)
    if not _norm(area):
        return []
    stmt = select(QuarterHead).where(QuarterHead.status == "verified").limit(200)
    heads = list((await session.execute(stmt)).scalars())
    matched = [h for h in heads if head_matches_area(h, area)]
    return matched[:_MAX_HEADS_PER_REPORT]


def head_alert_text(report: Report) -> str:
    area = (report.location_name or "your area").strip() or "your area"
    itype = str(getattr(report, "type", "incident")).replace("_", " ")
    summary = (report.ai_summary or report.description or "")[:300]
    return (
        f"🔔 *New report in {area}*\n\n"
        f"Type: *{itype.title()}*\n"
        f"Priority: *{report.priority}*\n"
        f"Ref: #{report.id}\n\n"
        f"{summary}\n\n"
        f"— via *Community Watch*"
    )
