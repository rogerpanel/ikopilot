"""Research project workspaces."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db, User, Project, Conversation
from auth import get_current_user
from config import settings

router = APIRouter(prefix="/api/projects", tags=["projects"])


# ---------- Schemas ----------

class ProjectCreate(BaseModel):
    title: str
    description: str = ""
    research_field: str = ""
    system_prompt_override: Optional[str] = None


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    research_field: Optional[str] = None
    system_prompt_override: Optional[str] = None


# ---------- Endpoints ----------

@router.get("/")
async def list_projects(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project)
        .where(Project.user_id == user.id)
        .order_by(Project.updated_at.desc())
    )
    projects = result.scalars().all()

    output = []
    for p in projects:
        conv_count = await db.execute(
            select(func.count(Conversation.id)).where(Conversation.project_id == p.id)
        )
        output.append({
            "id": p.id,
            "title": p.title,
            "description": p.description,
            "research_field": p.research_field,
            "conversation_count": conv_count.scalar() or 0,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        })

    return output


@router.post("/")
async def create_project(
    req: ProjectCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tier_info = settings.tier_limits.get(user.subscription_tier.value, {})
    max_projects = tier_info.get("max_projects", 1)

    if max_projects > 0:
        count_result = await db.execute(
            select(func.count(Project.id)).where(Project.user_id == user.id)
        )
        current_count = count_result.scalar() or 0
        if current_count >= max_projects:
            raise HTTPException(
                status_code=403,
                detail=f"Project limit reached ({max_projects}). Upgrade your plan for more.",
            )

    project = Project(
        user_id=user.id,
        title=req.title,
        description=req.description,
        research_field=req.research_field,
        system_prompt_override=req.system_prompt_override,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    return {
        "id": project.id,
        "title": project.title,
        "description": project.description,
        "research_field": project.research_field,
        "created_at": project.created_at.isoformat() if project.created_at else None,
    }


@router.get("/{project_id}")
async def get_project(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return {
        "id": project.id,
        "title": project.title,
        "description": project.description,
        "research_field": project.research_field,
        "system_prompt_override": project.system_prompt_override,
        "context_files_json": project.context_files_json,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
    }


@router.put("/{project_id}")
async def update_project(
    project_id: int,
    req: ProjectUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    updates = req.model_dump(exclude_none=True)
    for key, value in updates.items():
        setattr(project, key, value)

    await db.commit()
    await db.refresh(project)

    return {
        "id": project.id,
        "title": project.title,
        "description": project.description,
        "research_field": project.research_field,
        "system_prompt_override": project.system_prompt_override,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
    }


@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.delete(project)
    await db.commit()
    return {"message": "Project deleted"}
