"""
iKo-All-in-One Research Orchestrator — Multi-agent research paper pipeline.

Guides users through the entire research process step by step,
selecting the best LLM for each phase automatically.
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db, User, Base
from auth import get_current_user
from config import settings
from llm_proxy import get_api_key, PROVIDER_MODELS

import httpx

router = APIRouter(prefix="/api/orchestrator", tags=["orchestrator"])


# ---------- Pipeline Stages ----------

PIPELINE_STAGES = [
    {
        "id": "topic",
        "name": "Topic & Research Question",
        "description": "Define your research topic, question, and scope",
        "llm": "claude",
        "icon": "Target",
        "user_inputs": [
            {"id": "topic", "label": "Research topic or area", "type": "textarea", "required": True,
             "placeholder": "e.g. The impact of artificial intelligence on early disease detection in Sub-Saharan Africa"},
            {"id": "level", "label": "Academic level", "type": "select", "required": True,
             "options": ["Bachelor's project", "Master's thesis", "PhD dissertation", "Research paper"]},
            {"id": "discipline", "label": "Discipline / field", "type": "text", "required": True,
             "placeholder": "e.g. Computer Science, Public Health, Education"},
            {"id": "initial_thoughts", "label": "Any initial thoughts or direction?", "type": "textarea",
             "placeholder": "Optional — share any ideas, constraints, or preferences"},
        ],
        "system_prompt": (
            "You are a research advisor helping a student define their research question. "
            "Based on their topic, generate:\n"
            "1. A refined, specific research question\n"
            "2. 2-3 sub-questions or hypotheses\n"
            "3. Suggested theoretical framework\n"
            "4. Scope and delimitations\n"
            "5. Why this research matters (significance)\n\n"
            "Be specific and academic. Ask the student if they want to adjust anything."
        ),
    },
    {
        "id": "literature",
        "name": "Literature Review",
        "description": "Analyze existing research and identify gaps",
        "llm": "claude",
        "icon": "BookOpen",
        "user_inputs": [
            {"id": "guidance", "label": "Any specific papers, authors, or themes to include?", "type": "textarea",
             "placeholder": "Optional — paste DOIs, author names, or specific themes to cover"},
            {"id": "adjust", "label": "Adjustments to the research question?", "type": "textarea",
             "placeholder": "Optional — modify anything from the previous step"},
        ],
        "system_prompt": (
            "You are writing the Literature Review chapter. Based on the research question "
            "from the previous stage, produce:\n"
            "1. Thematic organization of existing literature\n"
            "2. Key theories and frameworks used in this field\n"
            "3. Summary of major findings from relevant studies\n"
            "4. Identified research gaps\n"
            "5. How this study fills those gaps\n"
            "6. Conceptual/theoretical framework for this study\n\n"
            "Cite studies using [Author, Year] format. Be thorough and academic."
        ),
    },
    {
        "id": "methodology",
        "name": "Research Methodology",
        "description": "Design the research approach and methods",
        "llm": "claude",
        "icon": "FlaskConical",
        "user_inputs": [
            {"id": "approach", "label": "Do you have a preferred approach?", "type": "select",
             "options": ["Let AI recommend", "Quantitative", "Qualitative", "Mixed methods", "Experimental", "Case study", "Survey-based", "Design science"]},
            {"id": "data_access", "label": "What data do you have access to?", "type": "textarea",
             "placeholder": "e.g. 200 survey respondents, hospital records, interview participants, public datasets"},
            {"id": "tools", "label": "Analysis tools available", "type": "text",
             "placeholder": "e.g. SPSS, R, Python, NVivo, Excel"},
            {"id": "constraints", "label": "Constraints (time, ethics, budget)", "type": "textarea",
             "placeholder": "e.g. 3 months, need IRB approval, no budget for paid tools"},
        ],
        "system_prompt": (
            "You are writing the Methodology chapter. Design a complete research methodology:\n"
            "1. Research design and approach (justify the choice)\n"
            "2. Population and sampling strategy\n"
            "3. Sample size with justification\n"
            "4. Data collection instruments (questionnaires, interviews, etc.)\n"
            "5. Data analysis techniques\n"
            "6. Validity and reliability measures\n"
            "7. Ethical considerations\n"
            "8. Limitations of the methodology\n\n"
            "Be specific about statistical tests or qualitative techniques to use."
        ),
    },
    {
        "id": "data_analysis",
        "name": "Data Analysis & Results",
        "description": "Analyze data and present findings",
        "llm": "deepseek",
        "icon": "BarChart3",
        "user_inputs": [
            {"id": "dataset", "label": "Upload or describe your dataset", "type": "textarea", "required": True,
             "placeholder": "Paste sample data, describe variables, or upload a CSV file in the chat"},
            {"id": "specific_tests", "label": "Any specific tests you want to run?", "type": "textarea",
             "placeholder": "Optional — e.g. run a chi-square test, correlation analysis"},
        ],
        "system_prompt": (
            "You are a data analyst helping with the Results chapter. Based on the "
            "methodology from the previous stage:\n"
            "1. Suggest the exact statistical tests or analysis techniques\n"
            "2. Provide the code (Python/R/SPSS syntax) to run them\n"
            "3. Show how to interpret the output\n"
            "4. Create a results narrative in academic format\n"
            "5. Suggest tables and figures to present\n"
            "6. Report effect sizes and practical significance\n\n"
            "If sample data is provided, analyze it. Otherwise, show the template."
        ),
    },
    {
        "id": "discussion",
        "name": "Discussion",
        "description": "Interpret findings and connect to literature",
        "llm": "claude",
        "icon": "MessageSquare",
        "user_inputs": [
            {"id": "actual_results", "label": "Paste your actual results (if available)", "type": "textarea",
             "placeholder": "Optional — paste your statistical output or key findings"},
            {"id": "surprises", "label": "Any unexpected findings?", "type": "textarea",
             "placeholder": "Optional — describe anything surprising or contradictory"},
        ],
        "system_prompt": (
            "You are writing the Discussion chapter. Based on all previous stages:\n"
            "1. Interpret the key findings\n"
            "2. Compare results with existing literature (from the lit review)\n"
            "3. Explain agreements and contradictions with prior studies\n"
            "4. Discuss theoretical implications\n"
            "5. Discuss practical implications\n"
            "6. Acknowledge limitations\n"
            "7. Suggest future research directions\n\n"
            "Be analytical, not just descriptive. Connect back to the research question."
        ),
    },
    {
        "id": "conclusion",
        "name": "Conclusion & Abstract",
        "description": "Summarize the entire research",
        "llm": "claude",
        "icon": "FileText",
        "user_inputs": [
            {"id": "emphasis", "label": "Anything specific to emphasize?", "type": "textarea",
             "placeholder": "Optional — key contribution, policy recommendation, etc."},
        ],
        "system_prompt": (
            "You are writing the final sections. Produce:\n"
            "1. CONCLUSION chapter:\n"
            "   - Restate the research question and how it was answered\n"
            "   - Summarize key findings (without repeating discussion)\n"
            "   - State the contribution to knowledge\n"
            "   - Practical recommendations\n"
            "   - Suggestions for future research\n"
            "2. ABSTRACT (150-300 words, structured)\n"
            "3. Suggested KEYWORDS (5-7)\n"
            "4. Recommended TITLE (refined from original)\n\n"
            "Be concise and impactful."
        ),
    },
    {
        "id": "references",
        "name": "References & Formatting",
        "description": "Generate reference list and final formatting",
        "llm": "deepseek",
        "icon": "Quote",
        "user_inputs": [
            {"id": "style", "label": "Citation style", "type": "select", "required": True,
             "options": ["APA 7th Edition", "IEEE", "Harvard", "Chicago", "MLA"]},
            {"id": "format", "label": "Export format", "type": "select", "required": True,
             "options": ["Word (.docx)", "LaTeX (.tex)", "Markdown (.md)"]},
        ],
        "system_prompt": (
            "You are a research formatting specialist. Based on all previous stages:\n"
            "1. Compile a complete reference list in the specified citation style\n"
            "2. Generate BibTeX entries for all cited works\n"
            "3. Check for consistency in citation formatting\n"
            "4. Suggest a table of contents structure\n"
            "5. Note any missing citations or formatting issues\n\n"
            "Output the reference list in the requested format."
        ),
    },
    {
        "id": "humanize",
        "name": "Humanize & Polish",
        "description": "Remove AI patterns and perfect academic English",
        "llm": "claude",
        "icon": "PenTool",
        "user_inputs": [
            {"id": "section_to_polish", "label": "Which section to polish first?", "type": "select",
             "options": ["Full document", "Abstract", "Introduction", "Literature Review", "Methodology", "Results", "Discussion", "Conclusion"]},
        ],
        "system_prompt": (
            "You are an academic writing editor specializing in making AI-assisted text "
            "sound naturally human. Review and revise the text to:\n"
            "1. Remove common AI writing patterns:\n"
            "   - Eliminate 'delve', 'crucial', 'Furthermore', 'It is worth noting'\n"
            "   - Replace overly formal connectors with natural transitions\n"
            "   - Vary sentence structure (mix short and long)\n"
            "   - Add discipline-specific jargon where appropriate\n"
            "2. Improve academic quality:\n"
            "   - Strengthen hedging language ('suggests' not 'proves')\n"
            "   - Ensure logical flow between paragraphs\n"
            "   - Check argument consistency\n"
            "3. Check for:\n"
            "   - Passive/active voice balance\n"
            "   - Repetitive phrases\n"
            "   - Clarity and conciseness\n"
            "   - Proper academic register\n\n"
            "Show the revised text with changes highlighted in [brackets]."
        ),
    },
]


# ---------- Smart LLM Routing ----------

STEM_FIELDS = {"computer science", "engineering", "physics", "mathematics", "chemistry",
               "biology", "data science", "statistics", "information technology", "ai",
               "machine learning", "electrical", "mechanical", "civil", "robotics"}
HEALTH_FIELDS = {"medicine", "public health", "nursing", "epidemiology", "pharmacy",
                 "biomedical", "clinical", "health informatics", "dentistry", "veterinary"}
HUMANITIES_FIELDS = {"literature", "philosophy", "history", "linguistics", "theology",
                     "cultural studies", "art", "music", "classics", "languages"}


def _select_llm_for_stage(stage_id: str, discipline: str, approach: str) -> str:
    """Select the best LLM based on research field, approach, and stage."""
    disc_lower = discipline.lower().strip()
    is_stem = any(f in disc_lower for f in STEM_FIELDS)
    is_health = any(f in disc_lower for f in HEALTH_FIELDS)
    is_humanities = any(f in disc_lower for f in HUMANITIES_FIELDS)
    is_quantitative = approach.lower() in ("quantitative", "experimental", "design science", "survey-based")

    if stage_id in ("topic", "discussion", "conclusion", "humanize"):
        return "claude"  # Claude best for academic writing and nuance

    if stage_id == "literature":
        return "claude"  # Claude best for synthesis

    if stage_id == "methodology":
        if is_stem and is_quantitative:
            return "deepseek"  # Good at method-specific code/formulas
        return "claude"

    if stage_id == "data_analysis":
        return "deepseek"  # Best for code generation (Python/R/SPSS)

    if stage_id == "references":
        return "deepseek"  # Best for structured formatting tasks

    return "claude"  # Default


# ---------- Schemas ----------

class StartSessionRequest(BaseModel):
    title: str = ""


class StageInputRequest(BaseModel):
    session_id: str
    stage_id: str
    inputs: dict
    user_message: str = ""
    uploaded_file_context: str = ""  # Text extracted from uploaded files


class SessionOut(BaseModel):
    id: str
    title: str
    current_stage: str
    stages_completed: list[str]
    created_at: str


# ---------- In-memory session storage (move to DB for production scale) ----------

_sessions: dict = {}


class OrchestratorSession:
    def __init__(self, user_id: int, title: str = ""):
        self.id = str(uuid.uuid4())[:12]
        self.user_id = user_id
        self.title = title or "Untitled Research"
        self.current_stage = "topic"
        self.stages_completed: list[str] = []
        self.stage_outputs: dict[str, str] = {}
        self.stage_inputs: dict[str, dict] = {}
        self.discipline: str = ""
        self.approach: str = ""
        self.created_at = datetime.now(timezone.utc)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "current_stage": self.current_stage,
            "stages_completed": self.stages_completed,
            "stage_outputs": self.stage_outputs,
            "discipline": self.discipline,
            "approach": self.approach,
            "created_at": self.created_at.isoformat(),
        }


# ---------- Endpoints ----------

@router.get("/stages")
async def get_pipeline_stages():
    """Return all pipeline stages with their configuration."""
    return [
        {
            "id": s["id"],
            "name": s["name"],
            "description": s["description"],
            "llm": s["llm"],
            "icon": s["icon"],
            "user_inputs": s["user_inputs"],
        }
        for s in PIPELINE_STAGES
    ]


@router.post("/sessions/start")
async def start_session(
    req: StartSessionRequest,
    user: User = Depends(get_current_user),
):
    """Start a new research orchestration session."""
    tier_info = settings.tier_limits.get(user.subscription_tier.value, {})
    if user.subscription_tier.value not in ("pro", "lab_group"):
        raise HTTPException(
            status_code=403,
            detail="iKo-All-in-One requires Pro or Lab Group plan.",
        )

    session = OrchestratorSession(user.id, req.title)
    _sessions[session.id] = session
    return session.to_dict()


@router.get("/sessions")
async def list_sessions(user: User = Depends(get_current_user)):
    """List user's orchestration sessions."""
    user_sessions = [
        s.to_dict() for s in _sessions.values() if s.user_id == user.id
    ]
    return sorted(user_sessions, key=lambda x: x["created_at"], reverse=True)


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, user: User = Depends(get_current_user)):
    """Get full session state including all outputs."""
    session = _sessions.get(session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.to_dict()


@router.post("/sessions/{session_id}/execute")
async def execute_stage(
    session_id: str,
    req: StageInputRequest,
    user: User = Depends(get_current_user),
):
    """Execute a pipeline stage with user inputs. Returns streamed LLM response."""
    session = _sessions.get(session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    # Find stage config
    stage = next((s for s in PIPELINE_STAGES if s["id"] == req.stage_id), None)
    if not stage:
        raise HTTPException(status_code=400, detail="Invalid stage")

    # Store user inputs
    session.stage_inputs[req.stage_id] = req.inputs

    # Build context from all previous stages
    context_parts = []
    for completed_id in session.stages_completed:
        if completed_id in session.stage_outputs:
            stage_name = next(
                (s["name"] for s in PIPELINE_STAGES if s["id"] == completed_id), completed_id
            )
            context_parts.append(
                f"=== {stage_name} (completed) ===\n{session.stage_outputs[completed_id]}"
            )

    previous_context = "\n\n".join(context_parts) if context_parts else ""

    # Build the prompt
    system_prompt = stage["system_prompt"]
    if previous_context:
        system_prompt = (
            f"{system_prompt}\n\n"
            f"PREVIOUS STAGES OUTPUT:\n{previous_context}"
        )

    # Build user message from inputs
    user_parts = []
    for field in stage["user_inputs"]:
        value = req.inputs.get(field["id"], "")
        if value:
            user_parts.append(f"{field['label']}: {value}")
    if req.user_message:
        user_parts.append(f"Additional notes: {req.user_message}")

    user_message = "\n".join(user_parts) if user_parts else "Please proceed with this stage."

    # Append file context if provided
    if req.uploaded_file_context:
        user_parts.append(f"\n--- Attached file content ---\n{req.uploaded_file_context[:15000]}")

    # Update session metadata from first stage
    if req.stage_id == "topic":
        if req.inputs.get("topic"):
            session.title = req.inputs["topic"][:100]
        if req.inputs.get("discipline"):
            session.discipline = req.inputs["discipline"]
    if req.stage_id == "methodology" and req.inputs.get("approach"):
        session.approach = req.inputs.get("approach", "")

    # Smart LLM routing based on research field and approach
    llm = _select_llm_for_stage(req.stage_id, session.discipline, session.approach)
    api_key = get_api_key(llm)

    # Call LLM (non-streaming for orchestrator — stores full output)
    model = PROVIDER_MODELS.get(llm, llm)

    if llm == "claude":
        response_text = await _call_anthropic(system_prompt, user_message, api_key, model)
    else:
        response_text = await _call_openai_compat(system_prompt, user_message, api_key, model, llm)

    # Store output and advance
    session.stage_outputs[req.stage_id] = response_text
    if req.stage_id not in session.stages_completed:
        session.stages_completed.append(req.stage_id)

    # Set next stage
    stage_ids = [s["id"] for s in PIPELINE_STAGES]
    current_idx = stage_ids.index(req.stage_id)
    if current_idx + 1 < len(stage_ids):
        session.current_stage = stage_ids[current_idx + 1]

    return {
        "stage_id": req.stage_id,
        "llm_used": llm,
        "model": model,
        "output": response_text,
        "next_stage": session.current_stage,
        "session": session.to_dict(),
    }


@router.post("/sessions/{session_id}/humanize")
async def humanize_text(
    session_id: str,
    text: str,
    user: User = Depends(get_current_user),
):
    """Run the humanizer on a piece of text."""
    session = _sessions.get(session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    humanizer_prompt = PIPELINE_STAGES[-1]["system_prompt"]
    api_key = get_api_key("claude")
    model = PROVIDER_MODELS["claude"]

    result = await _call_anthropic(humanizer_prompt, text, api_key, model)
    return {"humanized_text": result}


@router.get("/sessions/{session_id}/export")
async def export_session(
    session_id: str,
    format: str = "md",
    user: User = Depends(get_current_user),
):
    """Export the complete research document."""
    session = _sessions.get(session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    # Build full document from stage outputs
    sections = []
    section_map = {
        "topic": "1. Introduction",
        "literature": "2. Literature Review",
        "methodology": "3. Research Methodology",
        "data_analysis": "4. Results and Data Analysis",
        "discussion": "5. Discussion",
        "conclusion": "6. Conclusion",
        "references": "References",
    }

    for stage_id, heading in section_map.items():
        if stage_id in session.stage_outputs:
            sections.append(f"# {heading}\n\n{session.stage_outputs[stage_id]}")

    content = f"# {session.title}\n\n" + "\n\n---\n\n".join(sections)

    if format == "json":
        import io
        from fastapi.responses import StreamingResponse
        data = json.dumps(session.to_dict(), indent=2)
        return StreamingResponse(
            io.BytesIO(data.encode()),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{session.title}.json"'},
        )

    # Markdown
    import io
    from fastapi.responses import StreamingResponse
    safe_title = "".join(c for c in session.title if c.isalnum() or c in " -_")[:50].strip()
    return StreamingResponse(
        io.BytesIO(content.encode()),
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{safe_title}.md"'},
    )


# ---------- LLM Callers (non-streaming for orchestrator) ----------

async def _call_anthropic(system: str, user_msg: str, api_key: str, model: str) -> str:
    payload = {
        "model": model,
        "max_tokens": 4096,
        "system": system,
        "messages": [{"role": "user", "content": user_msg}],
    }
    async with httpx.AsyncClient(timeout=120) as client:
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
    system: str, user_msg: str, api_key: str, model: str, provider: str
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
        "max_tokens": 4096,
    }
    async with httpx.AsyncClient(timeout=120) as client:
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
