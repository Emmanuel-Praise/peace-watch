from datetime import datetime

from pydantic import BaseModel, Field


class QuarterHeadOut(BaseModel):
    id: int
    name: str
    # Masked for privacy on list views (last 3 digits only); full number is
    # used internally for notifications.
    wa_number_masked: str = ""
    quarter_name: str
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    has_id_document: bool = False
    notes: str | None = None
    status: str = "pending"
    created_at: datetime
    verified_at: datetime | None = None

    model_config = {"from_attributes": True}


class QuarterHeadCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    wa_number: str = Field(min_length=5, max_length=30)
    quarter_name: str = Field(min_length=2, max_length=150)
    city: str | None = Field(default=None, max_length=150)
    latitude: float | None = None
    longitude: float | None = None
    notes: str | None = None


class QuarterHeadStatusUpdate(BaseModel):
    status: str = Field(pattern="^(pending|verified|rejected)$")
