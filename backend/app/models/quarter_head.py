from datetime import datetime

from sqlalchemy import DateTime, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base
from ..models.report import utcnow


class QuarterHead(Base):
    """
    A community quarter head who receives reports from their area.

    Unlike anonymous reports, a quarter head's WhatsApp number IS stored
    (wa_number) — otherwise the bot could never forward area reports to
    them. Numbers are stored only for heads who explicitly register, and
    only verified heads receive notifications.
    """

    __tablename__ = "quarter_heads"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    wa_number: Mapped[str] = mapped_column(String(30), index=True)
    quarter_name: Mapped[str] = mapped_column(String(150), index=True)
    city: Mapped[str | None] = mapped_column(String(150), nullable=True, index=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    # ID verification docs (photo/document sent over WhatsApp, saved locally).
    id_media_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    id_media_path: Mapped[str | None] = mapped_column(String(300), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
