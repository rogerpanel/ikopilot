"""Research project workspaces — CRUD, hub, progress tracker, ask-pdf."""

import re
from typing import Optional
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db, User, Project, Conversation
from auth import get_current_user
from config import settings
from file_upload import UPLOAD_DIR, _extract_text_from_file
from llm_proxy import get_api_key, PROVIDER_MODELS
from orchestrator import _call_anthropic, _sessions

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


class AskPdfRequest(BaseModel):
    question: str
    file_id: str


# ---------- Helpers ----------

def _count_citations(text: str) -> int:
    """Count citation-like patterns in text: [Author, Year], (Author, Year), etc."""
    patterns = [
        r'\[[\w\s&.,]+\d{4}\w?\]',       # [Author, 2024]
        r'\([\w\s&.,]+\d{4}\w?\)',         # (Author, 2024)
        r'\\cite\{[^}]+\}',               # \cite{key}
    ]
    total = 0
    for pattern in patterns:
        total += len(re.findall(pattern, text))
    return total


def _count_words(text: str) -> int:
    """Count words in a string."""
    return len(text.split()) if text else 0


def _get_project_files_count(project: Project) -> int:
    """Return number of files attached to a project."""
    return len(project.context_files_json) if project.context_files_json else 0


def _get_project_citation_count(conversations: list) -> int:
    """Count citations across all conversation messages in a project."""
    total = 0
    for conv in conversations:
        msgs = conv.messages_json or []
        for msg in msgs:
            if msg.get("role") == "assistant":
                total += _count_citations(msg.get("content", ""))
    return total


def _has_orchestrator_session(user_id: int) -> bool:
    """Check if the user has any active orchestrator sessions."""
    return any(s.user_id == user_id for s in _sessions.values())


async def _get_project_conversations(db: AsyncSession, project_id: int, user_id: int):
    """Fetch all conversations for a project."""
    result = await db.execute(
        select(Conversation)
        .where(
            Conversation.project_id == project_id,
            Conversation.user_id == user_id,
        )
        .order_by(Conversation.created_at.desc())
    )
    return result.scalars().all()


