"""
iKo NoteHub — Zettelkasten-style research knowledge base.

Atomic notes with bidirectional links, tags, and LLM-powered
auto-linking and synthesis. Inspired by Obsidian and Roam Research.
"""

import json
import re
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, Column, Integer, String, Text, DateTime, ForeignKey, JSON, or_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db, User, Base, utcnow
from auth import get_current_user
from litreview import _call_llm

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notehub", tags=["notehub"])


# ---------- Database Models ----------

class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(500), nullable=False)
    content = Column(Text, default="")
    tags = Column(JSON, default=list)
    linked_note_ids = Column(JSON, default=list)
    source = Column(String(500), default="")  # paper DOI, project name, etc.
    note_type = Column(String(50), default="idea")  # idea, literature, method, finding, question
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow)


# ---------- Schemas ----------

class CreateNoteRequest(BaseModel):
    title: str
    content: str = ""
    tags: list[str] = []
    linked_note_ids: list[int] = []
    source: str = ""
    note_type: str = "idea"


class UpdateNoteRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[list[str]] = None
    linked_note_ids: Optional[list[int]] = None
    source: Optional[str] = None
    note_type: Optional[str] = None


class SuggestLinksRequest(BaseModel):
    note_id: int
    provider: str = "deepseek"


class SynthesizeRequest(BaseModel):
    note_ids: list[int]
    provider: str = "deepseek"


class GenerateNotesRequest(BaseModel):
    text: str
    source: str = ""
    provider: str = "deepseek"


# ---------- Endpoints ----------

