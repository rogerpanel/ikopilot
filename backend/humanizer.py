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

2. WRITEFULL-STYLE WORD CORRECTIONS:
   - "While" at the start of a sentence used as a concession (not temporal) → "Although"
     Example: "While this approach works..." → "Although this approach works..."
     Keep "While" when it means "during the time that".
   - "via" → "through" or "by means of" (more formal academic English)
     Example: "transmitted via email" → "transmitted through email"
   - "gotten" → "obtained" or "received"
     Example: "has gotten results" → "has obtained results"
   - "a lot of" → "numerous", "several", "many" (context-dependent)
     Example: "a lot of studies" → "numerous studies"
   - "big" → "substantial", "significant", "considerable"
     Example: "a big difference" → "a substantial difference"
   - "get" → "obtain", "acquire", "achieve" (context-dependent)
     Example: "get access to" → "obtain access to"; "get results" → "achieve results"
   - "show" (as a verb presenting evidence) → "demonstrate", "illustrate", "indicate"
     Example: "the results show" → "the results demonstrate"
     Keep "show" in informal or direct statements where alternatives sound forced.
   - "things" → replace with the specific noun it refers to (e.g., "factors", "elements", "aspects", "variables")
     Example: "several things affect..." → "several factors affect..."
   - "stuff" → never use in academic writing; replace with the specific noun
   - "kind of" / "sort of" → "somewhat", "to some extent", or remove entirely
     Example: "This is kind of important" → "This is somewhat important" or "This is important"

3. EXAGGERATION CORRECTIONS:
   - "very unique" → "unique" (unique is absolute — something is either unique or it is not)
   - "completely destroyed" → "destroyed" (destroyed is already absolute)
   - "totally agree" → "agree" or "strongly concur"
   - "extremely important" → "important" or "of considerable importance"
   - "absolutely essential" → "essential" (essential is already absolute)
   - Flag and remove redundant intensifiers before absolute adjectives (perfect, complete, total, absolute, unique, impossible, infinite, etc.)
   - Flag superlatives without evidence: "the best", "the most important", "the greatest" — these require evidence or hedging ("among the most important", "one of the best-known")

4. ARTICLE AND SENTENCE RULES:
   - Fix missing articles: "In study..." → "In the study...", "Research shows..." → "The research shows..." (when referring to a specific study/analysis)
   - Fix excessive article use where none is needed
   - Target average sentence length: 15-25 words
   - Flag and split sentences over 40 words into two or more shorter sentences
   - Flag sentences under 8 words in body text — suggest combining with adjacent sentences
   - Ensure paragraphs contain 3-7 sentences. Split overly long paragraphs; merge very short ones.

5. EQUATION FORMATTING GUIDANCE:
   - When mathematical expressions appear as plain text (e.g., "y = mx + b"), suggest or apply LaTeX formatting
   - Standalone equations should be centered using display math: \\begin{equation} ... \\end{equation}
   - Number equations that are referenced later in the text
   - Inline math should use $...$ for simple expressions
   - Complex inline expressions (fractions, summations, integrals, multi-line) should be converted to display math
   - Example: plain text "E = mc^2" → $E = mc^2$ (inline) or \\begin{equation} E = mc^2 \\end{equation} (display)

6. IMPROVE sentence structure:
   - Break overly long sentences (>40 words) into two
   - Mix sentence lengths: some short (8-12 words), some medium (15-25), few long
   - Start sentences differently — not always with "The" or "This"
   - Use active voice more (but keep some passive for academic style)
   - Add occasional rhetorical questions or direct statements

7. ACADEMIC quality:
   - Ensure proper hedging ("suggests" not "proves", "indicates" not "shows definitively")
   - Use discipline-specific terminology where appropriate
   - Maintain formal but not stiff tone
   - Check logical transitions between paragraphs
   - Ensure each paragraph has a clear topic sentence

