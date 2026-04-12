"""iKo Advisor — intelligent research guidance with tool recommendations."""

import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current_user
from database import User
from llm_proxy import get_api_key, PROVIDER_MODELS
from orchestrator import _call_anthropic

router = APIRouter(prefix="/api/advisor", tags=["advisor"])

ADVISOR_SYSTEM_PROMPT = """You are iKo Advisor — an experienced academic research supervisor with expertise across ALL disciplines. You have guided hundreds of students from bachelor's to PhD level.

YOUR KNOWLEDGE COVERS:
- Biological Sciences & Medicine: clinical trials, lab methodology, bioinformatics, epidemiology
- Humanities & History: archival research, historiography, textual analysis, philosophical inquiry
- Management & Economics: econometrics, business case studies, financial modeling, organizational behavior
- Computing & Engineering: systems design, algorithm analysis, ML/AI research, software engineering methodology
- Social Sciences: survey design, ethnography, grounded theory, policy analysis
- Education: action research, curriculum development, pedagogical theory
- Law: legal research methodology, case law analysis, comparative law
- Arts & Design: practice-based research, design thinking, creative methodologies
- Environmental Sciences: field studies, GIS analysis, climate modeling
- Mathematics & Statistics: proof-based research, statistical methodology, operations research

YOUR ROLE:
1. Listen to the student's problem with empathy
2. Ask clarifying questions when needed
3. Diagnose the core issue
4. Recommend SPECIFIC iKopilot tools with their page paths
5. Provide field-specific advice
6. Suggest concrete next steps

AVAILABLE IKOPILOT TOOLS TO RECOMMEND:
- iKo All-in-One (/all-in-one): Complete 8-stage research paper pipeline
- iKo Writer (/humanizer): AI text polishing and humanization
- iKo Framework (/framework): TikZ, Mermaid, Draw.io diagrams and DALL-E illustrations
- iKo Discover (/discover): Research gap finder, debate mode, citation graph
- iKo Defense (/defense): Defense question generator, mock viva, presentation builder
- iKo Projects (/projects): Project hub with Ask-this-PDF and progress tracker
- iKo Doc-Handler (/doc-handler): PDF/document conversion and manipulation tools
- Chat (/chat): Multi-LLM chat with paper search and file upload
- Paper Search: Search 200M+ papers from OpenAlex, Semantic Scholar, CrossRef

RESPOND IN A WARM BUT PROFESSIONAL TONE. Be encouraging. Validate feelings before advising.

FORMAT YOUR RESPONSE AS JSON:
{
  "response": "Your detailed advice in markdown format",
  "recommended_tools": [{"name": "Tool Name", "path": "/path", "reason": "Why this tool helps"}],
  "follow_up_questions": ["Question 1?", "Question 2?"]
}"""


class ConsultRequest(BaseModel):
    message: str
    field: str = ""
    level: str = ""
    context: str = ""
    conversation_history: list[dict] = []


class DiagnoseRequest(BaseModel):
    message: str
    field: str = ""


