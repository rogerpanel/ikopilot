"""
iKo Literature Review — Automated literature review generator.

Flow:
1. User enters a research topic
2. LLM suggests 2-3 sub-topic breakdowns
3. Papers are searched per breakdown via OpenAlex/Semantic Scholar/CrossRef
4. User selects papers and sets specifications
5. LLM generates a structured literature review
6. Export to PDF, DOCX, or LaTeX
"""

import json
import re
import io
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, Response
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import httpx

from database import get_db, User, ApiUsage, LLMProvider
from auth import get_current_user
from config import settings
from llm_proxy import get_api_key, PROVIDER_MODELS
from scholar import _search_openalex, _search_semantic_scholar, _search_crossref

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/litreview", tags=["litreview"])


# ---------- Schemas ----------

class BreakdownRequest(BaseModel):
    topic: str
    provider: str = "deepseek"


class PaperSearchRequest(BaseModel):
    query: str
    source: str = "openalex"
    limit: int = 15


class SelectedPaper(BaseModel):
    id: str
    title: str
    authors: list[str]
    year: int | None = None
    abstract: str = ""
    doi: str | None = None
    url: str = ""
    journal: str = ""
    citation_count: int = 0
    pdf_url: str | None = None
    breakdown: str = ""


class ReviewSpecs(BaseModel):
    num_pages: int = 5
    citation_style: str = "apa"  # apa | ieee | harvard
    exclude_sections: list[str] = []
    additional_instructions: str = ""
    language: str = "English"


class GenerateRequest(BaseModel):
    topic: str
    papers: list[SelectedPaper]
    specs: ReviewSpecs
    provider: str = "deepseek"


class ExportRequest(BaseModel):
    title: str
    content: str
    references: list[dict] = []
    format: str = "pdf"  # pdf | docx | latex


# ---------- LLM Helpers ----------

async def _call_llm(system: str, user_msg: str, provider: str, max_tokens: int = 4096) -> str:
    api_key = get_api_key(provider)
    model = PROVIDER_MODELS.get(provider, "deepseek-chat")

    if provider == "claude":
        return await _call_anthropic(system, user_msg, api_key, model, max_tokens)
    elif provider == "gemini":
        return await _call_gemini(system, user_msg, api_key, model, max_tokens)
    else:
        return await _call_openai_compat(system, user_msg, api_key, model, provider, max_tokens)


async def _call_anthropic(system: str, user_msg: str, api_key: str, model: str, max_tokens: int) -> str:
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user_msg}],
    }
    async with httpx.AsyncClient(timeout=180) as client:
        res = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=payload,
        )
        if res.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Claude error: {res.text[:300]}")
        data = res.json()
        return data.get("content", [{}])[0].get("text", "")


async def _call_openai_compat(
    system: str, user_msg: str, api_key: str, model: str, provider: str, max_tokens: int
) -> str:
    if provider == "deepseek":
        url = "https://api.deepseek.com/chat/completions"
    else:
        url = "https://api.openai.com/v1/chat/completions"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=180) as client:
        res = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if res.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Provider error: {res.text[:300]}")
        data = res.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")


async def _call_gemini(system: str, user_msg: str, api_key: str, model: str, max_tokens: int) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": user_msg}]}],
        "systemInstruction": {"parts": [{"text": system}]},
        "generationConfig": {"maxOutputTokens": max_tokens},
    }
    async with httpx.AsyncClient(timeout=180) as client:
        res = await client.post(url, params={"key": api_key}, json=payload)
        if res.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Gemini error: {res.text[:300]}")
        data = res.json()
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            return parts[0].get("text", "") if parts else ""
        return ""


# ---------- Streaming LLM for review generation ----------

