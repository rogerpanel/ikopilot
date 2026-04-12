"""
AI Text Humanizer — Writefull-style module for academic text polishing.

Removes AI writing patterns, improves academic English, and reduces
plagiarism/AI detection scores. Reusable across the entire application.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import get_current_user
from database import User
from llm_proxy import get_api_key, PROVIDER_MODELS
import httpx

router = APIRouter(prefix="/api/humanizer", tags=["humanizer"])

HUMANIZER_SYSTEM_PROMPT = """You are an expert academic writing editor. Your job is to revise AI-generated text to sound naturally human while maintaining academic quality.

RULES:
1. REMOVE these overused AI phrases — replace with natural alternatives:
   - "delve/delves into" → "examines", "explores", "investigates"
   - "crucial/critical" → "important", "significant", "key"
   - "Furthermore/Moreover" → vary: "Additionally", "Also", "Beyond this", or just start a new sentence
   - "It is worth noting" → remove entirely or rephrase
   - "In conclusion" → "To summarize", "Overall", "This study shows"
   - "plays a pivotal role" → "is important for", "contributes to"
   - "a comprehensive analysis" → "an analysis", "a detailed review"
   - "shed light on" → "clarify", "explain", "reveal"
   - "the findings suggest" → "these results indicate", "the data shows"
   - "robust" (when not statistical) → "strong", "reliable", "effective"
   - "leverage" → "use", "apply", "employ"
   - "paradigm" (when unnecessary) → "approach", "framework", "model"
   - "multifaceted" → "complex", "varied", "diverse"
   - "underscore" → "highlight", "emphasize", "show"

2. IMPROVE sentence structure:
   - Break overly long sentences (>40 words) into two
   - Mix sentence lengths: some short (8-12 words), some medium (15-25), few long
   - Start sentences differently — not always with "The" or "This"
   - Use active voice more (but keep some passive for academic style)
   - Add occasional rhetorical questions or direct statements

3. ACADEMIC quality:
   - Ensure proper hedging ("suggests" not "proves", "indicates" not "shows definitively")
   - Use discipline-specific terminology where appropriate
   - Maintain formal but not stiff tone
   - Check logical transitions between paragraphs
   - Ensure each paragraph has a clear topic sentence

4. OUTPUT FORMAT:
   - Return the revised text directly
   - After the revised text, add a section "--- CHANGES MADE ---" listing the key changes

