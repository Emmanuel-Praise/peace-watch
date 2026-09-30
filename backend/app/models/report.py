from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from ..core.database import Base


def utcnow() -> datetime:
    """Timezone-aware UTC timestamp normalized to naive for portable storage."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# Portable JSON that works on both SQLite and PostgreSQL.
JSONType = SQLiteJSON().with_variant(JSON(), "postgresql")


class Report(Base):
    """
    An anonymous incident report.

    Deliberately stores NO phone numbers, names, emails or other personal
    identifiers. Text coming from WhatsApp / voice / free text is scrubbed
    by services.sanitize before it reaches this table.
    """

    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(50), index=True)
    severity: Mapped[str] = mapped_column(String(20), index=True)
    description: Mapped[str] = mapped_column(Text)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default="pending", index=True
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    # --- Step 2: AI pipeline fields ---
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    details: Mapped[dict | None] = mapped_column(
        MutableDict.as_mutable(JSONType), nullable=True
    )
    location_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    priority: Mapped[str] = mapped_column(
        String(20), default="low", index=True
    )
    source: Mapped[str] = mapped_column(String(30), default="manual")
    anonymous_id_sha256: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    ai_processed: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    detected_language: Mapped[str | None] = mapped_column(String(10), nullable=True)

    cluster_id: Mapped[int | None] = mapped_column(
        ForeignKey("clusters.id", ondelete="SET NULL"), nullable=True, index=True
    )
    cluster: Mapped["Cluster | None"] = relationship(back_populates="reports")