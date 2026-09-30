from pydantic import BaseModel

from .alert import AlertOut
from .cluster import ClusterOut
from .report import ReportOut


class OverviewStats(BaseModel):
    active_signals: int
    reports_today: int
    high_risk_signals: int
    pending_verification: int
    total_reports: int


class OverviewOut(BaseModel):
    stats: OverviewStats
    recent_reports: list[ReportOut]
    recent_alerts: list[AlertOut]
    clusters: list[ClusterOut]


class AIStatus(BaseModel):
    openrouter_configured: bool = False
    openrouter_model: str | None = None
    nvidia_configured: bool = False
    nvidia_model: str | None = None
    whisper_configured: bool = True


class SystemStatus(BaseModel):
    app_name: str
    version: str
    database: str
    database_connected: bool
    whatsapp_connected: bool = False
    whatsapp_status: str = "not_configured"
    ai: AIStatus = AIStatus()


class ClusterConfig(BaseModel):
    radius_km: float
    time_window_hours: int
    min_reports: int
    active_hours: int