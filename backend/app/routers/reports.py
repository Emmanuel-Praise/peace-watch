from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..models import Cluster, Report
from ..models.report import utcnow
from ..schemas import ReportCreate, ReportLocationUpdate, ReportOut, ReportUpdateStatus
from ..services.clustering import process_report, refresh_cluster

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
async def create_report(
    body: ReportCreate,
    session: AsyncSession = Depends(get_db),
) -> Report:
    """Create an anonymous incident report and corroborate it against others."""
    report = Report(
        type=body.type.value,
        severity=body.severity.value,
        priority=body.severity.value,
        description=body.description.strip(),
        latitude=body.latitude,
        longitude=body.longitude,
        occurred_at=body.occurred_at or utcnow(),
        status="pending",
        source="manual",
    )
    session.add(report)
    await session.flush()
    await process_report(session, report)
    await session.commit()
    await session.refresh(report)
    return report


@router.get("", response_model=list[ReportOut])
async def list_reports(
    type: str | None = Query(default=None),
    status_: str | None = Query(default=None, alias="status"),
    cluster_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_db),
) -> list[Report]:
    stmt = select(Report).order_by(Report.occurred_at.desc()).limit(limit).offset(offset)
    if type:
        stmt = stmt.where(Report.type == type)
    if status_:
        stmt = stmt.where(Report.status == status_)
    if cluster_id is not None:
        stmt = stmt.where(Report.cluster_id == cluster_id)
    result = await session.execute(stmt)
    return list(result.scalars())


@router.get("/{report_id}", response_model=ReportOut)
async def get_report(
    report_id: int, session: AsyncSession = Depends(get_db)
) -> Report:
    report = await session.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.patch("/{report_id}/status", response_model=ReportOut)
async def update_report_status(
    report_id: int,
    body: ReportUpdateStatus,
    session: AsyncSession = Depends(get_db),
) -> Report:
    report = await session.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    new_status = body.status.value
    if report.status == "dismissed" and new_status != "dismissed":
        raise HTTPException(
            status_code=400, detail="Dismissed reports cannot be reopened"
        )

    report.status = new_status
    await session.flush()

    if report.cluster_id is not None:
        cluster = await session.get(Cluster, report.cluster_id)
        if cluster is not None:
            await refresh_cluster(session, cluster)

    await session.commit()
    await session.refresh(report)
    return report


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: int, session: AsyncSession = Depends(get_db)
) -> None:
    """Remove a report. Available for demo/cleanup purposes only."""
    report = await session.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    await session.delete(report)
    await session.commit()


@router.patch("/{report_id}/location", response_model=ReportOut)
async def update_report_location(
    report_id: int,
    body: ReportLocationUpdate,
    session: AsyncSession = Depends(get_db),
) -> Report:
    """
    Pin or correct a report's location, then re-run corroboration.

    Used by the operator to give an approximate location to voice/WhatsApp
    reports whose coordinates could not be estimated automatically.
    """
    report = await session.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    report.latitude = body.latitude
    report.longitude = body.longitude

    if report.cluster_id is not None:
        cluster = await session.get(Cluster, report.cluster_id)
        if cluster is not None:
            await refresh_cluster(session, cluster)
            report.cluster_id = cluster.id

    await session.flush()
    moved = await process_report(session, report)
    await session.commit()
    await session.refresh(report)
    if moved is not None:
        report.cluster_id = moved.id
    return report