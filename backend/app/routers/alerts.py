from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..models import Alert, Cluster
from ..models.enums import AlertStatus
from ..models.report import utcnow
from ..schemas import AlertOut, AlertUpdateStatus


class _AlertBuilder:
    """Builds an AlertOut response, hydrating cluster coordinates."""

    def __init__(self, session: AsyncSession) -> None:
        self._cache: dict[int, Cluster] = {}
        self._session = session

    async def __call__(self, alert: Alert) -> AlertOut:
        out = AlertOut.model_validate(alert)
        cluster = self._cache.get(alert.cluster_id)
        if cluster is None:
            cluster = await self._session.get(Cluster, alert.cluster_id)
            self._cache[alert.cluster_id] = cluster
        if cluster is not None:
            out.cluster_lat = cluster.center_lat
            out.cluster_lng = cluster.center_lng
        return out


router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertOut])
async def list_alerts(
    all_status: str | None = Query(default=None, alias="status"),
    priority: str | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
) -> list[AlertOut]:
    stmt = select(Alert).order_by(Alert.created_at.desc())
    if all_status:
        stmt = stmt.where(Alert.status == all_status)
    if priority:
        stmt = stmt.where(Alert.priority == priority)
    result = await session.execute(stmt)
    alerts = list(result.scalars())
    builder = _AlertBuilder(session)
    return [await builder(a) for a in alerts]


@router.get("/{alert_id}", response_model=AlertOut)
async def get_alert(
    alert_id: int, session: AsyncSession = Depends(get_db)
) -> AlertOut:
    alert = await session.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    return await _AlertBuilder(session)(alert)


@router.patch("/{alert_id}/status", response_model=AlertOut)
async def update_alert_status(
    alert_id: int,
    body: AlertUpdateStatus,
    session: AsyncSession = Depends(get_db),
) -> AlertOut:
    alert = await session.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    current = AlertStatus(alert.status)
    target = body.status
    if target == current:
        pass
    elif target is AlertStatus.ACKNOWLEDGED and current is AlertStatus.RESOLVED:
        raise HTTPException(status_code=400, detail="Resolved alerts cannot be reopened")
    elif target is AlertStatus.NEW:
        raise HTTPException(status_code=400, detail="Alerts cannot be moved back to new")
    else:
        alert.status = target.value
        if target is AlertStatus.ACKNOWLEDGED:
            alert.acknowledged_at = utcnow()
        elif target is AlertStatus.RESOLVED:
            alert.resolved_at = utcnow()

    await session.commit()
    await session.refresh(alert)
    return await _AlertBuilder(session)(alert)