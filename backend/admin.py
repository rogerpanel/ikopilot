"""Admin panel endpoints — user management, usage tracking, billing overview."""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import (
    get_db, User, Subscription, ApiUsage, Payment, Conversation,
    SubscriptionTier, UserRole,
)
from auth import require_admin, hash_password
from config import settings

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------- Schemas ----------

class UpdateUserRequest(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[str] = None
    subscription_tier: Optional[str] = None


class CreateUserRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "student"
    subscription_tier: str = "free"


# ---------- Dashboard ----------

@router.get("/dashboard")
async def admin_dashboard(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # User counts
    total_users = await db.execute(select(func.count(User.id)))
    active_users = await db.execute(
        select(func.count(User.id)).where(User.is_active == True)
    )

    # Users by tier
    tier_counts = {}
    for tier in SubscriptionTier:
        count = await db.execute(
            select(func.count(User.id)).where(User.subscription_tier == tier)
        )
        tier_counts[tier.value] = count.scalar() or 0

    # Today's usage
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_usage = await db.execute(
        select(
            func.sum(ApiUsage.tokens_input),
            func.sum(ApiUsage.tokens_output),
            func.sum(ApiUsage.cost_usd),
        ).where(ApiUsage.timestamp >= today_start)
    )
    usage_row = today_usage.one()

    # This month's cost
    month_start = today_start.replace(day=1)
    month_cost = await db.execute(
        select(func.sum(ApiUsage.cost_usd)).where(ApiUsage.timestamp >= month_start)
    )

    # Recent signups
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    new_users_week = await db.execute(
        select(func.count(User.id)).where(User.created_at >= week_ago)
    )

    return {
        "total_users": total_users.scalar() or 0,
        "active_users": active_users.scalar() or 0,
        "new_users_this_week": new_users_week.scalar() or 0,
        "users_by_tier": tier_counts,
        "today": {
            "tokens_input": usage_row[0] or 0,
            "tokens_output": usage_row[1] or 0,
            "cost_usd": round(usage_row[2] or 0, 4),
        },
        "month_cost_usd": round((month_cost.scalar() or 0), 4),
    }


# ---------- User management ----------

@router.get("/users")
async def list_users(
    search: Optional[str] = Query(None),
    tier: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(User).order_by(User.created_at.desc())

    if search:
        query = query.where(
            User.email.ilike(f"%{search}%") | User.full_name.ilike(f"%{search}%")
        )
    if tier:
        query = query.where(User.subscription_tier == SubscriptionTier(tier))
    if role:
        query = query.where(User.role == UserRole(role))

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()

    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "university": u.university,
            "role": u.role.value,
            "subscription_tier": u.subscription_tier.value,
            "tokens_used_today": u.tokens_used_today,
            "tokens_used_month": u.tokens_used_month,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_login": u.last_login.isoformat() if u.last_login else None,
        }
        for u in users
    ]


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    req: UpdateUserRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    updates = {}
    if req.is_active is not None:
        updates["is_active"] = req.is_active
    if req.role:
        updates["role"] = UserRole(req.role)
    if req.subscription_tier:
        updates["subscription_tier"] = SubscriptionTier(req.subscription_tier)

    if updates:
        await db.execute(update(User).where(User.id == user_id).values(**updates))
        await db.commit()

    return {"message": "User updated"}


@router.post("/users")
async def create_user(
    req: CreateUserRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already exists")

    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        full_name=req.full_name,
        role=UserRole(req.role),
        subscription_tier=SubscriptionTier(req.subscription_tier),
    )
    db.add(user)
    await db.commit()
    return {"message": "User created", "id": user.id}


# ---------- Usage analytics ----------

@router.get("/usage")
async def usage_analytics(
    days: int = Query(30, le=90),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Per-provider breakdown
    provider_stats = await db.execute(
        select(
            ApiUsage.provider,
            func.count(ApiUsage.id),
            func.sum(ApiUsage.tokens_input),
            func.sum(ApiUsage.tokens_output),
            func.sum(ApiUsage.cost_usd),
        )
        .where(ApiUsage.timestamp >= since)
        .group_by(ApiUsage.provider)
    )

    providers = []
    for row in provider_stats.all():
        providers.append({
            "provider": row[0].value if row[0] else "unknown",
            "requests": row[1] or 0,
            "tokens_input": row[2] or 0,
            "tokens_output": row[3] or 0,
            "cost_usd": round(row[4] or 0, 4),
        })

    # Top users by cost
    top_users = await db.execute(
        select(
            ApiUsage.user_id,
            User.email,
            User.full_name,
            func.sum(ApiUsage.cost_usd).label("total_cost"),
            func.sum(ApiUsage.tokens_input + ApiUsage.tokens_output).label("total_tokens"),
        )
        .join(User, User.id == ApiUsage.user_id)
        .where(ApiUsage.timestamp >= since)
        .group_by(ApiUsage.user_id, User.email, User.full_name)
        .order_by(func.sum(ApiUsage.cost_usd).desc())
        .limit(20)
    )

    return {
        "period_days": days,
        "by_provider": providers,
        "top_users": [
            {
                "user_id": row[0],
                "email": row[1],
                "full_name": row[2],
                "cost_usd": round(row[3] or 0, 4),
                "total_tokens": row[4] or 0,
            }
            for row in top_users.all()
        ],
    }


@router.post("/reset-daily-tokens")
async def reset_daily_tokens(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reset all users' daily token counters. Run via cron at midnight UTC."""
    await db.execute(update(User).values(tokens_used_today=0))
    await db.commit()
    return {"message": "Daily token counters reset"}


@router.post("/reset-monthly-tokens")
async def reset_monthly_tokens(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reset all users' monthly token counters. Run via cron on 1st of month."""
    await db.execute(update(User).values(tokens_used_month=0))
    await db.commit()
    return {"message": "Monthly token counters reset"}
