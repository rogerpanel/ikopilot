"""
iKo Journal — Template-guided article writing for journals and conferences.

Users select a target journal or conference, then write their article
following the publisher's specific structure, guidelines, and reviewer expectations.
"""

import json
import re
import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
import httpx

from database import User
from auth import get_current_user
from config import settings
from llm_proxy import get_api_key, PROVIDER_MODELS
from litreview import _stream_llm, _call_llm

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/journal", tags=["journal"])


# ---------- Publisher / Journal Data ----------

PUBLISHERS = {
    "elsevier": {
        "name": "Elsevier",
        "journals": [
            {
                "id": "lancet", "name": "The Lancet", "field": "Medicine",
                "impact_factor": "168.9",
                "sections": ["Abstract (structured: Background, Methods, Findings, Interpretation)", "Introduction", "Methods", "Results", "Discussion", "Acknowledgements", "References"],
                "abstract_limit": 300, "word_limit": 3500, "reference_style": "Vancouver (numbered)",
                "guidelines": "Structured abstract required. CONSORT/STROBE for trials/observational. Data sharing statement mandatory. Highlight clinical relevance.",
            },
            {
                "id": "energy_policy", "name": "Energy Policy", "field": "Environmental Science / Energy",
                "impact_factor": "9.0",
                "sections": ["Abstract", "Introduction", "Literature Review", "Methodology", "Results & Discussion", "Policy Implications", "Conclusions", "References"],
                "abstract_limit": 200, "word_limit": 10000, "reference_style": "APA",
                "guidelines": "Policy relevance must be explicit. Include data availability statement. Interdisciplinary perspective encouraged.",
            },
            {
                "id": "computers_education", "name": "Computers & Education", "field": "Education Technology",
                "impact_factor": "12.0",
                "sections": ["Abstract", "Introduction", "Literature Review", "Theoretical Framework", "Methodology", "Results", "Discussion", "Implications", "Conclusion", "References"],
                "abstract_limit": 200, "word_limit": 8000, "reference_style": "APA 7th",
                "guidelines": "Theoretical grounding mandatory. Include effect sizes for quantitative studies. Discuss pedagogical implications explicitly.",
            },
        ],
    },
    "springer": {
        "name": "Springer Nature",
        "journals": [
            {
                "id": "nature", "name": "Nature", "field": "Multidisciplinary Science",
                "impact_factor": "64.8",
                "sections": ["Abstract (1 paragraph, no references)", "Introduction (no heading)", "Results", "Discussion", "Methods", "References", "Extended Data"],
                "abstract_limit": 150, "word_limit": 5000, "reference_style": "Nature (numbered, superscript)",
                "guidelines": "No heading for introduction. Methods section AFTER discussion. Extended Data figures allowed. Supplementary Information separate.",
            },
            {
                "id": "bmc_public_health", "name": "BMC Public Health", "field": "Public Health",
                "impact_factor": "4.5",
                "sections": ["Abstract (structured: Background, Methods, Results, Conclusions)", "Background", "Methods", "Results", "Discussion", "Conclusions", "Abbreviations", "References"],
                "abstract_limit": 350, "word_limit": None, "reference_style": "Vancouver (numbered)",
                "guidelines": "Open access. PRISMA for systematic reviews. Ethics approval statement required. Availability of data and materials section mandatory.",
            },
        ],
    },
    "ieee": {
        "name": "IEEE",
        "journals": [
            {
                "id": "ieee_access", "name": "IEEE Access", "field": "Engineering / Computing",
                "impact_factor": "3.9",
                "sections": ["Abstract", "Introduction", "Related Work", "Proposed Method/System", "Experimental Setup", "Results and Discussion", "Conclusion", "References"],
                "abstract_limit": 250, "word_limit": None, "reference_style": "IEEE (numbered, brackets)",
                "guidelines": "Open access. Two-column format. Use IEEE citation style [1]. Include CCS concepts. Equations numbered consecutively.",
            },
            {
                "id": "ieee_tpami", "name": "IEEE Trans. Pattern Analysis & Machine Intelligence", "field": "Computer Vision / AI",
                "impact_factor": "23.6",
                "sections": ["Abstract", "Introduction", "Related Work", "Methodology", "Experiments", "Ablation Studies", "Discussion", "Conclusion", "References"],
                "abstract_limit": 200, "word_limit": None, "reference_style": "IEEE (numbered)",
                "guidelines": "Reproducibility required — code/data links. Ablation studies expected. Comparison against SOTA baselines mandatory.",
            },
        ],
    },
    "wiley": {
        "name": "Wiley",
        "journals": [
            {
                "id": "angewandte", "name": "Angewandte Chemie", "field": "Chemistry",
                "impact_factor": "16.6",
                "sections": ["Abstract", "Introduction", "Results and Discussion", "Conclusion", "Experimental Section", "Acknowledgements", "References", "Supporting Information"],
                "abstract_limit": 200, "word_limit": 5000, "reference_style": "Angewandte (numbered)",
                "guidelines": "Communications format: concise, max 4 pages. Experimental details in Supporting Info. Graphical abstract required.",
            },
            {
                "id": "global_challenges", "name": "Global Challenges", "field": "Sustainability / Global Health",
                "impact_factor": "5.2",
                "sections": ["Abstract", "Introduction", "Results", "Discussion", "Experimental Section", "Conclusions", "References"],
                "abstract_limit": 250, "word_limit": 8000, "reference_style": "Wiley (numbered)",
                "guidelines": "Interdisciplinary focus. UN SDGs alignment encouraged. Open access.",
            },
        ],
    },
    "taylor_francis": {
        "name": "Taylor & Francis",
        "journals": [
            {
                "id": "higher_education", "name": "Studies in Higher Education", "field": "Education",
                "impact_factor": "5.0",
                "sections": ["Abstract", "Introduction", "Literature Review", "Theoretical Framework", "Methodology", "Findings", "Discussion", "Conclusion", "References"],
                "abstract_limit": 200, "word_limit": 8000, "reference_style": "APA 7th",
                "guidelines": "Theoretical grounding expected. Include reflexivity statement for qualitative. International perspective valued.",
            },
            {
                "id": "intl_business_review", "name": "International Business Review", "field": "Business / Management",
                "impact_factor": "5.6",
                "sections": ["Abstract", "Introduction", "Theoretical Background", "Hypotheses Development", "Methodology", "Results", "Discussion", "Conclusion", "Managerial Implications", "References"],
                "abstract_limit": 250, "word_limit": 12000, "reference_style": "APA 7th",
                "guidelines": "Hypotheses-driven research preferred. Include managerial implications section. Cross-cultural considerations valued.",
            },
        ],
    },
}


