from datetime import datetime

from pydantic import BaseModel, ConfigDict

from ..models.enums import ClusterPriority, ClusterStatus
from .report import ReportOut


class ClusterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    priority: ClusterPriority
    status: ClusterStatus
    center_lat: float
    center_lng: float
    radius_km: float
    report_count: int
    independent_report_count: int = 0
    created_at: datetime
    updated_at: datetime
    last_report_at: datetime
    types: list[str] = []


class ClusterDetail(ClusterOut):
    reports: list[ReportOut] = []


class ClusterUpdateStatus(BaseModel):
    status: ClusterStatus


class ReclusterResult(BaseModel):
    clusters: int
    reports_assigned: int
    created_alerts: int