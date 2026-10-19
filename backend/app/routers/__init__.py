from fastapi.routing import APIRouter

from . import quarter_heads, reports, whatsapp

api_router = APIRouter(prefix="/api")
api_router.include_router(reports.router)
api_router.include_router(quarter_heads.router)
api_router.include_router(whatsapp.router)
