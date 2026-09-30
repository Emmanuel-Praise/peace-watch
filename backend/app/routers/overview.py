from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import settings
from ..core.database import engine, get_db
from ..models import Alert, Cluster, Report
from ..models.report import utcnow
from ..schemas import (
    AIStatus,
    AlertOut,
    ClusterConfig,
    ClusterOut,
    OverviewOut,
    OverviewStats,
    SystemStatus,
)
from ..services import ai_status
from ..services.clustering import cluster_types
from .alerts import _AlertBuilder

router = APIRouter(tags=["overview"])


@router.get("/overview", response_model=OverviewOut)
async def get_overview(session: AsyncSession = Depends(get_db)) -> OverviewOut:
    now = utcnow()
    today_start = datetime(now.year, now.month, now.day)

    active_signals = (
        await session.execute(
            select(func.count(Cluster.id)).where(
                Cluster.status == "active"
            )
        )
    ).scalar_one()

    reports_today = (
        await session.execute(
            select(func.count(Report.id)).where(Report.created_at >= today_start)
        )
    ).scalar_one()

    high_risk = (
        await session.execute(
            select(func.count(Cluster.id)).where(Cluster.priority == "high")
        )
    ).scalar_one()

    pending_verification = (
        await session.execute(
            select(func.count(Report.id)).where(Report.status == "pending")
        )
    ).scalar_one()

    total_reports = (await session.execute(select(func.count(Report.id)))).scalar_one()

    recent_reports = list(
        (
            await session.execute(
                select(Report).order_by(Report.created_at.desc()).limit(8)
            )
        ).scalars()
    )

    recent_alerts = list(
        (
            await session.execute(
                select(Alert).order_by(Alert.created_at.desc()).limit(6)
            )
        ).scalars()
    )

    clusters = list(
        (
            await session.execute(
                select(Cluster).order_by(Cluster.updated_at.desc()).limit(12)
            )
        ).scalars()
    )

    types = await cluster_types(session, [c.id for c in clusters])
    cluster_outs = []
    for c in clusters:
        out = ClusterOut.model_validate(c)
        out.types = types.get(c.id, [])
        cluster_outs.append(out)

    return OverviewOut(
        stats=OverviewStats(
            active_signals=active_signals,
            reports_today=reports_today,
            high_risk_signals=high_risk,
            pending_verification=pending_verification,
            total_reports=total_reports,
        ),
        recent_reports=recent_reports,
        recent_alerts=recent_alerts,
        clusters=cluster_outs,
    )


@router.get("/system", response_model=SystemStatus)
async def get_system_status() -> SystemStatus:
    db_connected = False
    db_backend = "sqlite" if settings.database_url.startswith("sqlite") else "postgresql"
    try:
        async with engine.connect() as conn:
            await conn.execute(select(func.count()).select_from(Report.__table__))
            db_connected = True
    except Exception:
        db_connected = False

    status = ai_status()
    return SystemStatus(
        app_name=settings.app_name,
        version=settings.version,
        database=db_backend.upper(),
        database_connected=db_connected,
        ai=AIStatus(**status),
    )


@router.get("/config", response_model=ClusterConfig)
async def get_cluster_config() -> ClusterConfig:
    return ClusterConfig(
        radius_km=settings.cluster_radius_km,
        time_window_hours=settings.cluster_time_window_hours,
        min_reports=settings.cluster_min_reports,
        active_hours=settings.cluster_active_hours,
    )