@router.post("/notes")
async def create_note(
    req: CreateNoteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = Note(
        user_id=user.id, title=req.title, content=req.content,
        tags=req.tags, linked_note_ids=req.linked_note_ids,
        source=req.source, note_type=req.note_type,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)

    # Auto-create bidirectional links
    if req.linked_note_ids:
        for linked_id in req.linked_note_ids:
            result = await db.execute(
                select(Note).where(Note.id == linked_id, Note.user_id == user.id)
            )
            linked = result.scalar_one_or_none()
            if linked:
                existing_links = linked.linked_note_ids or []
                if note.id not in existing_links:
                    existing_links.append(note.id)
                    linked.linked_note_ids = existing_links
        await db.commit()

    return _note_to_dict(note)


@router.get("/notes")
async def list_notes(
    tag: str = "",
    note_type: str = "",
    search: str = "",
    limit: int = Query(50, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Note).where(Note.user_id == user.id)

    if search:
        query = query.where(
            or_(Note.title.ilike(f"%{search}%"), Note.content.ilike(f"%{search}%"))
        )
    if note_type:
        query = query.where(Note.note_type == note_type)

    query = query.order_by(Note.updated_at.desc()).limit(limit)
    result = await db.execute(query)
    notes = result.scalars().all()

    notes_list = [_note_to_dict(n) for n in notes]

    # Filter by tag in Python (JSON column)
    if tag:
        notes_list = [n for n in notes_list if tag.lower() in [t.lower() for t in n.get("tags", [])]]

    return {"notes": notes_list, "total": len(notes_list)}


@router.get("/notes/{note_id}")
async def get_note(note_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Note).where(Note.id == note_id, Note.user_id == user.id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Get linked notes details
    linked = []
    for lid in (note.linked_note_ids or []):
        lr = await db.execute(select(Note).where(Note.id == lid, Note.user_id == user.id))
        ln = lr.scalar_one_or_none()
        if ln:
            linked.append({"id": ln.id, "title": ln.title, "note_type": ln.note_type})

    # Get backlinks (notes that link TO this note)
    all_notes = await db.execute(select(Note).where(Note.user_id == user.id))
    backlinks = []
    for n in all_notes.scalars().all():
        if note_id in (n.linked_note_ids or []):
            backlinks.append({"id": n.id, "title": n.title, "note_type": n.note_type})

    note_dict = _note_to_dict(note)
    note_dict["linked_notes"] = linked
    note_dict["backlinks"] = backlinks
    return note_dict


@router.put("/notes/{note_id}")
async def update_note(note_id: int, req: UpdateNoteRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Note).where(Note.id == note_id, Note.user_id == user.id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    from datetime import datetime, timezone
    updates = req.model_dump(exclude_none=True)
    for key, val in updates.items():
        setattr(note, key, val)
    note.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return _note_to_dict(note)


@router.delete("/notes/{note_id}")
async def delete_note(note_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Note).where(Note.id == note_id, Note.user_id == user.id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.delete(note)
    await db.commit()
    return {"message": "Note deleted"}


@router.post("/suggest-links")
async def suggest_links(req: SuggestLinksRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """LLM suggests which other notes should be linked to this one."""
    result = await db.execute(select(Note).where(Note.id == req.note_id, Note.user_id == user.id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    all_result = await db.execute(select(Note).where(Note.user_id == user.id, Note.id != req.note_id).limit(50))
    all_notes = all_result.scalars().all()
    if not all_notes:
        return {"suggestions": []}

    notes_summary = "\n".join(f"[ID:{n.id}] {n.title}: {n.content[:150]}" for n in all_notes)

    system = (
        "You are a knowledge management assistant. Given a note and a list of other notes, "
        "suggest which notes should be linked because they share concepts, contradict each other, "
        "build on each other, or would benefit from cross-reference.\n\n"
        'Return ONLY valid JSON: [{"id": note_id, "reason": "why they should be linked"}]'
    )
    user_msg = f"Current note [{note.id}]: {note.title}\n{note.content[:500]}\n\nOther notes:\n{notes_summary}"

    try:
        raw = await _call_llm(system, user_msg, req.provider)
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
        cleaned = re.sub(r"\s*```$", "", cleaned)
        suggestions = json.loads(cleaned)
        return {"suggestions": suggestions[:10]}
    except Exception:
        return {"suggestions": []}


@router.post("/synthesize")
async def synthesize_notes(req: SynthesizeRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Generate a synthesis note from multiple linked notes."""
    notes = []
    for nid in req.note_ids:
        result = await db.execute(select(Note).where(Note.id == nid, Note.user_id == user.id))
        note = result.scalar_one_or_none()
        if note:
            notes.append(note)

    if len(notes) < 2:
        raise HTTPException(status_code=400, detail="Select at least 2 notes to synthesize")

    system = (
        "You are a research synthesis expert. Given multiple research notes, "
        "create a synthesis that: connects the ideas, identifies patterns and contradictions, "
        "and suggests new insights or research directions.\n\n"
        "Write in academic prose (3-5 paragraphs). Reference the original notes by their titles."
    )
    notes_text = "\n\n---\n\n".join(f"**{n.title}**\n{n.content}" for n in notes)
    user_msg = f"Synthesize these {len(notes)} notes:\n\n{notes_text}"

    synthesis = await _call_llm(system, user_msg, req.provider)

    # Auto-create a synthesis note
    synth_note = Note(
        user_id=user.id,
        title=f"Synthesis: {', '.join(n.title[:30] for n in notes[:3])}",
        content=synthesis,
        tags=["synthesis"],
        linked_note_ids=req.note_ids,
        note_type="idea",
    )
    db.add(synth_note)
    await db.commit()
    await db.refresh(synth_note)

    return {"synthesis": synthesis, "note_id": synth_note.id, "title": synth_note.title}


@router.post("/generate-from-text")
async def generate_notes_from_text(req: GenerateNotesRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Auto-generate atomic Zettelkasten notes from a paper or text."""
    system = (
        "You are a Zettelkasten note-taking assistant. Extract atomic notes from the given text. "
        "Each note should capture ONE idea, concept, finding, or method.\n\n"
        'Return ONLY valid JSON array:\n'
        '[{"title": "short descriptive title", "content": "1-3 sentences capturing the idea", '
        '"tags": ["tag1", "tag2"], "note_type": "idea|literature|method|finding|question"}]'
        "\n\nGenerate 5-15 atomic notes."
    )

    raw = await _call_llm(system, f"Source: {req.source}\n\nText:\n{req.text[:8000]}", req.provider)
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        notes_data = json.loads(cleaned)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Failed to generate notes")

    created = []
    for nd in notes_data[:15]:
        note = Note(
            user_id=user.id, title=nd.get("title", ""), content=nd.get("content", ""),
            tags=nd.get("tags", []), source=req.source, note_type=nd.get("note_type", "idea"),
        )
        db.add(note)
        created.append(nd)

    await db.commit()
    return {"notes_created": len(created), "notes": created}


@router.get("/graph")
async def get_note_graph(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Return all notes and links as a graph for visualization."""
    result = await db.execute(select(Note).where(Note.user_id == user.id))
    notes = result.scalars().all()

    nodes = [{"id": n.id, "title": n.title, "type": n.note_type, "tags": n.tags or []} for n in notes]
    edges = []
    seen = set()
    for n in notes:
        for lid in (n.linked_note_ids or []):
            key = tuple(sorted([n.id, lid]))
            if key not in seen:
                seen.add(key)
                edges.append({"source": n.id, "target": lid})

    return {"nodes": nodes, "edges": edges}


# ---------- Helpers ----------

def _note_to_dict(note: Note) -> dict:
    return {
        "id": note.id, "title": note.title, "content": note.content,
        "tags": note.tags or [], "linked_note_ids": note.linked_note_ids or [],
        "source": note.source, "note_type": note.note_type,
        "created_at": note.created_at.isoformat() if note.created_at else None,
        "updated_at": note.updated_at.isoformat() if note.updated_at else None,
    }
