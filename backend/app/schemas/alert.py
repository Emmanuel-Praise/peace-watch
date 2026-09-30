from datetime import datetime

from pydantic import BaseModel, ConfigDict

from ..models.enums import AlertStatus, ClusterPriority

ALERT_STATE_FLOW: dict[AlertStatus, tuple[AlertStatus, ...]] = {
    AlertStatus.NEW: (AlertStatus.ACKNOWLEDGED, AlertStatus.RESOLVED),
    AlertStatus.ACKNOWLEDGED: (AlertStatus.RESOLVED,),
    AlertStatus.RESOLVED: (),
}


class AlertUpdateStatus(BaseModel):
    status: AlertStatus


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cluster_id: int
    priority: ClusterPriority
    title: str
    message: str
    status: AlertStatus
    channel: str
    created_at: datetime
    acknowledged_at: datetime | None = None
    resolved_at: datetime | None = None
    cluster_lat: float = 0.0
    cluster_lng: float = 0.0