async def _stream_llm(system: str, user_msg: str, provider: str, max_tokens: int = 8192):
    """Yield text chunks from LLM for SSE streaming."""
    api_key = get_api_key(provider)
    model = PROVIDER_MODELS.get(provider, "deepseek-chat")

    if provider == "claude":
        async for chunk in _stream_anthropic(system, user_msg, api_key, model, max_tokens):
            yield chunk
    elif provider == "gemini":
        # Gemini streaming is complex; fall back to non-streaming
        result = await _call_gemini(system, user_msg, api_key, model, max_tokens)
        yield result
    else:
        async for chunk in _stream_openai_compat(system, user_msg, api_key, model, provider, max_tokens):
            yield chunk


async def _stream_anthropic(system: str, user_msg: str, api_key: str, model: str, max_tokens: int):
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user_msg}],
        "stream": True,
    }
    async with httpx.AsyncClient(timeout=180) as client:
        async with client.stream(
            "POST", "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=payload,
        ) as response:
            if response.status_code != 200:
                body = await response.aread()
                raise HTTPException(status_code=502, detail=f"Claude error: {body.decode()[:300]}")
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    break
                try:
                    event = json.loads(data)
                except json.JSONDecodeError:
                    continue
                if event.get("type") == "content_block_delta":
                    text = event.get("delta", {}).get("text", "")
                    if text:
                        yield text


async def _stream_openai_compat(system: str, user_msg: str, api_key: str, model: str, provider: str, max_tokens: int):
    if provider == "deepseek":
        url = "https://api.deepseek.com/chat/completions"
    else:
        url = "https://api.openai.com/v1/chat/completions"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
        "max_tokens": max_tokens,
        "stream": True,
    }
    async with httpx.AsyncClient(timeout=180) as client:
        async with client.stream(
            "POST", url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        ) as response:
            if response.status_code != 200:
                body = await response.aread()
                raise HTTPException(status_code=502, detail=f"Provider error: {body.decode()[:300]}")
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    break
                try:
                    event = json.loads(data)
                except json.JSONDecodeError:
                    continue
                choices = event.get("choices", [])
                if choices:
                    text = choices[0].get("delta", {}).get("content", "")
                    if text:
                        yield text


# ---------- PDF URL helpers ----------

async def _get_pdf_url_unpaywall(doi: str) -> str | None:
    """Try to get open-access PDF URL from Unpaywall."""
    if not doi:
        return None
    url = f"https://api.unpaywall.org/v2/{doi}"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            res = await client.get(url, params={"email": "admin@ikopilot.com"})
            if res.status_code == 200:
                data = res.json()
                best = data.get("best_oa_location")
                if best and best.get("url_for_pdf"):
                    return best["url_for_pdf"]
                # Try other OA locations
                for loc in data.get("oa_locations", []):
                    if loc.get("url_for_pdf"):
                        return loc["url_for_pdf"]
    except Exception:
        pass
    return None


async def _get_pdf_url_semantic_scholar(paper_id: str) -> str | None:
    """Try to get PDF URL from Semantic Scholar."""
    try:
        url = f"https://api.semanticscholar.org/graph/v1/paper/{paper_id}"
        async with httpx.AsyncClient(timeout=8) as client:
            res = await client.get(url, params={"fields": "openAccessPdf"})
            if res.status_code == 200:
                data = res.json()
                oa_pdf = data.get("openAccessPdf")
                if oa_pdf and oa_pdf.get("url"):
                    return oa_pdf["url"]
    except Exception:
        pass
    return None


async def _enrich_paper_pdf(paper: dict) -> dict:
    """Try to find a PDF URL for a paper."""
    doi = paper.get("doi")
    pdf_url = await _get_pdf_url_unpaywall(doi)
    if not pdf_url:
        paper_id = paper.get("id", "")
        if paper_id and not paper_id.startswith("http"):
            pdf_url = await _get_pdf_url_semantic_scholar(paper_id)
    paper["pdf_url"] = pdf_url
    return paper


# ---------- Endpoints ----------

