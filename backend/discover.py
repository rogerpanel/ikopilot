"""
iKo Discover — Research discovery tools with AI-powered gap analysis,
academic debate simulation, and citation graph generation.
"""

import asyncio
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db, User, Project
from auth import get_current_user
from config import settings
from llm_proxy import get_api_key, PROVIDER_MODELS
from orchestrator import _call_anthropic

import httpx

router = APIRouter(prefix="/api/discover", tags=["discover"])


# ---------- System Prompts ----------

GAP_DETECTOR_SYSTEM_PROMPT = (
    "You are a research gap analysis expert. Given a summary of existing literature "
    "in a field, identify 5-10 specific research gaps. For each gap, provide: "
    "1) Gap description, 2) Why it matters, 3) A specific research question to "
    "address it, 4) Suggested methodology, 5) Confidence score (how certain you are "
    "this is a real gap, as a float between 0.0 and 1.0). "
    "Format your response as a JSON array of objects with keys: "
    '"type", "description", "why_it_matters", "research_question", '
    '"suggested_methodology", "confidence". '
    'The "type" field must be one of: "unstudied_intersection", "methodological", '
    '"population", "temporal", "theoretical". '
    "Return ONLY the JSON array, no markdown fences, no extra text."
)

DEBATE_SYSTEM_PROMPT = (
    "You are a neutral academic debate moderator. Analyze two opposing research "
    "positions on a given topic. Present each side's arguments with their evidence, "
    "assess evidence quality (strong/moderate/weak), identify agreements and "
    "contradictions, and provide a balanced synthesis. Be objective and academic. "
    "Format your response as a JSON object with keys: "
    '"paper_a_claims" (array of objects with "claim", "evidence", "evidence_quality"), '
    '"paper_b_claims" (array of objects with "claim", "evidence", "evidence_quality"), '
    '"points_of_agreement" (array of strings), '
    '"points_of_contradiction" (array of objects with "topic", "paper_a_position", "paper_b_position"), '
    '"synthesis" (string — what we can conclude from both), '
    '"future_research_implications" (array of strings). '
    "Return ONLY the JSON object, no markdown fences, no extra text."
)


# ---------- Request / Response Schemas ----------

class FindGapsRequest(BaseModel):
    topic: str
    papers_summary: str
    field: str


class GapItem(BaseModel):
    type: str
    description: str
    why_it_matters: str
    research_question: str
    suggested_methodology: str
    confidence: float


class FindGapsResponse(BaseModel):
    topic: str
    field: str
    gaps: list[GapItem]
    total_gaps: int


class DebateRequest(BaseModel):
    paper_a: str
    paper_b: str
    topic: str


class ClaimDetail(BaseModel):
    claim: str
    evidence: str
    evidence_quality: str


class ContradictionPoint(BaseModel):
    topic: str
    paper_a_position: str
    paper_b_position: str


class DebateResponse(BaseModel):
    topic: str
    paper_a_claims: list[ClaimDetail]
    paper_b_claims: list[ClaimDetail]
    points_of_agreement: list[str]
    points_of_contradiction: list[ContradictionPoint]
    synthesis: str
    future_research_implications: list[str]


class GraphNode(BaseModel):
    id: str
    title: str
    authors: list[str]
    year: int | None
    citation_count: int | None = None


class GraphEdge(BaseModel):
    source: str
    target: str
    relationship: str  # "cites", "shared_author", "shared_methodology", "same_subfield"
    weight: float = 1.0


class CitationGraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    project_id: int


# ---------- Helpers ----------

def _parse_json_response(text: str):
    """Extract and parse JSON from an LLM response, handling markdown fences."""
    cleaned = text.strip()
    # Strip markdown code fences if present
    if cleaned.startswith("```"):
        # Remove opening fence (possibly ```json)
        first_newline = cleaned.index("\n")
        cleaned = cleaned[first_newline + 1:]
        # Remove closing fence
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].rstrip()
    return json.loads(cleaned)


async def _get_paper_references(openalex_id: str) -> list[str]:
    """Get papers that this paper cites."""
    url = f"https://api.openalex.org/works/{openalex_id}"
    params = {"select": "referenced_works"}
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(
            url,
            params=params,
            headers={"User-Agent": "iKopilot/1.0"},
        )
        if res.status_code == 200:
            return res.json().get("referenced_works", [])
    return []


