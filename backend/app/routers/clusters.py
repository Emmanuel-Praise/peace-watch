from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..core.database import get_db
from ..models import Cluster
from ..schemas import ClusterDetail, ClusterOut, ReclusterResult
from ..services.clustering import cluster_types, recompute_all

router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.get("", response_model=list[ClusterOut])
async def list_clusters(
    active: bool | None = Query(default=None),
    priority: str | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
) -> list[ClusterOut]:
    stmt = select(Cluster).order_by(Cluster.updated_at.desc())
    if active is not None:
        stmt = stmt.where(Cluster.status == ("active" if active else "monitoring"))
    if priority:
        stmt = stmt.where(Cluster.priority == priority)
    result = await session.execute(stmt)
    clusters = list(result.scalars())

    types = await cluster_types(session, [c.id for c in clusters])
    outs = []
    for c in clusters:
        out = ClusterOut.model_validate(c)
        out.types = types.get(c.id, [])
        outs.append(out)
    return outs


@router.get("/{cluster_id}", response_model=ClusterDetail)
async def get_cluster(
    cluster_id: int, session: AsyncSession = Depends(get_db)
) -> ClusterDetail:
    result = await session.execute(
        select(Cluster)
        .options(selectinload(Cluster.reports))
        .where(Cluster.id == cluster_id)
    )
    cluster = result.scalar_one_or_none()
    if cluster is None:
        raise HTTPException(status_code=404, detail="Cluster not found")
    detail = ClusterDetail.model_validate(cluster)
    detail.types = [r.type for r in cluster.reports]
    return detail


@router.post("/recompute", response_model=ReclusterResult)
async def recompute_clusters(
    session: AsyncSession = Depends(get_db),
) -> ReclusterResult:
    """Re-run corroboration over all unclustered reports and refresh clusters."""
    result = await recompute_all(session)
    return ReclusterResult(**result)