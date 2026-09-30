from datetime import datetime

from sqlalchemy import DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.database import Base
from .report import utcnow


class Cluster(Base):
    """
    A corroborated group of similar reports (same area + overlapping time).

    Priority is computed from report count and severity. Nothing is ever
    marked "confirmed" automatically.
    """

    __tablename__ = "clusters"

    id: Mapped[int] = mapped_column(primary_key=True)
    priority: Mapped[str] = mapped_column(String(20), default="low", index=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    center_lat: Mapped[float] = mapped_column(Float)
    center_lng: Mapped[float] = mapped_column(Float)
    radius_km: Mapped[float] = mapped_column(Float, default=0.0)
    report_count: Mapped[int] = mapped_column(default=0)
    independent_report_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    last_report_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    reports: Mapped[list["Report"]] = relationship(back_populates="cluster")
    alerts: Mapped[list["Alert"]] = relationship(
        back_populates="cluster", cascade="all, delete-orphan"
    )