CONFERENCES = {
    "ieee_conferences": {
        "name": "IEEE Conferences",
        "events": [
            {
                "id": "cvpr", "name": "CVPR (Computer Vision and Pattern Recognition)", "field": "Computer Vision",
                "page_limit": 8, "format": "Two-column, IEEE conference format",
                "sections": ["Abstract", "Introduction", "Related Work", "Method", "Experiments", "Conclusion", "References"],
                "reference_style": "IEEE (numbered)",
                "review_criteria": "Novelty, technical soundness, clarity, significance, experimental validation. Double-blind review.",
                "guidelines": "8 pages + unlimited references. Supplementary material allowed. Code submission encouraged. Double-blind — no author info in paper.",
            },
            {
                "id": "icra", "name": "ICRA (Intl. Conf. Robotics and Automation)", "field": "Robotics",
                "page_limit": 6, "format": "Two-column, IEEE conference format",
                "sections": ["Abstract", "Introduction", "Related Work", "System Design/Methodology", "Experiments", "Results", "Conclusion", "References"],
                "reference_style": "IEEE (numbered)",
                "review_criteria": "Technical contribution, experimental rigor, reproducibility, clarity.",
                "guidelines": "6 pages + 1 for references. Video demonstrations highly valued. Real-world experiments preferred over simulation-only.",
            },
        ],
    },
    "acm_conferences": {
        "name": "ACM Conferences",
        "events": [
            {
                "id": "chi", "name": "CHI (Human Factors in Computing)", "field": "HCI / UX Research",
                "page_limit": 10, "format": "ACM single-column format",
                "sections": ["Abstract", "Introduction", "Background & Related Work", "Study Design", "Findings", "Discussion", "Limitations", "Conclusion", "References"],
                "reference_style": "ACM (author-year)",
                "review_criteria": "Significance, originality, validity of methods, quality of presentation, relevance to HCI.",
                "guidelines": "10 pages + references. Include positionality statement for qualitative work. Accessibility considerations required.",
            },
            {
                "id": "sigmod", "name": "SIGMOD (Management of Data)", "field": "Databases / Data Systems",
                "page_limit": 12, "format": "ACM single-column format",
                "sections": ["Abstract", "Introduction", "Problem Definition", "Related Work", "Approach", "Experimental Evaluation", "Discussion", "Conclusion", "References"],
                "reference_style": "ACM (numbered)",
                "review_criteria": "Novelty, technical depth, experimental thoroughness, scalability demonstration.",
                "guidelines": "12 pages. Reproducibility strongly encouraged. Include complexity analysis. Large-scale experiments expected.",
            },
        ],
    },
    "medical_conferences": {
        "name": "Medical & Health Conferences",
        "events": [
            {
                "id": "miccai", "name": "MICCAI (Medical Image Computing & Computer Assisted Intervention)", "field": "Medical Imaging / AI",
                "page_limit": 10, "format": "Springer LNCS format",
                "sections": ["Abstract", "Introduction", "Methods", "Experiments", "Results", "Discussion", "Conclusion", "References"],
                "reference_style": "Springer LNCS (numbered)",
                "review_criteria": "Clinical relevance, methodological innovation, validation rigor, reproducibility.",
                "guidelines": "10 pages including references. Clinical validation highly valued. IRB/ethics approval required. Comparison with clinical baselines expected.",
            },
            {
                "id": "embc", "name": "EMBC (Engineering in Medicine and Biology)", "field": "Biomedical Engineering",
                "page_limit": 4, "format": "IEEE conference format",
                "sections": ["Abstract", "Introduction", "Materials and Methods", "Results", "Discussion", "Conclusion", "References"],
                "reference_style": "IEEE (numbered)",
                "review_criteria": "Clinical significance, engineering novelty, validation quality.",
                "guidelines": "4 pages strict. Emphasize clinical application. Include statistical significance tests.",
            },
        ],
    },
    "environmental_conferences": {
        "name": "Environmental & Sustainability Conferences",
        "events": [
            {
                "id": "agu_fall", "name": "AGU Fall Meeting", "field": "Earth & Environmental Sciences",
                "page_limit": 2, "format": "Extended abstract / poster",
                "sections": ["Title", "Abstract", "Key Findings", "Methodology Summary", "Implications", "References"],
                "reference_style": "AGU (author-year)",
                "review_criteria": "Scientific merit, novelty, broader impacts.",
                "guidelines": "2-page extended abstract. Data should be deposited in open repository. Include broader impacts statement.",
            },
            {
                "id": "isie", "name": "ISIE (Intl. Symp. Industrial Ecology)", "field": "Industrial Ecology / Sustainability",
                "page_limit": 6, "format": "Conference proceedings format",
                "sections": ["Abstract", "Introduction", "Background", "Methods", "Results", "Discussion", "Conclusions", "References"],
                "reference_style": "APA",
                "review_criteria": "Sustainability relevance, methodological rigor, systems thinking.",
                "guidelines": "6 pages. Life cycle perspective valued. Quantitative and qualitative approaches welcome.",
            },
        ],
    },
}


