"""
iKo Defense — Thesis defense preparation module.

Helps students prepare for thesis/dissertation defense by generating
likely examiner questions, running mock defense sessions, and creating
presentation outlines.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from database import User
from llm_proxy import get_api_key, PROVIDER_MODELS
from orchestrator import _call_anthropic, _call_openai_compat


router = APIRouter(prefix="/api/defense", tags=["defense"])


# ---------- System Prompts ----------

QUESTION_GENERATOR_SYSTEM_PROMPT = (
    "You are an experienced thesis examiner and defense committee member. "
    "Generate realistic defense questions that examiners would ask about this research. "
    "Categorize by type, rate difficulty, and provide answer frameworks. "
    "Be thorough — cover weak points the student should prepare for. "
    "For PhD level, be more rigorous. For Bachelor's, focus on fundamentals.\n\n"
    "Return your response as valid JSON with the following structure:\n"
    "{\n"
    '  "questions": [\n'
    "    {\n"
    '      "question": "The question text",\n'
    '      "category": "conceptual" | "methodological" | "results" | "critical" | "extension",\n'
    '      "difficulty": "easy" | "medium" | "hard",\n'
    '      "answer_framework": ["bullet point 1", "bullet point 2", ...]\n'
    "    }\n"
    "  ]\n"
    "}\n\n"
    "Generate 10-15 questions with the following category distribution:\n"
    "- Conceptual questions: why this topic, theoretical framework justification\n"
    "- Methodological questions: why this method, sampling concerns, validity\n"
    "- Results questions: alternative interpretations, generalizability\n"
    "- Critical questions: limitations, what would you do differently\n"
    "- Extension questions: future research, practical applications\n\n"
    "Each answer framework should contain 3-5 bullet points of what to cover "
    "(not a full answer — just the key points the student should address)."
)

MOCK_SESSION_SYSTEM_PROMPTS = {
    "supportive": (
        "You are a friendly and supportive thesis examiner helping the student "
        "articulate their research better. You ask probing but encouraging questions. "
        "When the student gives an answer, you acknowledge what they got right before "
        "gently pointing out areas that could be stronger. Your goal is to build the "
        "student's confidence while ensuring they can defend their work clearly."
    ),
    "critical": (
        "You are a rigorous thesis examiner who probes for weaknesses and gaps in "
        "the research. You ask pointed questions about methodology, validity, and "
        "interpretation. You are fair but demanding — you expect precise answers "
        "backed by evidence. When something is vague, you press for specifics. "
        "You challenge unsupported claims and look for logical inconsistencies."
    ),
    "devil's_advocate": (
        "You are a devil's advocate examiner who challenges every assumption and "
        "pushes the student to defend their choices rigorously. You take the opposite "
        "position on key decisions — if they chose qualitative methods, you ask why "
        "not quantitative. If they claim significance, you propose alternative "
        "explanations. Your goal is to stress-test the research from every angle. "
        "You are not hostile, but you are relentless in questioning assumptions."
    ),
}

MOCK_SESSION_BASE_PROMPT = (
    "You are playing the role of a thesis defense examiner. "
    "The student has provided their thesis content below. "
    "Based on the examiner style assigned to you, respond to the student's answer "
    "to the current question.\n\n"
    "Your response MUST be valid JSON with the following structure:\n"
    "{\n"
    '  "examiner_response": "Your reaction to their answer — acknowledge strengths, '
    'identify gaps, challenge where appropriate based on your examiner style",\n'
    '  "feedback": "Constructive feedback on the quality of their answer — what was '
    'good, what was missing, how to improve",\n'
    '  "follow_up_question": "A natural follow-up question based on their answer '
    'that goes deeper into the topic"\n'
    "}"
)

PRESENTATION_OUTLINE_SYSTEM_PROMPT = (
    "You are an expert academic presentation coach who helps students create "
    "effective thesis defense presentations. You understand slide design principles, "
    "time management, and what defense committees expect to see.\n\n"
    "Generate a complete defense presentation outline as valid JSON with the "
    "following structure:\n"
    "{\n"
    '  "total_slides": <number>,\n'
    '  "sections": [\n'
    "    {\n"
    '      "section_title": "Section name",\n'
    '      "time_minutes": <allocated minutes>,\n'
    '      "slides": [\n'
    "        {\n"
    '          "slide_number": <number>,\n'
    '          "title": "Slide title",\n'
    '          "bullet_points": ["point 1", "point 2", ...],\n'
    '          "speaker_notes": "What to say during this slide",\n'
    '          "suggested_visual": "Description of a figure, chart, or diagram for this slide"\n'
    "        }\n"
    "      ]\n"
    "    }\n"
    "  ],\n"
    '  "tips": ["presentation tip 1", "tip 2", ...]\n'
    "}\n\n"
    "Guidelines:\n"
    "- Allocate roughly 1-2 minutes per slide\n"
    "- Leave time for Q&A (not included in slides but noted in tips)\n"
    "- Include an opening slide, outline slide, and thank you / questions slide\n"
    "- Speaker notes should be conversational — what the student actually says\n"
    "- Suggested visuals should be specific and actionable\n"
    "- Adapt bullet point density to the requested slide style"
)


# ---------- Request Schemas ----------

class DefenseRequest(BaseModel):
    thesis_title: str
    abstract: str
    methodology_summary: str = ""
    key_findings: str = ""
    limitations: str = ""
    field: str = ""
    level: str = "Master's thesis"  # or PhD dissertation, Bachelor's project
    provider: str = "claude"


class MockSessionRequest(BaseModel):
    thesis_content: str
    examiner_style: str  # "supportive", "critical", "devil's_advocate"
    question: str
    provider: str = "claude"


class PresentationOutlineRequest(BaseModel):
    thesis_title: str
    abstract: str
    time_limit: int  # minutes
    slide_style: str = "detailed"  # "minimal", "detailed", "visual"
    provider: str = "claude"


# ---------- Helpers ----------

def _build_question_gen_message(req: DefenseRequest) -> str:
    """Build the user message for the question generator from request fields."""
    parts = [
        f"Thesis Title: {req.thesis_title}",
        f"Academic Level: {req.level}",
        f"Abstract:\n{req.abstract}",
    ]

    if req.field:
        parts.append(f"Field / Discipline: {req.field}")
    if req.methodology_summary:
        parts.append(f"Methodology Summary:\n{req.methodology_summary}")
    if req.key_findings:
        parts.append(f"Key Findings:\n{req.key_findings}")
    if req.limitations:
        parts.append(f"Acknowledged Limitations:\n{req.limitations}")

    return "\n\n".join(parts)


def _build_mock_session_message(req: MockSessionRequest) -> str:
    """Build the user message for the mock defense session."""
    return (
        f"=== Thesis Content ===\n{req.thesis_content}\n"
        f"=== End of Thesis Content ===\n\n"
        f"Current question being discussed: {req.question}\n\n"
        f"Student's answer to the question:\n{req.question}"
    )


def _build_presentation_message(req: PresentationOutlineRequest) -> str:
    """Build the user message for the presentation outline generator."""
    style_descriptions = {
        "minimal": (
            "Slide style: MINIMAL — very few words per slide (3-5 bullet points max, "
            "each under 8 words). The presenter speaks most content. "
            "Slides serve as visual anchors only."
        ),
        "detailed": (
            "Slide style: DETAILED — more text on slides (5-7 bullet points, "
            "each can be a short sentence). Good for committees who want to "
            "read along. Balance text with whitespace."
        ),
        "visual": (
            "Slide style: VISUAL — diagram-heavy with minimal text. "
            "Each slide should center around a figure, chart, or diagram. "
            "Bullet points are kept to 2-3 at most. Emphasize suggested "
            "visualizations for every slide."
        ),
    }

    style_desc = style_descriptions.get(
        req.slide_style,
        style_descriptions["detailed"],
    )

    return (
        f"Thesis Title: {req.thesis_title}\n\n"
        f"Abstract:\n{req.abstract}\n\n"
        f"Time Limit: {req.time_limit} minutes\n\n"
        f"{style_desc}"
    )


def _parse_json_response(response_text: str) -> dict:
    """Extract and parse JSON from an LLM response that may contain markdown fences."""
    import json

    text = response_text.strip()

    # Try to extract JSON from markdown code fences
    if "```json" in text:
        start = text.index("```json") + len("```json")
        end = text.index("```", start)
        text = text[start:end].strip()
    elif "```" in text:
        start = text.index("```") + len("```")
        end = text.index("```", start)
        text = text[start:end].strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # If JSON parsing fails, return the raw text wrapped in a dict
        return {"raw_response": response_text}


# ---------- Endpoints ----------

@router.post("/generate-questions")
async def generate_defense_questions(
    req: DefenseRequest,
    user: User = Depends(get_current_user),
):
    """Generate likely examiner questions for a thesis defense."""
    if not req.thesis_title.strip():
        raise HTTPException(status_code=400, detail="Thesis title is required")
    if not req.abstract.strip():
        raise HTTPException(status_code=400, detail="Abstract is required")

    # Build level-specific system prompt adjustment
    level_adjustments = {
        "PhD dissertation": (
            "\n\nThis is a PhD dissertation defense. Be especially rigorous. "
            "Include questions about original contribution to knowledge, "
            "epistemological positioning, and methodological sophistication. "
            "Expect the student to demonstrate deep expertise."
        ),
        "Master's thesis": (
            "\n\nThis is a Master's thesis defense. Balance rigor with "
            "reasonable expectations. Focus on demonstrating understanding "
            "of methodology, clear analysis, and connection to existing literature."
        ),
        "Bachelor's project": (
            "\n\nThis is a Bachelor's project defense. Focus on fundamentals: "
            "understanding of the research process, basic methodology, "
            "ability to interpret results, and awareness of limitations. "
            "Keep questions accessible but still academically meaningful."
        ),
    }

    system_prompt = QUESTION_GENERATOR_SYSTEM_PROMPT + level_adjustments.get(
        req.level, level_adjustments["Master's thesis"]
    )

    user_message = _build_question_gen_message(req)

    provider = req.provider if req.provider in PROVIDER_MODELS else "claude"
    api_key = get_api_key(provider)
    model = PROVIDER_MODELS[provider]

    if provider == "claude":
        response_text = await _call_anthropic(system_prompt, user_message, api_key, model)
    else:
        response_text = await _call_openai_compat(system_prompt, user_message, api_key, model, provider)

    parsed = _parse_json_response(response_text)

    return {
        "thesis_title": req.thesis_title,
        "level": req.level,
        "field": req.field,
        "questions": parsed.get("questions", []),
        "raw_response": response_text if "raw_response" in parsed else None,
        "model": model,
    }


@router.post("/mock-session")
async def mock_defense_session(
    req: MockSessionRequest,
    user: User = Depends(get_current_user),
):
    """Simulate a defense examiner responding to a student's answer."""
    if not req.thesis_content.strip():
        raise HTTPException(status_code=400, detail="Thesis content is required")
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question / answer is required")

    # Validate examiner style
    if req.examiner_style not in MOCK_SESSION_SYSTEM_PROMPTS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid examiner style. Choose from: {', '.join(MOCK_SESSION_SYSTEM_PROMPTS.keys())}",
        )

    style_prompt = MOCK_SESSION_SYSTEM_PROMPTS[req.examiner_style]
    system_prompt = f"{style_prompt}\n\n{MOCK_SESSION_BASE_PROMPT}"

    user_message = _build_mock_session_message(req)

    provider = req.provider if req.provider in PROVIDER_MODELS else "claude"
    api_key = get_api_key(provider)
    model = PROVIDER_MODELS[provider]

    if provider == "claude":
        response_text = await _call_anthropic(system_prompt, user_message, api_key, model)
    else:
        response_text = await _call_openai_compat(system_prompt, user_message, api_key, model, provider)

    parsed = _parse_json_response(response_text)

    return {
        "examiner_style": req.examiner_style,
        "examiner_response": parsed.get("examiner_response", ""),
        "feedback": parsed.get("feedback", ""),
        "follow_up_question": parsed.get("follow_up_question", ""),
        "raw_response": response_text if "raw_response" in parsed else None,
        "model": model,
    }


