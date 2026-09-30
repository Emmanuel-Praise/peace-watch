from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..models.enums import ReportStatus, ReportType, SeverityLevel

MIN_DESCRIPTION_LENGTH = 5
MAX_DESCRIPTION_LENGTH = 2000


class ReportCreate(BaseModel):
    type: ReportType
    description: str = Field(min_length=MIN_DESCRIPTION_LENGTH, max_length=MAX_DESCRIPTION_LENGTH)
    latitude: float | None = None
    longitude: float | None = None
    severity: SeverityLevel = SeverityLevel.LOW
    occurred_at: datetime | None = None

    @field_validator("latitude")
    @classmethod
    def _validate_latitude(cls, value: float | None) -> float | None:
        if value is None:
            return None
        if not -90 <= value <= 90:
            raise ValueError("latitude must be between -90 and 90")
        return round(value, 6)

    @field_validator("longitude")
    @classmethod
    def _validate_longitude(cls, value: float | None) -> float | None:
        if value is None:
            return None
        if not -180 <= value <= 180:
            raise ValueError("longitude must be between -180 and 180")
        return round(value, 6)

    @field_validator("occurred_at")
    @classmethod
    def _no_future(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return value.astimezone(datetime.UTC).replace(tzinfo=None)


class ReportUpdateStatus(BaseModel):
    status: ReportStatus


class ReportLocationUpdate(BaseModel):
    latitude: float
    longitude: float

    @field_validator("latitude")
    @classmethod
    def _validate_latitude(cls, value: float) -> float:
        if not -90 <= value <= 90:
            raise ValueError("latitude must be between -90 and 90")
        return round(value, 6)

    @field_validator("longitude")
    @classmethod
    def _validate_longitude(cls, value: float) -> float:
        if not -180 <= value <= 180:
            raise ValueError("longitude must be between -180 and 180")
        return round(value, 6)


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: ReportType
    severity: SeverityLevel
    description: str
    latitude: float | None = None
    longitude: float | None = None
    status: ReportStatus
    occurred_at: datetime
    created_at: datetime
    cluster_id: int | None = None

    # Step 2 AI pipeline fields
    transcript: str | None = None
    ai_summary: str | None = None
    details: dict | None = None
    location_name: str | None = None
    priority: str = "low"
    source: str = "manual"
    ai_processed: bool = False
    ai_error: str | None = None
    detected_language: str | None = None
    anonymous_id_sha256: str | None = None