@router.post("/breakdowns")
async def suggest_breakdowns(
    req: BreakdownRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Suggest 2-3 sub-topic breakdowns for a research topic."""
    system = (
        "You are an academic research advisor specializing in literature reviews. "
        "Given a research topic, suggest exactly 3 focused sub-topic breakdowns that together "
        "would form a comprehensive literature review. Each breakdown should represent a "
        "distinct thematic area of the topic.\n\n"
        "Respond ONLY in valid JSON format with this structure:\n"
        '{"breakdowns": [\n'
        '  {"title": "Sub-topic title", "description": "Brief description of what this section covers", '
        '"search_query": "optimized search query for finding papers on this sub-topic"},\n'
        "  ...\n"
        "]}\n\n"
        "The search_query should be an effective academic search query (5-10 words) "
        "for finding relevant papers on that sub-topic. Do NOT include any text outside the JSON."
    )

    user_msg = f"Research topic: {req.topic}\n\nSuggest 3 sub-topic breakdowns for a literature review."

    response = await _call_llm(system, user_msg, req.provider)

    # Parse JSON from response
    try:
        # Strip markdown code fences if present
        cleaned = response.strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        data = json.loads(cleaned)
        breakdowns = data.get("breakdowns", [])
    except (json.JSONDecodeError, KeyError):
        # Fallback: try to extract JSON from the response
        match = re.search(r"\{.*\}", response, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group())
                breakdowns = data.get("breakdowns", [])
            except json.JSONDecodeError:
                raise HTTPException(status_code=500, detail="Failed to parse breakdown suggestions")
        else:
            raise HTTPException(status_code=500, detail="Failed to parse breakdown suggestions")

    return {"breakdowns": breakdowns[:3]}


@router.post("/search")
async def search_papers(
    req: PaperSearchRequest,
    user: User = Depends(get_current_user),
):
    """Search for papers and try to find open-access PDF URLs."""
    if req.source == "openalex":
        papers = await _search_openalex(req.query, req.limit)
    elif req.source == "semanticscholar":
        papers = await _search_semantic_scholar(req.query, req.limit)
    else:
        papers = await _search_crossref(req.query, req.limit)

    # Enrich top papers with PDF URLs (batch, limit to 5 for speed)
    enriched = []
    for i, paper in enumerate(papers):
        if i < 5:
            paper = await _enrich_paper_pdf(paper)
        else:
            paper["pdf_url"] = None
        enriched.append(paper)

    return {"papers": enriched}


@router.post("/pdf-url")
async def get_paper_pdf(
    paper_id: str = "",
    doi: str = "",
    user: User = Depends(get_current_user),
):
    """Get PDF URL for a specific paper on demand."""
    pdf_url = await _get_pdf_url_unpaywall(doi)
    if not pdf_url and paper_id:
        pdf_url = await _get_pdf_url_semantic_scholar(paper_id)
    if not pdf_url and doi:
        # Fallback to Sci-Hub style or DOI redirect
        pdf_url = f"https://doi.org/{doi}"
    return {"pdf_url": pdf_url}


@router.post("/generate")
async def generate_review(
    req: GenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a literature review from selected papers. Returns SSE stream."""
    if not req.papers:
        raise HTTPException(status_code=400, detail="Select at least one paper")

    # Build paper context
    papers_context = ""
    for i, p in enumerate(req.papers, 1):
        authors_str = ", ".join(p.authors[:3])
        if len(p.authors) > 3:
            authors_str += " et al."
        papers_context += (
            f"\n[{i}] {p.title}\n"
            f"    Authors: {authors_str}\n"
            f"    Year: {p.year or 'n.d.'}\n"
            f"    Journal: {p.journal or 'N/A'}\n"
            f"    Abstract: {p.abstract[:400]}\n"
            f"    DOI: {p.doi or 'N/A'}\n"
        )

    # Build references list for bibliography
    references = []
    for i, p in enumerate(req.papers, 1):
        references.append({
            "number": i,
            "title": p.title,
            "authors": p.authors,
            "year": p.year,
            "journal": p.journal,
            "doi": p.doi,
            "url": p.url,
        })

    citation_style_guide = {
        "apa": "APA 7th edition: (Author, Year) in-text, full reference list at end",
        "ieee": "IEEE: [1] numbered in-text, numbered reference list at end",
        "harvard": "Harvard: (Author Year) in-text, alphabetical reference list at end",
    }

    exclude_note = ""
    if req.specs.exclude_sections:
        exclude_note = f"\n\nDo NOT include these sections: {', '.join(req.specs.exclude_sections)}"

    additional = ""
    if req.specs.additional_instructions:
        additional = f"\n\nAdditional instructions from the user: {req.specs.additional_instructions}"

    system = (
        "You are an expert academic writer specializing in literature reviews. "
        "Write a comprehensive, well-structured literature review based on the papers provided. "
        "You must ONLY cite and reference the papers listed below — do not invent or hallucinate sources.\n\n"
        f"Citation style: {citation_style_guide.get(req.specs.citation_style, citation_style_guide['apa'])}\n"
        f"Target length: approximately {req.specs.num_pages} pages (~{req.specs.num_pages * 300} words)\n"
        f"Language: {req.specs.language}\n"
        f"{exclude_note}{additional}\n\n"
        "Structure your review with:\n"
        "1. Introduction (brief overview of the topic and purpose of the review)\n"
        "2. Thematic sections organizing the literature by themes, not just paper-by-paper\n"
        "3. Critical analysis — compare and contrast findings, identify agreements and contradictions\n"
        "4. Research gaps and future directions\n"
        "5. Conclusion\n"
        "6. References (complete formatted reference list of ALL cited papers)\n\n"
        "Use clear section headings with ## markdown. Write in academic English. "
        "Every claim must cite the relevant paper(s) from the list."
    )

    user_msg = (
        f"Topic: {req.topic}\n\n"
        f"Papers to review ({len(req.papers)} papers):\n{papers_context}\n\n"
        f"Write a comprehensive literature review of approximately {req.specs.num_pages} pages."
    )

    # Use 8192 tokens for longer reviews
    max_tokens = min(req.specs.num_pages * 1500, 8192)

    async def event_stream():
        full_text = ""
        try:
            async for chunk in _stream_llm(system, user_msg, req.provider, max_tokens):
                full_text += chunk
                yield f"data: {json.dumps({'content': chunk})}\n\n"

            # Send completion with metadata
            word_count = len(full_text.split())
            yield f"data: {json.dumps({'done': True, 'word_count': word_count, 'references': references})}\n\n"

        except Exception as e:
            logger.error("Literature review generation error: %s", e)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/export")
async def export_review(
    req: ExportRequest,
    user: User = Depends(get_current_user),
):
    """Export the literature review as PDF, DOCX, or LaTeX."""
    if req.format == "latex":
        return _export_latex(req)
    elif req.format == "docx":
        return _export_docx(req)
    else:
        return _export_pdf(req)


# ---------- Export Helpers ----------

def _export_latex(req: ExportRequest) -> Response:
    """Generate a downloadable .tex file."""
    # Clean title for LaTeX
    safe_title = req.title.replace("_", "\\_").replace("&", "\\&").replace("%", "\\%")

    tex = (
        "\\documentclass[12pt,a4paper]{article}\n"
        "\\usepackage[utf8]{inputenc}\n"
        "\\usepackage[margin=1in]{geometry}\n"
        "\\usepackage{hyperref}\n"
        "\\usepackage{natbib}\n"
        "\\usepackage{setspace}\n"
        "\\onehalfspacing\n\n"
        f"\\title{{{safe_title}}}\n"
        f"\\date{{\\today}}\n\n"
        "\\begin{document}\n"
        "\\maketitle\n\n"
    )

    # Convert markdown to LaTeX
    content = req.content
    content = re.sub(r"^## (.+)$", r"\\section{\1}", content, flags=re.MULTILINE)
    content = re.sub(r"^### (.+)$", r"\\subsection{\1}", content, flags=re.MULTILINE)
    content = re.sub(r"\*\*(.+?)\*\*", r"\\textbf{\1}", content)
    content = re.sub(r"\*(.+?)\*", r"\\textit{\1}", content)

    tex += content + "\n\n\\end{document}\n"

    filename = re.sub(r"[^a-zA-Z0-9_\- ]", "", req.title).replace(" ", "_")
    return Response(
        content=tex.encode("utf-8"),
        media_type="application/x-tex",
        headers={"Content-Disposition": f'attachment; filename="{filename}.tex"'},
    )


def _export_docx(req: ExportRequest) -> Response:
    """Generate a downloadable .docx file."""
    from docx import Document
    from docx.shared import Pt, Inches
    from docx.enum.text import WD_PARAGRAPH_ALIGNMENT

    doc = Document()

    # Set default font
    style = doc.styles["Normal"]
    font = style.font
    font.name = "Times New Roman"
    font.size = Pt(12)
    style.paragraph_format.space_after = Pt(6)
    style.paragraph_format.line_spacing = 1.5

    # Title
    title_para = doc.add_heading(req.title, level=0)
    title_para.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER

    # Parse content by lines
    lines = req.content.split("\n")
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        if stripped.startswith("## "):
            doc.add_heading(stripped[3:], level=1)
        elif stripped.startswith("### "):
            doc.add_heading(stripped[4:], level=2)
        elif stripped.startswith("- ") or stripped.startswith("* "):
            doc.add_paragraph(stripped[2:], style="List Bullet")
        else:
            # Handle bold and italic in text
            para = doc.add_paragraph()
            _add_formatted_text(para, stripped)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)

    filename = re.sub(r"[^a-zA-Z0-9_\- ]", "", req.title).replace(" ", "_")
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}.docx"'},
    )