# ---------- Lookup Helpers ----------

def _find_journal(template_id: str) -> tuple[dict, str] | None:
    """Find a journal by ID across all publishers. Returns (journal_dict, publisher_name)."""
    for pub_key, pub in PUBLISHERS.items():
        for j in pub["journals"]:
            if j["id"] == template_id:
                return j, pub["name"]
    return None


def _find_conference(template_id: str) -> tuple[dict, str] | None:
    """Find a conference by ID across all groups. Returns (event_dict, group_name)."""
    for grp_key, grp in CONFERENCES.items():
        for ev in grp["events"]:
            if ev["id"] == template_id:
                return ev, grp["name"]
    return None


def _get_template(template_type: str, template_id: str) -> dict:
    """Get template config. Raises 404 if not found."""
    if template_type == "journal":
        result = _find_journal(template_id)
        if result:
            journal, publisher = result
            return {**journal, "publisher": publisher, "template_type": "journal"}
    else:
        result = _find_conference(template_id)
        if result:
            event, group = result
            return {**event, "publisher": group, "template_type": "conference"}
    raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")


# ---------- Schemas ----------

class GenerateArticleRequest(BaseModel):
    template_type: str  # "journal" or "conference"
    template_id: str
    title: str
    content_per_section: dict = {}
    provider: str = "claude"
    abstract_text: str = ""
    keywords: list[str] = []


class ReviewCheckRequest(BaseModel):
    template_type: str
    template_id: str
    content: str
    provider: str = "claude"


