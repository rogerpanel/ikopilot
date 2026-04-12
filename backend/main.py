"""iKopilot FastAPI application — multi-LLM research assistant for grad students."""

from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import init_db, async_session, User, Subscription, SubscriptionTier, UserRole
from auth import hash_password, router as auth_router
from llm_proxy import router as chat_router
from projects import router as projects_router
from research_modes import router as research_modes_router
from supervisor import router as supervisor_router
from admin import router as admin_router
from file_upload import router as file_upload_router
from history import router as history_router
from scholar import router as scholar_router
from orchestrator import router as orchestrator_router
from humanizer import router as humanizer_router
from cleanup import router as cleanup_router, schedule_cleanup

from sqlalchemy import select


async def seed_admin():
    """Create admin user if it doesn't exist."""
    async with async_session() as db:
        result = await db.execute(select(User).where(User.email == settings.admin_email))
        if not result.scalar_one_or_none():
            admin = User(
                email=settings.admin_email,
                password_hash=hash_password(settings.admin_password),
                full_name="Admin",
                role=UserRole.admin,
                subscription_tier=SubscriptionTier.pro,
                is_active=True,
            )
            db.add(admin)
            await db.flush()

            sub = Subscription(
                user_id=admin.id,
                tier=SubscriptionTier.pro,
                amount_usd=0,
                is_active=True,
            )
            db.add(sub)
            await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_admin()
    # Start background cleanup scheduler (30-day data retention)
    cleanup_task = asyncio.create_task(schedule_cleanup())
    yield
    cleanup_task.cancel()


app = FastAPI(
    title="iKopilot API",
    description="Multi-LLM research assistant for graduate students",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request-scoped user isolation header
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Cache-Control"] = "no-store, private"
    return response


# Routers
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(projects_router)
app.include_router(research_modes_router)
app.include_router(supervisor_router)
app.include_router(admin_router)
app.include_router(file_upload_router)
app.include_router(history_router)
app.include_router(scholar_router)
app.include_router(orchestrator_router)
app.include_router(humanizer_router)
app.include_router(cleanup_router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "ikopilot"}


@app.get("/api/tiers")
async def list_tiers():
    """Public endpoint: available subscription tiers."""
    return {
        tier: {
            "tokens_per_day": info["tokens_per_day"],
            "providers": info["providers"],
            "max_projects": info["max_projects"],
            "file_upload": info["file_upload"],
            "price_usd": info["price_usd"],
        }
        for tier, info in settings.tier_limits.items()
    }