@router.post("/presentation-outline")
async def generate_presentation_outline(
    req: PresentationOutlineRequest,
    user: User = Depends(get_current_user),
):
    """Generate a defense presentation outline with slide content and speaker notes."""
    if not req.thesis_title.strip():
        raise HTTPException(status_code=400, detail="Thesis title is required")
    if not req.abstract.strip():
        raise HTTPException(status_code=400, detail="Abstract is required")
    if req.time_limit < 5 or req.time_limit > 120:
        raise HTTPException(
            status_code=400,
            detail="Time limit must be between 5 and 120 minutes",
        )

    # Validate slide style
    valid_styles = ("minimal", "detailed", "visual")
    if req.slide_style not in valid_styles:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid slide style. Choose from: {', '.join(valid_styles)}",
        )

    system_prompt = PRESENTATION_OUTLINE_SYSTEM_PROMPT
    user_message = _build_presentation_message(req)

    provider = req.provider if req.provider in PROVIDER_MODELS else "claude"
    api_key = get_api_key(provider)
    model = PROVIDER_MODELS[provider]

    if provider == "claude":
        response_text = await _call_anthropic(system_prompt, user_message, api_key, model)
    else:
        response_text = await _call_openai_compat(system_prompt, user_message, api_key, model, provider)

    parsed = _parse_json_response(response_text)

    return {
        "thesis_title": req.thesis_title,
        "time_limit": req.time_limit,
        "slide_style": req.slide_style,
        "total_slides": parsed.get("total_slides", 0),
        "sections": parsed.get("sections", []),
        "tips": parsed.get("tips", []),
        "raw_response": response_text if "raw_response" in parsed else None,
        "model": model,
    }