class ExportArticleRequest(BaseModel):
    title: str
    content: str
    template_name: str = ""
    format: str = "pdf"  # pdf | docx | latex


# ---------- GET Endpoints ----------

@router.get("/publishers")
async def list_publishers(user: User = Depends(get_current_user)):
    """List all publishers with their journals."""
    return {"publishers": PUBLISHERS}


@router.get("/conferences")
async def list_conferences(user: User = Depends(get_current_user)):
    """List all conference groups with their events."""
    return {"conferences": CONFERENCES}


@router.get("/template/{template_id}")
async def get_template(
    template_id: str,
    type: str = "journal",
    user: User = Depends(get_current_user),
):
    """Get full template details for a journal or conference."""
    return _get_template(type, template_id)


# ---------- POST /generate — Stream article generation ----------

@router.post("/generate")
async def generate_article(
    req: GenerateArticleRequest,
    user: User = Depends(get_current_user),
):
    """Generate an article following the selected journal/conference template. Returns SSE stream."""
    template = _get_template(req.template_type, req.template_id)

    # Build section context from user's drafts/notes
    section_context = ""
    if req.content_per_section:
        for section, content in req.content_per_section.items():
            if content.strip():
                section_context += f"\n### {section}\n{content}\n"

    # Build the system prompt with template-specific requirements
    if req.template_type == "journal":
        word_limit_note = f"Word limit: {template.get('word_limit', 'No strict limit')} words." if template.get('word_limit') else "No strict word limit."
        system = (
            f"You are an expert academic writer preparing a manuscript for {template['name']} "
            f"(published by {template['publisher']}). "
            f"Field: {template.get('field', 'General')}.\n\n"
            f"STRICT REQUIREMENTS:\n"
            f"- Reference style: {template.get('reference_style', 'Author-year')}\n"
            f"- Abstract limit: {template.get('abstract_limit', 250)} words\n"
            f"- {word_limit_note}\n"
            f"- Required sections (IN THIS ORDER): {', '.join(template.get('sections', []))}\n\n"
            f"JOURNAL-SPECIFIC GUIDELINES:\n{template.get('guidelines', '')}\n\n"
            f"INSTRUCTIONS:\n"
            f"- Write a complete, publication-ready manuscript following the exact section structure above\n"
            f"- Use ## for section headings, ### for subsections\n"
            f"- Include proper in-text citations using the journal's reference style\n"
            f"- Maintain formal academic tone appropriate for this journal\n"
            f"- If the user provided draft content for sections, expand and improve it\n"
            f"- Generate a properly formatted References section at the end\n"
            f"- Respect word and abstract limits"
        )
    else:
        system = (
            f"You are an expert academic writer preparing a paper for {template['name']}. "
            f"This is a conference paper ({template['publisher']}).\n\n"
            f"STRICT REQUIREMENTS:\n"
            f"- Format: {template.get('format', 'Conference format')}\n"
            f"- Page limit: {template.get('page_limit', 'N/A')} pages\n"
            f"- Reference style: {template.get('reference_style', 'Numbered')}\n"
            f"- Required sections: {', '.join(template.get('sections', []))}\n\n"
            f"REVIEW CRITERIA (what reviewers will evaluate):\n{template.get('review_criteria', '')}\n\n"
            f"CONFERENCE GUIDELINES:\n{template.get('guidelines', '')}\n\n"
            f"INSTRUCTIONS:\n"
            f"- Write a complete, submission-ready conference paper\n"
            f"- Use ## for section headings\n"
            f"- Be concise — conference papers are shorter than journal articles\n"
            f"- Address all review criteria in your writing\n"
            f"- If the user provided draft content for sections, expand and improve it\n"
            f"- Include References section at the end"
        )

    keywords_str = ", ".join(req.keywords) if req.keywords else ""
    user_msg = f"Title: {req.title}\n"
    if keywords_str:
        user_msg += f"Keywords: {keywords_str}\n"
    if req.abstract_text:
        user_msg += f"\nAbstract draft:\n{req.abstract_text}\n"
    if section_context:
        user_msg += f"\nUser's section drafts/notes:{section_context}\n"
    user_msg += "\nWrite the complete manuscript following the template requirements."

    max_tokens = 8192

    async def event_stream():
        full_text = ""
        try:
            async for chunk in _stream_llm(system, user_msg, req.provider, max_tokens):
                full_text += chunk
                yield f"data: {json.dumps({'content': chunk})}\n\n"

            word_count = len(full_text.split())
            yield f"data: {json.dumps({'done': True, 'word_count': word_count, 'template': template['name']})}\n\n"
        except Exception as e:
            logger.error("Article generation error: %s", e)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---------- POST /review-check — Check compliance ----------

