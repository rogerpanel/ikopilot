"""
iKo QualCoder — Qualitative data analysis platform.

Upload interview transcripts or open-ended survey responses.
LLM auto-codes themes, supports manual coding, generates codebooks
and thematic maps. Inspired by ATLAS.ti and NVivo.
"""

import json
import re
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db, User, Base, utcnow
from auth import get_current_user
from litreview import _call_llm

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/qualcoder", tags=["qualcoder"])


# ---------- Database Models ----------

class QualProject(Base):
    __tablename__ = "qual_projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, default="")
    documents = Column(JSON, default=list)  # [{id, name, text, segments}]
    codebook = Column(JSON, default=list)   # [{id, code, description, color, parent_id}]
    coded_segments = Column(JSON, default=list)  # [{id, doc_id, start, end, text, code_ids}]
    themes = Column(JSON, default=list)     # [{id, name, description, code_ids}]
    created_at = Column(DateTime(timezone=True), default=utcnow)


# ---------- Schemas ----------

class CreateProjectRequest(BaseModel):
    title: str
    description: str = ""


class AutoCodeRequest(BaseModel):
    project_id: int
    doc_id: int = 0
    approach: str = "inductive"  # inductive, deductive, hybrid
    existing_codes: list[str] = []
    provider: str = "deepseek"


class ManualCodeRequest(BaseModel):
    project_id: int
    doc_id: int
    start: int
    end: int
    text: str
    code_ids: list[int] = []


class AddCodeRequest(BaseModel):
    project_id: int
    code: str
    description: str = ""
    color: str = "#F97316"
    parent_id: int | None = None


class GenerateThemesRequest(BaseModel):
    project_id: int
    provider: str = "deepseek"


# ---------- Endpoints ----------