async def _get_paper_metadata(openalex_id: str) -> dict | None:
    """Fetch basic metadata for a single paper from OpenAlex."""
    url = f"https://api.openalex.org/works/{openalex_id}"
    params = {
        "select": "id,title,authorships,publication_year,cited_by_count,concepts",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(
            url,
            params=params,
            headers={"User-Agent": "iKopilot/1.0"},
        )
        if res.status_code != 200:
            return None
        return res.json()


# ---------- 1. Auto-Gap Detector ----------

@router.post("/find-gaps", response_model=FindGapsResponse)
async def find_gaps(
    req: FindGapsRequest,
    user: User = Depends(get_current_user),
):
    """
    Analyze a literature review summary and identify research gaps.

    Uses Claude to find unstudied intersections, methodological gaps,
    population gaps, temporal gaps, and theoretical gaps.
    """
    api_key = get_api_key("claude")
    model = PROVIDER_MODELS["claude"]

    user_message = (
        f"Topic: {req.topic}\n"
        f"Field: {req.field}\n\n"
        f"Literature Summary:\n{req.papers_summary}"
    )

    raw_response = await _call_anthropic(
        GAP_DETECTOR_SYSTEM_PROMPT,
        user_message,
        api_key,
        model,
    )

    # Parse the JSON array from the LLM response
    try:
        gaps_data = _parse_json_response(raw_response)
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(
            status_code=502,
            detail="Failed to parse gap analysis from AI response. Please try again.",
        )

    if not isinstance(gaps_data, list):
        raise HTTPException(
            status_code=502,
            detail="AI returned unexpected format. Expected a list of gaps.",
        )

    # Validate and clamp confidence scores
    valid_types = {
        "unstudied_intersection",
        "methodological",
        "population",
        "temporal",
        "theoretical",
    }
    gaps = []
    for item in gaps_data:
        gap_type = item.get("type", "methodological")
        if gap_type not in valid_types:
            gap_type = "methodological"
        confidence = item.get("confidence", 0.5)
        if not isinstance(confidence, (int, float)):
            confidence = 0.5
        confidence = max(0.0, min(1.0, float(confidence)))

        gaps.append(GapItem(
            type=gap_type,
            description=item.get("description", ""),
            why_it_matters=item.get("why_it_matters", ""),
            research_question=item.get("research_question", ""),
            suggested_methodology=item.get("suggested_methodology", ""),
            confidence=confidence,
        ))

    return FindGapsResponse(
        topic=req.topic,
        field=req.field,
        gaps=gaps,
        total_gaps=len(gaps),
    )


# ---------- 2. Debate Mode ----------

@router.post("/debate", response_model=DebateResponse)
async def debate(
    req: DebateRequest,
    user: User = Depends(get_current_user),
):
    """
    Generate a structured academic debate between two contradicting papers.

    Analyzes claims, evidence quality, agreements, contradictions, and
    provides a balanced synthesis with future research implications.
    """
    api_key = get_api_key("claude")
    model = PROVIDER_MODELS["claude"]

    user_message = (
        f"Topic of debate: {req.topic}\n\n"
        f"--- PAPER A ---\n{req.paper_a}\n\n"
        f"--- PAPER B ---\n{req.paper_b}"
    )

    raw_response = await _call_anthropic(
        DEBATE_SYSTEM_PROMPT,
        user_message,
        api_key,
        model,
    )

    try:
        debate_data = _parse_json_response(raw_response)
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(
            status_code=502,
            detail="Failed to parse debate analysis from AI response. Please try again.",
        )

    if not isinstance(debate_data, dict):
        raise HTTPException(
            status_code=502,
            detail="AI returned unexpected format. Expected a debate object.",
        )

    # Build validated response
    paper_a_claims = [
        ClaimDetail(
            claim=c.get("claim", ""),
            evidence=c.get("evidence", ""),
            evidence_quality=c.get("evidence_quality", "moderate"),
        )
        for c in debate_data.get("paper_a_claims", [])
    ]

    paper_b_claims = [
        ClaimDetail(
            claim=c.get("claim", ""),
            evidence=c.get("evidence", ""),
            evidence_quality=c.get("evidence_quality", "moderate"),
        )
        for c in debate_data.get("paper_b_claims", [])
    ]

    points_of_contradiction = [
        ContradictionPoint(
            topic=p.get("topic", ""),
            paper_a_position=p.get("paper_a_position", ""),
            paper_b_position=p.get("paper_b_position", ""),
        )
        for p in debate_data.get("points_of_contradiction", [])
    ]

    return DebateResponse(
        topic=req.topic,
        paper_a_claims=paper_a_claims,
        paper_b_claims=paper_b_claims,
        points_of_agreement=debate_data.get("points_of_agreement", []),
        points_of_contradiction=points_of_contradiction,
        synthesis=debate_data.get("synthesis", ""),
        future_research_implications=debate_data.get("future_research_implications", []),
    )


# ---------- 3. Citation Graph Data ----------

@router.get("/citation-graph/{project_id}", response_model=CitationGraphResponse)
async def citation_graph(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Build a citation graph from a project's saved citations.

    For each citation pair, identifies relationships:
    - Direct citation links (paper A cites paper B)
    - Shared authors
    - Shared methodology / concepts
    - Same sub-field

    Returns nodes and edges suitable for frontend graph visualization.
    """
    # Load project and its citations
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    files_data = project.context_files_json or []
    citations_entry = next(
        (f for f in files_data if f.get("_type") == "citations"), None
    )
    citations = citations_entry.get("items", []) if citations_entry else []

    if not citations:
        return CitationGraphResponse(nodes=[], edges=[], project_id=project_id)

    # Build nodes
    nodes: list[GraphNode] = []
    for c in citations:
        nodes.append(GraphNode(
            id=c["id"],
            title=c.get("title", "Untitled"),
            authors=c.get("authors", []),
            year=c.get("year"),
            citation_count=c.get("citation_count"),
        ))

    # Collect OpenAlex IDs for reference lookups
    openalex_ids = [
        c["id"] for c in citations
        if c["id"].startswith("https://openalex.org/")
    ]

    # Fetch references and metadata in parallel for all OpenAlex papers
    ref_tasks = {oa_id: _get_paper_references(oa_id) for oa_id in openalex_ids}
    meta_tasks = {oa_id: _get_paper_metadata(oa_id) for oa_id in openalex_ids}

    ref_results: dict[str, list[str]] = {}
    meta_results: dict[str, dict | None] = {}

    if openalex_ids:
        ref_values = await asyncio.gather(
            *[ref_tasks[oa_id] for oa_id in openalex_ids],
            return_exceptions=True,
        )
        meta_values = await asyncio.gather(
            *[meta_tasks[oa_id] for oa_id in openalex_ids],
            return_exceptions=True,
        )
        for oa_id, refs in zip(openalex_ids, ref_values):
            ref_results[oa_id] = refs if isinstance(refs, list) else []
        for oa_id, meta in zip(openalex_ids, meta_values):
            meta_results[oa_id] = meta if isinstance(meta, dict) else None

    # Build a set of all citation IDs for fast lookup
    citation_id_set = {c["id"] for c in citations}

    edges: list[GraphEdge] = []
    seen_edges: set[tuple[str, str, str]] = set()

    def _add_edge(source: str, target: str, relationship: str, weight: float = 1.0):
        key = (source, target, relationship)
        reverse_key = (target, source, relationship)
        if key not in seen_edges and reverse_key not in seen_edges:
            seen_edges.add(key)
            edges.append(GraphEdge(
                source=source,
                target=target,
                relationship=relationship,
                weight=weight,
            ))

    # --- Citation edges: paper A cites paper B ---
    for oa_id in openalex_ids:
        refs = ref_results.get(oa_id, [])
        for ref_id in refs:
            if ref_id in citation_id_set and ref_id != oa_id:
                _add_edge(oa_id, ref_id, "cites")

    # --- Shared-author edges ---
    for i in range(len(citations)):
        authors_i = set(a.lower().strip() for a in citations[i].get("authors", []) if a)
        if not authors_i:
            continue
        for j in range(i + 1, len(citations)):
            authors_j = set(
                a.lower().strip() for a in citations[j].get("authors", []) if a
            )
            shared = authors_i & authors_j
            if shared:
                _add_edge(
                    citations[i]["id"],
                    citations[j]["id"],
                    "shared_author",
                    weight=len(shared),
                )

    # --- Concept / sub-field edges from OpenAlex metadata ---
    # Extract top-level concepts for each paper
    paper_concepts: dict[str, set[str]] = {}
    for oa_id in openalex_ids:
        meta = meta_results.get(oa_id)
        if not meta:
            continue
        concepts = meta.get("concepts", []) or []
        # Keep concepts with relevance score >= 0.5
        top_concepts = set()
        for concept in concepts:
            score = concept.get("score", 0) or 0
            if score >= 0.5:
                top_concepts.add(concept.get("display_name", "").lower())
        paper_concepts[oa_id] = top_concepts

    oa_list = list(paper_concepts.keys())
    for i in range(len(oa_list)):
        concepts_i = paper_concepts[oa_list[i]]
        if not concepts_i:
            continue
        for j in range(i + 1, len(oa_list)):
            concepts_j = paper_concepts[oa_list[j]]
            shared_concepts = concepts_i & concepts_j
            if not shared_concepts:
                continue
            overlap_ratio = len(shared_concepts) / min(len(concepts_i), len(concepts_j), 10)
            # High overlap -> same sub-field; moderate -> shared methodology/topic
            if overlap_ratio >= 0.6:
                _add_edge(
                    oa_list[i],
                    oa_list[j],
                    "same_subfield",
                    weight=round(overlap_ratio, 2),
                )
            elif overlap_ratio >= 0.3:
                _add_edge(
                    oa_list[i],
                    oa_list[j],
                    "shared_methodology",
                    weight=round(overlap_ratio, 2),
                )

    return CitationGraphResponse(
        nodes=nodes,
        edges=edges,
        project_id=project_id,
    )
