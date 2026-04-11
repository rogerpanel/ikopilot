"""Supervisor/mentor dashboard endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, User, Project, Conversation, ApiUsage, UserRole
from auth import get_current_user, require_supervisor

router = APIRouter(prefix="/api/supervisor", tags=["supervisor"])


@router.get("/mentees")
async def list_mentees(
    user: User = Depends(require_supervisor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.supervisor_id == user.id, User.is_active == True)
    )
    mentees = result.scalars().all()

    output = []
    for m in mentees:
        project_count = await db.execute(
            select(func.count(Project.id)).where(Project.user_id == m.id)
        )
        conv_count = await db.execute(
            select(func.count(Conversation.id)).where(Conversation.user_id == m.id)
        )
        output.append({
            "id": m.id,
            "full_name": m.full_name,
            "email": m.email,
            "university": m.university,
            "department": m.department,
            "program": m.program.value if m.program else None,
            "subscription_tier": m.subscription_tier.value,
            "tokens_used_today": m.tokens_used_today,
            "tokens_used_month": m.tokens_used_month,
            "project_count": project_count.scalar() or 0,
            "conversation_count": conv_count.scalar() or 0,
            "last_login": m.last_login.isoformat() if m.last_login else None,
        })

    return output


@router.get("/mentees/{mentee_id}/projects")
async def list_mentee_projects(
    mentee_id: int,
    user: User = Depends(require_supervisor),
    db: AsyncSession = Depends(get_db),
):
    # Verify the mentee belongs to this supervisor
    result = await db.execute(
        select(User).where(User.id == mentee_id, User.supervisor_id == user.id)
    )
    mentee = result.scalar_one_or_none()
    if not mentee:
        raise HTTPException(status_code=404, detail="Mentee not found")

    projects = await db.execute(
        select(Project)
        .where(Project.user_id == mentee_id)
        .order_by(Project.updated_at.desc())
    )

    return [
        {
            "id": p.id,
            "title": p.title,
            "description": p.description,
            "research_field": p.research_field,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        }
        for p in projects.scalars().all()
    ]


@router.get("/mentees/{mentee_id}/usage")
async def get_mentee_usage(
    mentee_id: int,
    user: User = Depends(require_supervisor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(User.id == mentee_id, User.supervisor_id == user.id)
    )
    mentee = result.scalar_one_or_none()
    if not mentee:
        raise HTTPException(status_code=404, detail="Mentee not found")

    usage = await db.execute(
        select(ApiUsage)
        .where(ApiUsage.user_id == mentee_id)
        .order_by(ApiUsage.timestamp.desc())
        .limit(100)
    )

    return {
        "mentee": {
            "id": mentee.id,
            "full_name": mentee.full_name,
            "tokens_used_today": mentee.tokens_used_today,
            "tokens_used_month": mentee.tokens_used_month,
        },
        "recent_usage": [
            {
                "provider": u.provider.value if u.provider else None,
                "model": u.model,
                "tokens_input": u.tokens_input,
                "tokens_output": u.tokens_output,
                "cost_usd": u.cost_usd,
                "timestamp": u.timestamp.isoformat() if u.timestamp else None,
            }
            for u in usage.scalars().all()
        ],
    }