@router.post("/review-check")
async def review_check(
    req: ReviewCheckRequest,
    user: User = Depends(get_current_user),
):
    """Check if a draft meets the journal/conference reviewer requirements."""
    template = _get_template(req.template_type, req.template_id)

    # Basic automated checks
    word_count = len(req.content.split())
    sections_found = re.findall(r"^##\s+(.+)$", req.content, re.MULTILINE)
    sections_lower = [s.lower().strip() for s in sections_found]

    checks = []

    # Word count check
    word_limit = template.get("word_limit") or template.get("page_limit", 0) * 300
    if word_limit:
        passed = word_count <= word_limit
        checks.append({
            "item": "Word/Page Limit",
            "status": "pass" if passed else "fail",
            "detail": f"{word_count} words (limit: {word_limit})",
        })

    # Abstract check
    abstract_match = re.search(r"(?:^|\n)##?\s*Abstract\s*\n([\s\S]*?)(?=\n##|\Z)", req.content)
    if abstract_match:
        abstract_words = len(abstract_match.group(1).strip().split())
        limit = template.get("abstract_limit", 250)
        passed = abstract_words <= limit
        checks.append({
            "item": "Abstract Length",
            "status": "pass" if passed else "fail",
            "detail": f"{abstract_words} words (limit: {limit})",
        })
    else:
        checks.append({
            "item": "Abstract Present",
            "status": "fail",
            "detail": "No abstract section found",
        })

    # Required sections check
    required = template.get("sections", [])
    for sec in required:
        sec_name = sec.split("(")[0].strip().lower()
        found = any(sec_name in s for s in sections_lower)
        checks.append({
            "item": f"Section: {sec.split('(')[0].strip()}",
            "status": "pass" if found else "fail",
            "detail": "Found" if found else "Missing",
        })

    # References check
    has_refs = any("reference" in s for s in sections_lower)
    checks.append({
        "item": "References Section",
        "status": "pass" if has_refs else "fail",
        "detail": "Found" if has_refs else "Missing",
    })

    # LLM-based deep review
    system = (
        f"You are a reviewer for {template['name']}. "
        f"Check this manuscript against the journal/conference requirements.\n\n"
        f"Template requirements:\n"
        f"- Sections: {', '.join(required)}\n"
        f"- Reference style: {template.get('reference_style', 'N/A')}\n"
        f"- Guidelines: {template.get('guidelines', 'N/A')}\n"
    )
    if template.get("review_criteria"):
        system += f"- Review criteria: {template['review_criteria']}\n"

    system += (
        "\nReturn ONLY valid JSON with this structure:\n"
        '{"style_compliance": "pass" or "fail", "style_notes": "...", '
        '"citation_compliance": "pass" or "fail", "citation_notes": "...", '
        '"content_quality": "pass" or "needs_revision", "content_notes": "...", '
        '"missing_elements": ["element1", "element2"], '
        '"reviewer_concerns": ["concern1", "concern2"], '
        '"overall_readiness": "ready" or "revisions_needed", '
        '"summary": "Brief overall assessment"}'
    )

    try:
        raw = await _call_llm(system, f"Manuscript to review:\n\n{req.content[:12000]}", req.provider)
        cleaned = raw.strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        llm_review = json.loads(cleaned)
    except Exception:
        llm_review = {"summary": "Could not complete AI review. Please try again.", "overall_readiness": "unknown"}

    # Add LLM review items to checks
    for key in ["style_compliance", "citation_compliance", "content_quality"]:
        if key in llm_review:
            label = key.replace("_", " ").title()
            status = "pass" if llm_review[key] in ("pass", "ready") else "fail"
            notes_key = key.replace("compliance", "notes").replace("quality", "notes")
            checks.append({
                "item": label,
                "status": status,
                "detail": llm_review.get(notes_key, ""),
            })

    passed_count = sum(1 for c in checks if c["status"] == "pass")
    total_count = len(checks)

    return {
        "template_name": template["name"],
        "checks": checks,
        "passed": passed_count,
        "total": total_count,
        "score": round(passed_count / total_count * 100) if total_count else 0,
        "missing_elements": llm_review.get("missing_elements", []),
        "reviewer_concerns": llm_review.get("reviewer_concerns", []),
        "overall_readiness": llm_review.get("overall_readiness", "unknown"),
        "summary": llm_review.get("summary", ""),
        "word_count": word_count,
    }


