from datetime import datetime

from pydantic import BaseModel, Field

from .report import ReportOut


class IngestInput(BaseModel):
    """JSON flavor of the ingestion request (multipart is accepted too)."""

    text: str | None = Field(default=None, max_length=8000)
    anonymous_id: str | None = Field(default=None, min_length=1, max_length=200)
    sent_at: datetime | None = None
    language: str = Field(default="auto", pattern="^(auto|en|fr|pidgin)$")


class IngestOutcome(BaseModel):
    processed: bool = False
    model: str | None = None
    error: str | None = None


class ClusterRef(BaseModel):
    id: int | None = None
    priority: str | None = None
    independent_report_count: int | None = None
    report_count: int | None = None


class IngestResult(BaseModel):
    report: ReportOut
    ai: IngestOutcome
    cluster: ClusterRef | None = None
    source: str
    message: str