# ---------- CRUD Endpoints ----------

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

    has_orch = _has_orchestrator_session(user.id)

    output = []
    for p in projects:
        conversations = await _get_project_conversations(db, p.id, user.id)
        conv_count = len(conversations)
        citation_count = _get_project_citation_count(conversations)
        file_count = _get_project_files_count(p)

        output.append({
            "id": p.id,
            "title": p.title,
            "description": p.description,
            "research_field": p.research_field,
            "conversation_count": conv_count,
            "citation_count": citation_count,
            "file_count": file_count,
            "has_orchestrator_session": has_orch,
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

    conversations = await _get_project_conversations(db, project.id, user.id)
    conv_count = len(conversations)
    citation_count = _get_project_citation_count(conversations)
    file_count = _get_project_files_count(project)

    return {
        "id": project.id,
        "title": project.title,
        "description": project.description,
        "research_field": project.research_field,
        "system_prompt_override": project.system_prompt_override,
        "context_files_json": project.context_files_json,
        "conversation_count": conv_count,
        "citation_count": citation_count,
        "file_count": file_count,
        "has_orchestrator_session": _has_orchestrator_session(user.id),
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


# ---------- Hub Endpoint ----------

@router.get("/{project_id}/hub")
async def get_project_hub(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full project hub: project info + conversation count + citation count + file count + progress stats."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    conversations = await _get_project_conversations(db, project.id, user.id)
    conv_count = len(conversations)
    citation_count = _get_project_citation_count(conversations)
    file_count = _get_project_files_count(project)

    # Aggregate word count from all assistant messages
    total_words = 0
    for conv in conversations:
        msgs = conv.messages_json or []
        for msg in msgs:
            if msg.get("role") == "assistant":
                total_words += _count_words(msg.get("content", ""))

    # Check for orchestrator sessions belonging to this user
    user_orch_sessions = [
        s for s in _sessions.values() if s.user_id == user.id
    ]
    stages_completed = set()
    for s in user_orch_sessions:
        stages_completed.update(s.stages_completed)

    completion_percent = int((len(stages_completed) / 8) * 100) if stages_completed else 0

    return {
        "project": {
            "id": project.id,
            "title": project.title,
            "description": project.description,
            "research_field": project.research_field,
            "system_prompt_override": project.system_prompt_override,
            "context_files_json": project.context_files_json,
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        },
        "conversation_count": conv_count,
        "citation_count": citation_count,
        "file_count": file_count,
        "total_words": total_words,
        "stages_completed": sorted(stages_completed),
        "completion_percent": completion_percent,
        "has_orchestrator_session": len(user_orch_sessions) > 0,
    }


# ---------- Conversations Endpoint ----------

@router.get("/{project_id}/conversations")
async def list_project_conversations(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all conversations for this project."""
    # Verify project ownership
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    conversations = await _get_project_conversations(db, project.id, user.id)

    return [
        {
            "id": c.id,
            "title": c.title,
            "provider": c.provider.value if c.provider else None,
            "tokens_input": c.tokens_input,
            "tokens_output": c.tokens_output,
            "cost_usd": c.cost_usd,
            "message_count": len(c.messages_json) if c.messages_json else 0,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in conversations
    ]


# ---------- Progress Tracker ----------

THESIS_CHAPTERS = [
    {"id": "topic", "name": "Introduction"},
    {"id": "literature", "name": "Literature Review"},
    {"id": "methodology", "name": "Research Methodology"},
    {"id": "data_analysis", "name": "Data Analysis & Results"},
    {"id": "discussion", "name": "Discussion"},
    {"id": "conclusion", "name": "Conclusion & Abstract"},
    {"id": "references", "name": "References & Formatting"},
    {"id": "humanize", "name": "Humanize & Polish"},
]


@router.get("/{project_id}/progress")
async def get_progress(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Thesis progress tracker: chapter completion, word counts per section, citation coverage."""
    # Verify project ownership
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    conversations = await _get_project_conversations(db, project.id, user.id)
    file_count = _get_project_files_count(project)
    total_citations = _get_project_citation_count(conversations)

    # Compute total words from all assistant messages in conversations
    total_words = 0
    all_assistant_text = ""
    for conv in conversations:
        msgs = conv.messages_json or []
        for msg in msgs:
            if msg.get("role") == "assistant":
                content = msg.get("content", "")
                total_words += _count_words(content)
                all_assistant_text += content + "\n"

    # Gather orchestrator stages completed for this user
    user_orch_sessions = [
        s for s in _sessions.values() if s.user_id == user.id
    ]
    stages_completed: set[str] = set()
    stage_word_counts: dict[str, int] = {}

    for session in user_orch_sessions:
        stages_completed.update(session.stages_completed)
        for stage_id, output_text in session.stage_outputs.items():
            stage_word_counts[stage_id] = (
                stage_word_counts.get(stage_id, 0) + _count_words(output_text)
            )

    # Build chapter progress
    chapters = []
    for ch in THESIS_CHAPTERS:
        stage_id = ch["id"]
        if stage_id in stages_completed:
            status = "complete"
        elif stage_word_counts.get(stage_id, 0) > 0:
            status = "partial"
        else:
            status = "not_started"

        word_count = stage_word_counts.get(stage_id, 0)
        chapters.append({
            "name": ch["name"],
            "stage_id": stage_id,
            "status": status,
            "word_count": word_count,
        })

    completed_count = sum(1 for ch in chapters if ch["status"] == "complete")
    completion_percent = int((completed_count / len(THESIS_CHAPTERS)) * 100)

    return {
        "chapters": chapters,
        "total_words": total_words + sum(stage_word_counts.values()),
        "total_citations": total_citations,
        "total_files": file_count,
        "total_conversations": len(conversations),
        "completion_percent": completion_percent,
    }


# ---------- Ask PDF ----------

@router.post("/{project_id}/ask-pdf")
async def ask_pdf(
    project_id: int,
    req: AskPdfRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ask a question about a specific uploaded PDF/file. Extracts full text and sends to Claude."""
    # Verify project ownership
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Find file in project's context_files_json
    files_list = project.context_files_json or []
    file_entry = next((f for f in files_list if f["id"] == req.file_id), None)
    if not file_entry:
        raise HTTPException(status_code=404, detail="File not found in this project")

    # Build file path and extract full text
    file_path = UPLOAD_DIR / str(user.id) / file_entry["stored_name"]
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    text = _extract_text_from_file(file_path, "")
    if not text or text.startswith("["):
        raise HTTPException(
            status_code=422,
            detail="Could not extract text from this file. Ensure it is a readable PDF, DOCX, or text file.",
        )

    # Send to Claude with the question
    system_prompt = (
        "You are analyzing an academic paper. Answer based ONLY on the paper content. "
        "If the answer is not in the paper, say so. Be precise, cite specific sections or "
        "page references when possible, and use academic language."
    )
    user_message = f"Paper content:\n{text}\n\nQuestion: {req.question}"

    api_key = get_api_key("claude")
    model = PROVIDER_MODELS["claude"]

    answer = await _call_anthropic(system_prompt, user_message, api_key, model)

    return {
        "answer": answer,
        "file_id": req.file_id,
        "file_name": file_entry.get("name", ""),
        "question": req.question,
        "text_length": len(text),
        "model": model,
    }
