import sqlalchemy
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.database import Base, SessionLocal, engine
from .models import Alert, Cluster, Report  # noqa: F401  (register tables)
from .routers import api_router
from .services import seed_demo


def _needs_recreate(sync_conn) -> bool:
    inspector = sqlalchemy.inspect(sync_conn)
    tables = inspector.get_table_names()
    if "reports" not in tables:
        return False
    columns = {col["name"] for col in inspector.get_columns("reports")}
    return "transcript" not in columns


async def init_db() -> None:
    # Developer convenience: if the DB was created by Step 1 (missing the Step 2
    # AI columns), the demo DB is recreated and reseeded. Production deployments
    # should use real migrations instead.
    async with engine.begin() as conn:
        if await conn.run_sync(_needs_recreate):
            await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        await seed_demo(session)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="Community early-warning platform API (Step 2: AI incident processing + corroboration).",
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