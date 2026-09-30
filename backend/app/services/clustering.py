"""
Corroboration / clustering engine.

Reports that occur close together in space and time are grouped into
clusters. Cluster priority reflects the *volume and severity* of reports;
nothing is ever marked "confirmed" automatically.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..models import Alert, Cluster, Report
from ..models.report import utcnow

SEVERITY_WEIGHTS = {"low": 1, "medium": 2, "high": 3}

# Human-friendly labels used in alert messages.
TYPE_LABELS = {
    "robbery": "robbery",
    "theft": "theft",
    "vandalism": "vandalism",
    "fire": "fire",
    "flood": "flood",
    "suspicious_activity": "suspicious activity",
    "medical_emergency": "medical emergency",
    "violence": "violence",
    "other": "other incidents",
}


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in kilometres."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _within_time(report_time: datetime, cluster: Cluster) -> bool:
    window = timedelta(hours=settings.cluster_time_window_hours)
    span_end = cluster.last_report_at or cluster.created_at
    if abs(report_time - span_end) <= window:
        return True
    return abs(report_time - cluster.created_at) <= window


def independent_count(reports: list[Report]) -> int:
    """
    Number of independent sources in a set of reports.

    Reports with the same anonymous_id count once; reports without an id
    (manual/dashboard) each count as an independent source. This stops one
    reporter from artificially inflating a cluster.
    """
    seen: set[str] = set()
    count = 0
    for report in reports:
        if report.anonymous_id_sha256:
            if report.anonymous_id_sha256 not in seen:
                seen.add(report.anonymous_id_sha256)
                count += 1
        else:
            count += 1
    return count


def compute_priority(reports: list[Report]) -> str:
    """Score a cluster from its *independent* reports -> low/medium/high."""
    if not reports or independent_count(reports) == 0:
        return "low"

    weights = [SEVERITY_WEIGHTS.get(r.severity, 1) for r in reports]
    ind = independent_count(reports)
    avg_weight = sum(weights) / len(weights)

    score = ind * avg_weight
    most_recent = max(r.occurred_at for r in reports)
    if utcnow() - most_recent <= timedelta(hours=settings.cluster_active_hours / 2):
        score += 1
    if ind >= 4:
        score += 1
    if avg_weight >= 2.5 and ind >= 2:
        score += 1

    if score >= 8:
        return "high"
    if score >= 4:
        return "medium"
    return "low"


def compute_status(last_report_at: datetime) -> str:
    if utcnow() - last_report_at <= timedelta(hours=settings.cluster_active_hours):
        return "active"
    return "monitoring"


async def refresh_cluster(session: AsyncSession, cluster: Cluster) -> Cluster:
    """Recompute stats, priority and status of a single cluster from its reports."""
    result = await session.execute(
        select(Report).where(
            Report.cluster_id == cluster.id,
            Report.status != "dismissed",
        )
    )
    reports = list(result.scalars())

    cluster.report_count = len(reports)
    cluster.independent_report_count = independent_count(reports)
    if reports:
        cluster.center_lat = sum(r.latitude for r in reports) / len(reports)
        cluster.center_lng = sum(r.longitude for r in reports) / len(reports)
        cluster.radius_km = max(
            haversine_km(r.latitude, r.longitude, cluster.center_lat, cluster.center_lng)
            for r in reports
        )
        cluster.last_report_at = max(r.occurred_at for r in reports)
    else:
        cluster.radius_km = 0.0

    cluster.priority = compute_priority(reports)
    cluster.status = compute_status(cluster.last_report_at)
    await session.flush()

    await reconcile_alerts(session, cluster)
    return cluster


async def reconcile_alerts(session: AsyncSession, cluster: Cluster) -> list[Alert]:
    """Raise an operator alert when a cluster reaches Medium/High priority."""
    if cluster.priority not in ("medium", "high"):
        return []

    result = await session.execute(
        select(Alert).where(
            Alert.cluster_id == cluster.id,
            Alert.status.in_(["new", "acknowledged"]),
        )
    )
    open_alerts = list(result.scalars())

    result = await session.execute(
        select(Report.type).where(Report.cluster_id == cluster.id)
    )
    labels = ", ".join(
        TYPE_LABELS.get(t, t) for t in sorted(set(result.scalars().all()))
    ) or "incidents"
    title = f"{cluster.priority.upper()} signal detected"
    sources = cluster.independent_report_count or cluster.report_count
    message = (
        f"{cluster.report_count} similar reports from {sources} independent source"
        f"{'s' if sources != 1 else ''} ({labels}) were received near this area within a "
        f"{settings.cluster_time_window_hours}h window. Verify the situation on the ground "
        f"before taking further action."
    )

    if open_alerts:
        if open_alerts[0].priority != cluster.priority:
            open_alerts[0].priority = cluster.priority
            open_alerts[0].title = title
            open_alerts[0].message = message
            await session.flush()
        return []

    alert = Alert(
        cluster_id=cluster.id,
        priority=cluster.priority,
        title=title,
        message=message,
        status="new",
        channel="system",
    )
    session.add(alert)
    await session.flush()
    return [alert]


async def cluster_types(session: AsyncSession, cluster_ids: list[int]) -> dict[int, list[str]]:
    """Distinct report types per cluster, for dashboard display."""
    if not cluster_ids:
        return {}
    rows = await session.execute(
        select(Report.cluster_id, Report.type).where(Report.cluster_id.in_(cluster_ids))
    )
    mapping: dict[int, list[str]] = {}
    for cluster_id, type_ in rows.all():
        mapping.setdefault(cluster_id, [])
        if type_ not in mapping[cluster_id]:
            mapping[cluster_id].append(type_)
    return mapping


async def process_report(
    session: AsyncSession, report: Report
) -> Cluster | None:
    """
    Corroborate a single report: join an existing matching cluster or seed a
    new one. Called on every report creation.

    Reports without coordinates cannot be placed in space and are left
    unclustered (a cluster_id of None) until an operator pins a location.
    """
    if report.latitude is None or report.longitude is None:
        return None

    result = await session.execute(select(Cluster).order_by(Cluster.id))
    clusters = list(result.scalars())
    cluster_types_map = await cluster_types(session, [c.id for c in clusters])

    same_candidates: list[tuple[float, Cluster]] = []
    other_candidates: list[tuple[float, Cluster]] = []

    for cluster in clusters:
        distance = haversine_km(
            report.latitude, report.longitude, cluster.center_lat, cluster.center_lng
        )
        if distance > settings.cluster_radius_km:
            continue
        if not _within_time(report.occurred_at, cluster):
            continue
        if report.type in cluster_types_map.get(cluster.id, []):
            same_candidates.append((distance, cluster))
        else:
            other_candidates.append((distance, cluster))

    best: Cluster | None = None
    if same_candidates:
        best = min(same_candidates, key=lambda item: item[0])[1]
    elif other_candidates:
        best = min(other_candidates, key=lambda item: item[0])[1]

    if best is None:
        best = Cluster(
            center_lat=report.latitude,
            center_lng=report.longitude,
            radius_km=0.0,
            priority="low",
            status="active",
            last_report_at=report.occurred_at,
        )
        session.add(best)
        await session.flush()

    report.cluster_id = best.id
    await session.flush()
    return await refresh_cluster(session, best)


async def recompute_all(session: AsyncSession) -> dict[str, int]:
    """
    Run corroboration over every unclustered report and refresh every open
    cluster. Used on startup and by the explicit "recompute clusters" action.
    """
    result = await session.execute(
        select(Report)
        .where(Report.cluster_id.is_(None), Report.status != "dismissed")
        .order_by(Report.occurred_at)
    )
    unassigned = list(result.scalars())

    for report in unassigned:
        await process_report(session, report)

    result = await session.execute(
        select(Cluster)
        .where(Cluster.status.in_(["active", "monitoring"]))
        .order_by(Cluster.id)
    )
    clusters = list(result.scalars())
    created_alerts = 0
    for cluster in clusters:
        before = (await session.execute(
            select(func.count(Alert.id)).where(
                Alert.cluster_id == cluster.id,
                Alert.status.in_(["new", "acknowledged"]),
            )
        )).scalar_one()
        await refresh_cluster(session, cluster)
        after = (await session.execute(
            select(func.count(Alert.id)).where(
                Alert.cluster_id == cluster.id,
                Alert.status.in_(["new", "acknowledged"]),
            )
        )).scalar_one()
        if after > before:
            created_alerts += after - before

    await session.commit()

    return {
        "clusters": len(clusters),
        "reports_assigned": len(unassigned),
        "created_alerts": created_alerts,
    }