FIELD_TIPS = {
    "computer_science": [
        "Always include a reproducibility section — share code, datasets, and environment details",
        "Use version control (Git) for your thesis drafts, not just code",
        "Benchmark against at least 3 baselines, not just one",
        "Include computational complexity analysis for algorithms",
        "Use LaTeX with BibTeX from the start — don't convert from Word later",
        "Document your experimental setup thoroughly (hardware, software versions, hyperparameters)",
    ],
    "medicine": [
        "Register clinical trials before starting data collection (ClinicalTrials.gov)",
        "Use CONSORT/STROBE/PRISMA checklists for reporting standards",
        "Get IRB/Ethics approval BEFORE collecting any patient data",
        "Power analysis for sample size — underpowered studies waste everyone's time",
        "Report confidence intervals, not just p-values",
        "Consider systematic review protocol (PROSPERO) for literature reviews",
    ],
    "humanities": [
        "Your theoretical framework IS your methodology — develop it carefully",
        "Primary sources should be the backbone — secondary sources provide context",
        "Historiography matters: acknowledge how interpretations have changed over time",
        "Close reading and textual analysis need explicit criteria — don't just interpret freely",
        "Archives may have restricted access — plan visits and permissions early",
        "Interdisciplinary approaches can strengthen humanities research — consider digital humanities tools",
    ],
    "management": [
        "Mixed methods (surveys + interviews) often strengthens business research",
        "Pilot test your survey instrument with at least 30 respondents",
        "Structural Equation Modeling (SEM) requires minimum 200 responses for reliable results",
        "Case study research needs clear protocols — follow Yin's methodology",
        "Industry reports (McKinsey, Deloitte) are not peer-reviewed — use them cautiously",
        "Cronbach's alpha > 0.7 for scale reliability, but also report composite reliability",
    ],
    "engineering": [
        "Simulation results need validation against physical experiments or established benchmarks",
        "Include failure analysis — what didn't work is as important as what did",
        "Use standardized test methods (ISO, ASTM, IEEE) when available",
        "Design of Experiments (DOE) can reduce the number of experiments needed",
        "CAD files and simulation parameters should be documented for reproducibility",
        "Consider sustainability and environmental impact in your design criteria",
    ],
    "social_sciences": [
        "Reflexivity is crucial in qualitative research — acknowledge your positionality",
        "Triangulation strengthens validity — use multiple data sources or methods",
        "Saturation in qualitative research typically occurs around 12-15 interviews",
        "Use NVivo or Atlas.ti for systematic coding of qualitative data",
        "Likert scale data is ordinal — don't treat it as interval without justification",
        "Consider intersectionality — single-variable analyses miss important dynamics",
    ],
    "education": [
        "Action research cycles: Plan → Act → Observe → Reflect → repeat",
        "Pre/post tests need control groups to claim causation",
        "Bloom's taxonomy can structure learning outcome measurements",
        "Mixed methods often works best: test scores (quant) + student interviews (qual)",
        "Consider the Hawthorne effect — students may perform differently when observed",
        "Ethical considerations are heightened with child participants — extra approvals needed",
    ],
    "environmental_science": [
        "Field data collection needs clear sampling protocols — random vs systematic vs stratified",
        "GIS analysis should specify coordinate systems, projections, and data sources",
        "Long-term ecological data may have gaps — document how you handle missing data",
        "Remote sensing data needs ground-truthing validation",
        "Climate modeling requires sensitivity analysis for key parameters",
        "Include spatial and temporal scale explicitly — results may not generalize across scales",
    ],
}


@router.post("/consult")
async def consult(req: ConsultRequest, user: User = Depends(get_current_user)):
    context_parts = []
    if req.field:
        context_parts.append(f"Student's field: {req.field}")
    if req.level:
        context_parts.append(f"Academic level: {req.level}")
    if req.context:
        context_parts.append(f"Context: {req.context}")

    history_text = ""
    if req.conversation_history:
        for msg in req.conversation_history[-6:]:
            role = "Student" if msg.get("role") == "user" else "Advisor"
            history_text += f"\n{role}: {msg.get('content', '')}"

    user_message = ""
    if context_parts:
        user_message += "\n".join(context_parts) + "\n\n"
    if history_text:
        user_message += f"Conversation so far:{history_text}\n\n"
    user_message += f"Student's message: {req.message}"

    api_key = get_api_key("claude")
    model = PROVIDER_MODELS["claude"]
    raw = await _call_anthropic(ADVISOR_SYSTEM_PROMPT, user_message, api_key, model)

    try:
        data = json.loads(raw)
        return data
    except json.JSONDecodeError:
        return {
            "response": raw,
            "recommended_tools": [],
            "follow_up_questions": [],
        }


@router.post("/diagnose")
async def diagnose(req: DiagnoseRequest, user: User = Depends(get_current_user)):
    prompt = (
        "Quickly categorize this student's research problem. Return JSON:\n"
        '{"category": "topic_selection|methodology|literature|data_analysis|writing|motivation|defense|technical",'
        '"severity": "minor|moderate|significant",'
        '"recommended_tools": [{"name":"...", "path":"...", "reason":"..."}],'
        '"quick_tips": ["tip1", "tip2", "tip3"]}'
        f"\n\nField: {req.field}\nProblem: {req.message}"
    )
    api_key = get_api_key("claude")
    model = PROVIDER_MODELS["claude"]
    raw = await _call_anthropic(
        "You are a research problem diagnostician. Return ONLY valid JSON.", prompt, api_key, model
    )
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"category": "unknown", "severity": "moderate", "recommended_tools": [], "quick_tips": [raw[:200]]}


@router.get("/tips/{field}")
async def get_tips(field: str, user: User = Depends(get_current_user)):
    field_key = field.lower().replace(" ", "_").replace("&", "and")
    for key, tips in FIELD_TIPS.items():
        if key in field_key or field_key in key:
            return {"field": field, "tips": tips}
    return {"field": field, "tips": ["No specific tips for this field yet. Try the iKo Advisor chat for personalized guidance."]}