def _add_formatted_text(para, text: str):
    """Add text with bold/italic markdown to a docx paragraph."""
    from docx.shared import Pt

    # Split by bold markers first
    parts = re.split(r"(\*\*.*?\*\*)", text)
    for part in parts:
        if part.startswith("**") and part.endswith("**"):
            run = para.add_run(part[2:-2])
            run.bold = True
            run.font.size = Pt(12)
            run.font.name = "Times New Roman"
        else:
            # Handle italic within non-bold parts
            italic_parts = re.split(r"(\*.*?\*)", part)
            for ip in italic_parts:
                if ip.startswith("*") and ip.endswith("*") and not ip.startswith("**"):
                    run = para.add_run(ip[1:-1])
                    run.italic = True
                    run.font.size = Pt(12)
                    run.font.name = "Times New Roman"
                else:
                    run = para.add_run(ip)
                    run.font.size = Pt(12)
                    run.font.name = "Times New Roman"


def _export_pdf(req: ExportRequest) -> Response:
    """Generate a downloadable PDF file."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1 * inch, rightMargin=1 * inch,
        topMargin=1 * inch, bottomMargin=1 * inch,
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="ReviewTitle",
        parent=styles["Title"],
        fontSize=18,
        spaceAfter=20,
        alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        name="ReviewBody",
        parent=styles["Normal"],
        fontSize=11,
        leading=16,
        spaceAfter=8,
        alignment=TA_JUSTIFY,
    ))
    styles.add(ParagraphStyle(
        name="ReviewH1",
        parent=styles["Heading1"],
        fontSize=14,
        spaceBefore=16,
        spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        name="ReviewH2",
        parent=styles["Heading2"],
        fontSize=12,
        spaceBefore=12,
        spaceAfter=6,
    ))

    story = []
    story.append(Paragraph(req.title, styles["ReviewTitle"]))
    story.append(Spacer(1, 12))

    # Parse markdown content
    for line in req.content.split("\n"):
        stripped = line.strip()
        if not stripped:
            story.append(Spacer(1, 6))
            continue

        # Escape HTML special chars for reportlab
        safe = stripped.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        if stripped.startswith("## "):
            heading = safe[3:]
            story.append(Paragraph(heading, styles["ReviewH1"]))
        elif stripped.startswith("### "):
            heading = safe[4:]
            story.append(Paragraph(heading, styles["ReviewH2"]))
        else:
            # Convert markdown bold/italic to reportlab tags
            text = safe
            text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
            text = re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)
            story.append(Paragraph(text, styles["ReviewBody"]))

    doc.build(story)
    buf.seek(0)

    filename = re.sub(r"[^a-zA-Z0-9_\- ]", "", req.title).replace(" ", "_")
    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
    )


# ---------- Smart Paper Summarizer ----------

class SummarizePaperRequest(BaseModel):
    title: str = ""
    abstract: str = ""
    full_text: str = ""
    doi: str = ""
    provider: str = "deepseek"


@router.post("/summarize-paper")
async def summarize_paper(
    req: SummarizePaperRequest,
    user: User = Depends(get_current_user),
):
    """Generate a structured summary of an academic paper."""
    if not req.abstract and not req.full_text:
        raise HTTPException(status_code=400, detail="Provide at least an abstract or full text")

    content = req.full_text[:10000] if req.full_text else req.abstract

    system = (
        "You are an academic paper summarizer. Given a paper's content, extract:\n\n"
        "Return ONLY valid JSON:\n"
        "{\n"
        '  "objective": "What the paper aims to do (1-2 sentences)",\n'
        '  "methodology": "Research methods used (2-3 sentences)",\n'
        '  "key_findings": ["finding 1", "finding 2", "finding 3"],\n'
        '  "limitations": ["limitation 1", "limitation 2"],\n'
        '  "future_work": ["suggestion 1", "suggestion 2"],\n'
        '  "key_claims": [\n'
        '    {"claim": "The main claim", "evidence": "Supporting evidence from the paper"}\n'
        '  ],\n'
        '  "methods_recipe": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],\n'
        '  "one_sentence_summary": "Single sentence capturing the paper\'s contribution"\n'
        "}"
    )

    user_msg = ""
    if req.title:
        user_msg += f"Title: {req.title}\n\n"
    if req.doi:
        user_msg += f"DOI: {req.doi}\n\n"
    user_msg += f"Content:\n{content}"

    try:
        raw = await _call_llm(system, user_msg, req.provider)
        cleaned = raw.strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        summary = json.loads(cleaned)
        summary["title"] = req.title
        summary["doi"] = req.doi
        return summary
    except json.JSONDecodeError:
        return {
            "title": req.title,
            "doi": req.doi,
            "objective": raw[:500] if raw else "Could not parse summary",
            "key_findings": [],
            "limitations": [],
            "key_claims": [],
            "one_sentence_summary": "",
        }


class BatchSummarizeRequest(BaseModel):
    papers: list[dict]  # [{"title": "...", "abstract": "...", "doi": "..."}]
    provider: str = "deepseek"


@router.post("/summarize-batch")
async def summarize_batch(
    req: BatchSummarizeRequest,
    user: User = Depends(get_current_user),
):
    """Batch summarize multiple papers. Returns structured summaries for each."""
    if not req.papers:
        raise HTTPException(status_code=400, detail="No papers provided")
    if len(req.papers) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 papers per batch")

    summaries = []
    for paper in req.papers:
        try:
            inner_req = SummarizePaperRequest(
                title=paper.get("title", ""),
                abstract=paper.get("abstract", ""),
                doi=paper.get("doi", ""),
                provider=req.provider,
            )
            summary = await summarize_paper(inner_req, user)
            summaries.append(summary)
        except Exception as e:
            summaries.append({
                "title": paper.get("title", ""),
                "error": str(e),
            })

    return {"summaries": summaries, "total": len(summaries)}
