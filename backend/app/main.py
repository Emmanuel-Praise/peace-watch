from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from .core.config import settings
from .core.database import Base, engine
from .models import QuarterHead, Report  # noqa: F401  (register tables)
from .routers import api_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="Community early-warning platform API.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # In local dev the dashboard can end up on any port (5173, 5174, 4173,
    # VS Code Live Server 5500, …). allow_origins="*" + no credentials lets
    # every origin through; flip cors_allow_all=False to restrict.
    allow_origins=["*"] if settings.cors_allow_all else settings.cors_origins,
    allow_credentials=not settings.cors_allow_all,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name, "version": settings.version}
