from fastapi.routing import APIRouter

from . import alerts, clusters, demo, ingest, overview, reports

api_router = APIRouter(prefix="/api")
api_router.include_router(overview.router)
api_router.include_router(reports.router)
api_router.include_router(clusters.router)
api_router.include_router(alerts.router)
api_router.include_router(ingest.router)
api_router.include_router(demo.router)