Do NOT change the meaning, data, or citations. Only improve the writing quality."""


class HumanizeRequest(BaseModel):
    text: str
    intensity: str = "medium"  # "light", "medium", "heavy"
    focus: str = "all"  # "all", "ai_patterns", "grammar", "flow", "hedging"


class HumanizeResponse(BaseModel):
    original_length: int
    revised_text: str
    changes_summary: str
    word_count_original: int
    word_count_revised: int


@router.post("/humanize", response_model=HumanizeResponse)
async def humanize_text(
    req: HumanizeRequest,
    user: User = Depends(get_current_user),
):
    """Humanize AI-generated academic text."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    if len(req.text) > 50000:
        raise HTTPException(status_code=400, detail="Text too long. Maximum 50,000 characters. Process in sections.")

    # Adjust prompt based on intensity
    intensity_instructions = {
        "light": "\nINTENSITY: Light — only fix the most obvious AI patterns. Keep most of the original phrasing.",
        "medium": "\nINTENSITY: Medium — fix AI patterns and improve flow, but maintain the overall structure.",
        "heavy": "\nINTENSITY: Heavy — substantially revise for natural human academic writing. Restructure sentences freely.",
    }

    focus_instructions = {
        "all": "",
        "ai_patterns": "\nFOCUS: Only remove AI-typical phrases and patterns. Don't change grammar or flow.",
        "grammar": "\nFOCUS: Only fix grammar, spelling, and punctuation. Don't change phrasing.",
        "flow": "\nFOCUS: Only improve logical flow and transitions between sentences/paragraphs.",
        "hedging": "\nFOCUS: Only adjust hedging language — make claims appropriately cautious for academic writing.",
    }

    system = (
        HUMANIZER_SYSTEM_PROMPT +
        intensity_instructions.get(req.intensity, "") +
        focus_instructions.get(req.focus, "")
    )

    api_key = get_api_key("claude")
    model = PROVIDER_MODELS["claude"]

    payload = {
        "model": model,
        "max_tokens": 8192,
        "system": system,
        "messages": [{"role": "user", "content": f"Please revise this text:\n\n{req.text}"}],
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
            raise HTTPException(status_code=502, detail=f"Humanizer error: {res.text[:200]}")

        data = res.json()
        full_response = data.get("content", [{}])[0].get("text", "")

    # Split revised text from changes summary
    if "--- CHANGES MADE ---" in full_response:
        parts = full_response.split("--- CHANGES MADE ---", 1)
        revised = parts[0].strip()
        changes = parts[1].strip()
    else:
        revised = full_response.strip()
        changes = "Changes applied inline."

    return HumanizeResponse(
        original_length=len(req.text),
        revised_text=revised,
        changes_summary=changes,
        word_count_original=len(req.text.split()),
        word_count_revised=len(revised.split()),
    )


@router.post("/detect-ai-patterns")
async def detect_ai_patterns(
    text: str,
    user: User = Depends(get_current_user),
):
    """Scan text for common AI writing patterns and flag them."""
    import re

    AI_PATTERNS = [
        (r"\bdelve[sd]?\b", "delve/delves"),
        (r"\bcrucial\b", "crucial"),
        (r"\bpivotal\b", "pivotal"),
        (r"\bFurthermore\b", "Furthermore"),
        (r"\bMoreover\b", "Moreover"),
        (r"\bIt is worth noting\b", "It is worth noting"),
        (r"\bIn conclusion\b", "In conclusion"),
        (r"\bshed light on\b", "shed light on"),
        (r"\brobust\b", "robust"),
        (r"\bleverage[sd]?\b", "leverage"),
        (r"\bmultifaceted\b", "multifaceted"),
        (r"\bunderscore[sd]?\b", "underscore"),
        (r"\bparadigm\b", "paradigm"),
        (r"\bcomprehensive analysis\b", "comprehensive analysis"),
        (r"\bplays a (?:pivotal|crucial|critical) role\b", "plays a [pivotal/crucial] role"),
        (r"\bin the realm of\b", "in the realm of"),
        (r"\btapestry\b", "tapestry"),
        (r"\blandscape\b", "landscape (overused)"),
        (r"\bholistic\b", "holistic"),
        (r"\bseamless(?:ly)?\b", "seamless/seamlessly"),
    ]

    findings = []
    for pattern, label in AI_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            findings.append({
                "pattern": label,
                "count": len(matches),
                "severity": "high" if len(matches) > 2 else "medium" if len(matches) > 1 else "low",
            })

    # Sentence structure analysis
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 10]

    long_sentences = sum(1 for s in sentences if len(s.split()) > 35)
    starts_with_the = sum(1 for s in sentences if s.lower().startswith("the "))
    starts_with_this = sum(1 for s in sentences if s.lower().startswith("this "))

    total = len(sentences) if sentences else 1
    ai_score = min(100, (len(findings) * 8 + long_sentences * 5 +
                         (starts_with_the / total * 30) +
                         (starts_with_this / total * 20)))

    return {
        "ai_patterns_found": findings,
        "total_sentences": len(sentences),
        "long_sentences": long_sentences,
        "repetitive_starts": {
            "the": starts_with_the,
            "this": starts_with_this,
        },
        "estimated_ai_score": round(ai_score),
        "recommendation": (
            "Low risk — text appears mostly human-written" if ai_score < 30 else
            "Medium risk — some AI patterns detected. Run the humanizer." if ai_score < 60 else
            "High risk — significant AI patterns. Strongly recommend humanizing."
        ),
    }
