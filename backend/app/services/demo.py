"""Sample data seeding and cleanup for demo mode."""

from __future__ import annotations

import math
import random
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Alert, Cluster, Report
from ..models.report import utcnow
from .clustering import process_report

# (type, severity, latitude, longitude, description, hours_ago, jitter_km)
SEEDS: list[tuple[str, str, float, float, str, int, float]] = [
    # Armed robberies — Osu / Labadi / near a bus stop (active, high)
    ("robbery", "high", 5.5550, -0.1750, "Armed robbery reported on Oxford Street at night, two suspects seen fleeing.", 5, 0.4),
    ("robbery", "high", 5.5650, -0.1680, "Robbery attempt reported along the beach road near Labadi.", 4, 0.5),
    ("robbery", "medium", 5.5500, -0.1600, "Snatch-and-run incident reported near a bus stop in Osu.", 3, 0.5),
    # Flooding — Kaneshie / Dansoman / A-Line (active, high)
    ("flood", "high", 5.5750, -0.2340, "Heavy rain flooded the Kaneshie market stretch, traders unable to access stalls.", 5, 0.5),
    ("flood", "high", 5.5460, -0.2860, "Floodwater covering the road near Dansoman Roundabout, vehicles stuck.", 4, 0.5),
    ("flood", "medium", 5.5620, -0.2520, "Storm drain overflow along the A-Line; water rising quickly.", 3, 0.6),
    # Fire — Accra Central markets (active, medium)
    ("fire", "high", 5.5486, -0.2111, "Smoke seen coming from a shop building near Kantamanto market.", 22, 0.4),
    ("fire", "medium", 5.5445, -0.2035, "Minor electrical fire in a store near Makola; put out before spreading.", 21, 0.5),
    # Suspicious activity — Madina / Adenta (active, medium)
    ("suspicious_activity", "low", 5.6810, -0.1690, "Group lingering near the community school after closing hours.", 20, 0.5),
    ("suspicious_activity", "medium", 5.6900, -0.1600, "Unmarked vehicle circling the neighbourhood slowly at night.", 19, 0.5),
    # Theft / vandalism — Nungua / Teshie (monitoring, low)
    ("theft", "low", 5.6010, -0.0500, "Bicycle stolen from a residential compound in Nungua.", 46, 0.5),
    ("vandalism", "low", 5.5930, -0.0900, "Street lights smashed along the Teshie road.", 45, 0.5),
    # Single reports (expected to stay low priority — one source is not confirmation)
    ("medical_emergency", "medium", 5.6500, -0.1900, "Person collapsed at the Legon bus station; ambulance dispatched.", 2, 0.4),
    ("suspicious_activity", "low", 5.6330, -0.1150, "Suspicious package left near a shop entrance on Spintex Road.", 1, 0.5),
    ("flood", "medium", 5.6370, -0.0050, "Drains blocked in Tema Community 1 after heavy rain.", 70, 0.6),
    ("fire", "medium", 5.6230, -0.2300, "Bush fire reported close to the railway line near Achimota.", 90, 0.9),
]


async def seed_demo(session: AsyncSession, force: bool = False) -> dict[str, int]:
    existing = (await session.execute(select(Report.id).limit(1))).first()
    if existing is not None and not force:
        return {"seeded": 0, "skipped": True}

    if force:
        await _clear_all(session)

    rng = random.Random(20240924)
    created: list[Report] = []
    now = utcnow()

    for type_, severity, lat, lng, description, hours_ago, jitter_km in SEEDS:
        offset_lat = (rng.random() - 0.5) * 2 * jitter_km / 111.0
        offset_lng = (
            (rng.random() - 0.5)
            * 2
            * jitter_km
            / (111.0 * math.cos(math.radians(abs(lat))))
        )
        reported_at = now - timedelta(hours=hours_ago, minutes=rng.randint(0, 30))
        report = Report(
            type=type_,
            severity=severity,
            latitude=lat + offset_lat,
            longitude=lng + offset_lng,
            description=description,
            occurred_at=reported_at,
            created_at=reported_at,
            status="pending",
        )
        session.add(report)
        created.append(report)

    await session.flush()
    for report in created:
        await process_report(session, report)
    await session.commit()

    return {
        "seeded": len(created),
        "skipped": False,
    }


async def clear_demo(session: AsyncSession) -> None:
    await _clear_all(session)
    await session.commit()


async def _clear_all(session: AsyncSession) -> None:
    await session.execute(delete(Alert))
    await session.execute(delete(Cluster))
    await session.execute(delete(Report))