from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..models import Alert, Cluster, Report
from ..services import clear_demo, seed_demo

router = APIRouter(prefix="/demo", tags=["demo"])


class SeedResult(BaseModel):
    seeded: int
    skipped: bool


class ResetResult(BaseModel):
    reports: int
    clusters: int
    alerts: int


@router.post("/seed", response_model=SeedResult)
async def seed(
    force: bool = False, session: AsyncSession = Depends(get_db)
) -> SeedResult:
    """Populate the dashboard with realistic sample reports."""
    result = await seed_demo(session, force=force)
    return SeedResult(**result)


@router.post("/reset", response_model=ResetResult)
async def reset(session: AsyncSession = Depends(get_db)) -> ResetResult:
    """Delete all demo data (reports, clusters, alerts)."""
    counts = ResetResult(
        reports=(await session.execute(select(func.count(Report.id)))).scalar_one(),
        clusters=(await session.execute(select(func.count(Cluster.id)))).scalar_one(),
        alerts=(await session.execute(select(func.count(Alert.id)))).scalar_one(),
    )
    await clear_demo(session)
    return counts