@router.post("/projects")
async def create_project(
    req: CreateProjectRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = QualProject(user_id=user.id, title=req.title, description=req.description)
    db.add(proj)
    await db.commit()
    await db.refresh(proj)
    return {"id": proj.id, "title": proj.title}


@router.get("/projects")
async def list_projects(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(QualProject).where(QualProject.user_id == user.id))
    projects = result.scalars().all()
    return [{"id": p.id, "title": p.title, "description": p.description,
             "doc_count": len(p.documents or []), "code_count": len(p.codebook or []),
             "segment_count": len(p.coded_segments or [])} for p in projects]


@router.post("/projects/{project_id}/upload")
async def upload_document(
    project_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload an interview transcript or text document."""
    result = await db.execute(select(QualProject).where(QualProject.id == project_id, QualProject.user_id == user.id))
    proj = result.scalar_one_or_none()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    data = await file.read()
    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename else ""

    if ext == "pdf":
        import fitz
        doc = fitz.open(stream=data, filetype="pdf")
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
    elif ext in ("docx",):
        from docx import Document
        import io
        doc = Document(io.BytesIO(data))
        text = "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
    else:
        text = data.decode("utf-8", errors="replace")

    documents = proj.documents or []
    doc_id = len(documents) + 1
    documents.append({"id": doc_id, "name": file.filename, "text": text[:100000]})
    proj.documents = documents
    await db.commit()

    return {"doc_id": doc_id, "name": file.filename, "word_count": len(text.split()), "preview": text[:500]}


@router.post("/auto-code")
async def auto_code(
    req: AutoCodeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """LLM auto-codes a document with thematic codes."""
    result = await db.execute(select(QualProject).where(QualProject.id == req.project_id, QualProject.user_id == user.id))
    proj = result.scalar_one_or_none()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    documents = proj.documents or []
    if req.doc_id:
        doc = next((d for d in documents if d["id"] == req.doc_id), None)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        text = doc["text"]
    else:
        text = "\n---\n".join(d["text"][:5000] for d in documents[:5])

    approach_prompts = {
        "inductive": "Use inductive coding: let themes emerge from the data. Do NOT use predefined codes.",
        "deductive": f"Use deductive coding with these predefined codes: {', '.join(req.existing_codes)}. Apply only these codes to the text.",
        "hybrid": f"Start with these codes if relevant: {', '.join(req.existing_codes)}. Also discover new codes from the data.",
    }

    system = (
        "You are a qualitative research analyst performing thematic coding. "
        f"{approach_prompts.get(req.approach, approach_prompts['inductive'])}\n\n"
        "Analyze the text and identify coded segments. Return ONLY valid JSON:\n"
        "{\n"
        '  "codes": [{"code": "theme name", "description": "what this code means", "color": "#hex"}],\n'
        '  "coded_segments": [\n'
        '    {"text": "exact quoted text from document", "codes": ["theme name"], "memo": "analyst note"}\n'
        "  ]\n"
        "}\n\n"
        "Use 5-15 codes. Each segment should be a meaningful quote (1-3 sentences). "
        "Include at least 10 coded segments."
    )

    raw = await _call_llm(system, f"Code this transcript:\n\n{text[:8000]}", req.provider)
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        result_data = json.loads(cleaned)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Failed to parse coding results")

    # Merge new codes into codebook
    codebook = proj.codebook or []
    existing_names = {c["code"].lower() for c in codebook}
    new_codes = result_data.get("codes", [])
    for nc in new_codes:
        if nc["code"].lower() not in existing_names:
            codebook.append({
                "id": len(codebook) + 1,
                "code": nc["code"],
                "description": nc.get("description", ""),
                "color": nc.get("color", "#F97316"),
                "parent_id": None,
            })
            existing_names.add(nc["code"].lower())
    proj.codebook = codebook

    # Store coded segments
    segments = proj.coded_segments or []
    for seg in result_data.get("coded_segments", []):
        segments.append({
            "id": len(segments) + 1,
            "doc_id": req.doc_id or 0,
            "text": seg.get("text", ""),
            "codes": seg.get("codes", []),
            "memo": seg.get("memo", ""),
        })
    proj.coded_segments = segments

    await db.commit()

    return {
        "codes_found": len(new_codes),
        "segments_coded": len(result_data.get("coded_segments", [])),
        "total_codes": len(codebook),
        "total_segments": len(segments),
        "codes": new_codes,
    }


@router.post("/add-code")
async def add_code(
    req: AddCodeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(QualProject).where(QualProject.id == req.project_id, QualProject.user_id == user.id))
    proj = result.scalar_one_or_none()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    codebook = proj.codebook or []
    new_code = {"id": len(codebook) + 1, "code": req.code, "description": req.description,
                "color": req.color, "parent_id": req.parent_id}
    codebook.append(new_code)
    proj.codebook = codebook
    await db.commit()
    return new_code


@router.post("/manual-code")
async def manual_code(
    req: ManualCodeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(QualProject).where(QualProject.id == req.project_id, QualProject.user_id == user.id))
    proj = result.scalar_one_or_none()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    segments = proj.coded_segments or []
    segment = {"id": len(segments) + 1, "doc_id": req.doc_id, "start": req.start, "end": req.end,
               "text": req.text, "code_ids": req.code_ids, "memo": ""}
    segments.append(segment)
    proj.coded_segments = segments
    await db.commit()
    return segment


@router.post("/generate-themes")
async def generate_themes(
    req: GenerateThemesRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate thematic map from coded data."""
    result = await db.execute(select(QualProject).where(QualProject.id == req.project_id, QualProject.user_id == user.id))
    proj = result.scalar_one_or_none()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    codebook = proj.codebook or []
    segments = proj.coded_segments or []

    if not codebook or not segments:
        raise HTTPException(status_code=400, detail="Need codes and coded segments first")

    # Build code frequency table
    code_freq = {}
    for seg in segments:
        for code in seg.get("codes", []):
            code_freq[code] = code_freq.get(code, 0) + 1

    system = (
        "You are a qualitative research methodologist. Given the codebook and coded segments, "
        "generate a thematic analysis. Return ONLY valid JSON:\n"
        "{\n"
        '  "themes": [\n'
        '    {"name": "Theme name", "description": "What this theme captures", '
        '"codes": ["code1", "code2"], "example_quotes": ["quote1", "quote2"]}\n'
        '  ],\n'
        '  "thematic_map_description": "Narrative description of how themes relate",\n'
        '  "saturation_assessment": "Whether data saturation appears reached and why"\n'
        "}"
    )

    code_summary = "\n".join(f"- {c['code']}: {c.get('description', '')} (used {code_freq.get(c['code'], 0)} times)" for c in codebook)
    seg_summary = "\n".join(f'- [{", ".join(s.get("codes", []))}]: "{s["text"][:200]}"' for s in segments[:30])

    user_msg = f"Codebook:\n{code_summary}\n\nCoded segments (sample):\n{seg_summary}\n\nGenerate themes."

    raw = await _call_llm(system, user_msg, req.provider)
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        themes_data = json.loads(cleaned)
    except json.JSONDecodeError:
        themes_data = {"themes": [], "thematic_map_description": raw[:500]}

    proj.themes = themes_data.get("themes", [])
    await db.commit()

    return {
        "themes": themes_data.get("themes", []),
        "thematic_map": themes_data.get("thematic_map_description", ""),
        "saturation": themes_data.get("saturation_assessment", ""),
        "code_frequencies": code_freq,
    }


@router.get("/projects/{project_id}")
async def get_project_detail(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(QualProject).where(QualProject.id == project_id, QualProject.user_id == user.id))
    proj = result.scalar_one_or_none()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    return {
        "id": proj.id, "title": proj.title, "description": proj.description,
        "documents": [{"id": d["id"], "name": d["name"], "word_count": len(d.get("text", "").split()),
                       "preview": d.get("text", "")[:300]} for d in (proj.documents or [])],
        "codebook": proj.codebook or [],
        "coded_segments": proj.coded_segments or [],
        "themes": proj.themes or [],
    }