8. OUTPUT FORMAT:
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
        # Original AI-phrase patterns
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
        # Writefull-style word patterns
        (r"(?:^|(?<=\.\s))While\b", "\"While\" at sentence start (potential concession — consider \"Although\")"),
        (r"\bvia\b", "\"via\" usage (prefer \"through\" or \"by means of\")"),
        (r"\bgotten\b", "\"gotten\" (prefer \"obtained\" or \"received\")"),
        (r"\ba lot of\b", "\"a lot of\" (prefer \"numerous\", \"several\", \"many\")"),
        (r"\bstuff\b", "\"stuff\" (too informal for academic writing)"),
        (r"\bkind of\b", "\"kind of\" (prefer \"somewhat\" or \"to some extent\")"),
        (r"\bsort of\b", "\"sort of\" (prefer \"somewhat\" or \"to some extent\")"),
        # Exaggeration patterns
        (r"\bvery unique\b", "\"very unique\" (unique is absolute)"),
        (r"\bcompletely destroyed\b", "\"completely destroyed\" (destroyed is absolute)"),
        (r"\btotally agree\b", "\"totally agree\" (prefer \"agree\" or \"strongly concur\")"),
        (r"\bextremely important\b", "\"extremely important\" (prefer \"important\" or \"of considerable importance\")"),
        (r"\babsolutely essential\b", "\"absolutely essential\" (essential is absolute)"),
        # Missing articles before common academic nouns
        (r"(?:^|(?<=\.\s))[Ii]n study\b", "missing article: \"In study\" → \"In the study\""),
        (r"(?:^|(?<=\.\s))[Ii]n research\b", "missing article: \"In research\" → \"In the research\""),
        (r"(?:^|(?<=\.\s))[Ii]n analysis\b", "missing article: \"In analysis\" → \"In the analysis\""),
        (r"\b[Oo]f study\b", "missing article: \"of study\" → \"of the study\""),
        (r"\b[Oo]f research\b", "missing article: \"of research\" → \"of the research\""),
        (r"\b[Oo]f analysis\b", "missing article: \"of analysis\" → \"of the analysis\""),
        # Plain text equations (potential LaTeX candidates)
        (r"(?<![$\\])\b[a-zA-Z]\s*=\s*[a-zA-Z0-9]", "plain text equation (consider LaTeX formatting)"),
        (r"(?<![$\\])\b[a-zA-Z]\s*\+\s*[a-zA-Z]", "plain text math expression (consider LaTeX formatting)"),
        (r"\^[0-9{]", "plain text exponent (consider LaTeX formatting)"),
    ]

    findings = []
    for pattern, label in AI_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE | re.MULTILINE)
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

    # New sentence-length checks
    over_40_words = []
    under_8_words = []
    for i, s in enumerate(sentences):
        wc = len(s.split())
        if wc > 40:
            over_40_words.append({"sentence_index": i, "word_count": wc, "preview": s[:80] + "..."})
        elif wc < 8 and wc > 0:
            under_8_words.append({"sentence_index": i, "word_count": wc, "preview": s.strip()})

    if over_40_words:
        findings.append({
            "pattern": "sentences over 40 words (suggest splitting)",
            "count": len(over_40_words),
            "severity": "high" if len(over_40_words) > 3 else "medium",
            "details": over_40_words,
        })

    if under_8_words:
        findings.append({
            "pattern": "sentences under 8 words in body text (suggest combining)",
            "count": len(under_8_words),
            "severity": "low",
            "details": under_8_words,
        })

    # Paragraph analysis
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    short_paragraphs = []
    long_paragraphs = []
    for i, p in enumerate(paragraphs):
        p_sentences = [s.strip() for s in re.split(r'[.!?]+', p) if len(s.strip()) > 10]
        if len(p_sentences) < 3 and len(p_sentences) > 0:
            short_paragraphs.append({"paragraph_index": i, "sentence_count": len(p_sentences)})
        elif len(p_sentences) > 7:
            long_paragraphs.append({"paragraph_index": i, "sentence_count": len(p_sentences)})

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
        "sentence_length_issues": {
            "over_40_words": len(over_40_words),
            "under_8_words": len(under_8_words),
        },
        "paragraph_issues": {
            "too_short": short_paragraphs,
            "too_long": long_paragraphs,
        },
        "estimated_ai_score": round(ai_score),
        "recommendation": (
            "Low risk — text appears mostly human-written" if ai_score < 30 else
            "Medium risk — some AI patterns detected. Run the humanizer." if ai_score < 60 else
            "High risk — significant AI patterns. Strongly recommend humanizing."
        ),
    }