# ---------- POST /export — Export article ----------

@router.post("/export")
async def export_article(
    req: ExportArticleRequest,
    user: User = Depends(get_current_user),
):
    """Export the article as PDF, DOCX, or LaTeX."""
    if req.format == "latex":
        return _export_article_latex(req)
    elif req.format == "docx":
        return _export_article_docx(req)
    else:
        return _export_article_pdf(req)


def _export_article_pdf(req: ExportArticleRequest) -> Response:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=inch, rightMargin=inch, topMargin=inch, bottomMargin=inch)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="ATitle", parent=styles["Title"], fontSize=16, spaceAfter=16, alignment=TA_CENTER))
    styles.add(ParagraphStyle(name="ABody", parent=styles["Normal"], fontSize=11, leading=15, spaceAfter=6, alignment=TA_JUSTIFY))
    styles.add(ParagraphStyle(name="AH1", parent=styles["Heading1"], fontSize=13, spaceBefore=14, spaceAfter=6))
    styles.add(ParagraphStyle(name="AH2", parent=styles["Heading2"], fontSize=11, spaceBefore=10, spaceAfter=4))
    styles.add(ParagraphStyle(name="AMeta", parent=styles["Normal"], fontSize=9, textColor="grey", alignment=TA_CENTER, spaceAfter=12))

    story = []
    story.append(Paragraph(req.title.replace("&", "&amp;"), styles["ATitle"]))
    if req.template_name:
        story.append(Paragraph(f"Prepared for: {req.template_name}".replace("&", "&amp;"), styles["AMeta"]))
    story.append(Spacer(1, 12))

    for line in req.content.split("\n"):
        stripped = line.strip()
        if not stripped:
            story.append(Spacer(1, 4))
            continue
        safe = stripped.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        if stripped.startswith("## "):
            story.append(Paragraph(safe[3:], styles["AH1"]))
        elif stripped.startswith("### "):
            story.append(Paragraph(safe[4:], styles["AH2"]))
        else:
            text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", safe)
            text = re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)
            story.append(Paragraph(text, styles["ABody"]))

    doc.build(story)
    buf.seek(0)
    fname = re.sub(r"[^a-zA-Z0-9_\- ]", "", req.title).replace(" ", "_")[:50]
    return Response(content=buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{fname}.pdf"'})


def _export_article_docx(req: ExportArticleRequest) -> Response:
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_PARAGRAPH_ALIGNMENT

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(12)
    style.paragraph_format.line_spacing = 1.5

    t = doc.add_heading(req.title, level=0)
    t.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
    if req.template_name:
        meta = doc.add_paragraph(f"Prepared for: {req.template_name}")
        meta.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
        meta.runs[0].font.size = Pt(10)
        meta.runs[0].font.italic = True

    for line in req.content.split("\n"):
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
            para = doc.add_paragraph()
            parts = re.split(r"(\*\*.*?\*\*)", stripped)
            for part in parts:
                if part.startswith("**") and part.endswith("**"):
                    run = para.add_run(part[2:-2])
                    run.bold = True
                else:
                    para.add_run(part)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    fname = re.sub(r"[^a-zA-Z0-9_\- ]", "", req.title).replace(" ", "_")[:50]
    return Response(content=buf.getvalue(),
                    media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    headers={"Content-Disposition": f'attachment; filename="{fname}.docx"'})


def _export_article_latex(req: ExportArticleRequest) -> Response:
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
    content = req.content
    content = re.sub(r"^## (.+)$", r"\\section{\1}", content, flags=re.MULTILINE)
    content = re.sub(r"^### (.+)$", r"\\subsection{\1}", content, flags=re.MULTILINE)
    content = re.sub(r"\*\*(.+?)\*\*", r"\\textbf{\1}", content)
    content = re.sub(r"\*(.+?)\*", r"\\textit{\1}", content)
    tex += content + "\n\n\\end{document}\n"
    fname = re.sub(r"[^a-zA-Z0-9_\- ]", "", req.title).replace(" ", "_")[:50]
    return Response(content=tex.encode("utf-8"), media_type="application/x-tex",
                    headers={"Content-Disposition": f'attachment; filename="{fname}.tex"'})
