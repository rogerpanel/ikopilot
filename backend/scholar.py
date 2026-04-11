"""Academic paper search and citation management via free APIs."""

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import httpx

from database import get_db, User, Project
from auth import get_current_user

router = APIRouter(prefix="/api/scholar", tags=["scholar"])


# ---------- Schemas ----------

class PaperResult(BaseModel):
    id: str
    title: str
    authors: list[str]
    year: int | None
    abstract: str
    citation_count: int
    doi: str | None
    url: str
    source: str  # "openalex" or "semanticscholar" or "crossref"


class CitationEntry(BaseModel):
    id: str
    title: str
    authors: list[str]
    year: int | None
    doi: str | None
    url: str
    journal: str
    bibtex: str
    added_at: str | None = None


class AddCitationRequest(BaseModel):
    project_id: int
    paper_id: str
    title: str
    authors: list[str]
    year: int | None = None
    doi: str | None = None
    url: str = ""
    journal: str = ""
    abstract: str = ""


# ---------- Paper Search ----------

@router.get("/search")
async def search_papers(
    q: str = Query(..., min_length=2),
    source: str = Query("openalex", regex="^(openalex|semanticscholar|crossref)$"),
    limit: int = Query(10, le=25),
    user: User = Depends(get_current_user),
):
    """Search academic papers across free research APIs."""
    if source == "openalex":
        return await _search_openalex(q, limit)
    elif source == "semanticscholar":
        return await _search_semantic_scholar(q, limit)
    else:
        return await _search_crossref(q, limit)


async def _search_openalex(query: str, limit: int) -> list[dict]:
    """Search OpenAlex — 200M+ works, free, no API key needed."""
    url = "https://api.openalex.org/works"
    params = {
        "search": query,
        "per_page": limit,
        "select": "id,title,authorships,publication_year,cited_by_count,doi,primary_location,abstract_inverted_index",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(url, params=params, headers={"User-Agent": "iKopilot/1.0 (mailto:admin@ikopilot.com)"})
        if res.status_code != 200:
            return []
        data = res.json()

    results = []
    for work in data.get("results", []):
        # Reconstruct abstract from inverted index
        abstract = ""
        inv_idx = work.get("abstract_inverted_index")
        if inv_idx:
            words = {}
            for word, positions in inv_idx.items():
                for pos in positions:
                    words[pos] = word
            abstract = " ".join(words[k] for k in sorted(words.keys()))

        authors = [
            a.get("author", {}).get("display_name", "")
            for a in work.get("authorships", [])[:5]
        ]

        doi = work.get("doi", "")
        if doi and doi.startswith("https://doi.org/"):
            doi = doi[16:]

        location = work.get("primary_location", {}) or {}
        source_info = location.get("source", {}) or {}

        results.append({
            "id": work.get("id", ""),
            "title": work.get("title", "Untitled"),
            "authors": authors,
            "year": work.get("publication_year"),
            "abstract": abstract[:500],
            "citation_count": work.get("cited_by_count", 0),
            "doi": doi,
            "url": work.get("id", ""),
            "journal": source_info.get("display_name", ""),
            "source": "openalex",
        })

    return results


async def _search_semantic_scholar(query: str, limit: int) -> list[dict]:
    """Search Semantic Scholar — free, good for CS/AI papers."""
    url = "https://api.semanticscholar.org/graph/v1/paper/search"
    params = {
        "query": query,
        "limit": limit,
        "fields": "title,authors,year,abstract,citationCount,externalIds,url,venue",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(url, params=params)
        if res.status_code != 200:
            return []
        data = res.json()

    results = []
    for paper in data.get("data", []):
        authors = [a.get("name", "") for a in paper.get("authors", [])[:5]]
        ext_ids = paper.get("externalIds", {}) or {}

        results.append({
            "id": paper.get("paperId", ""),
            "title": paper.get("title", "Untitled"),
            "authors": authors,
            "year": paper.get("year"),
            "abstract": (paper.get("abstract") or "")[:500],
            "citation_count": paper.get("citationCount", 0),
            "doi": ext_ids.get("DOI"),
            "url": paper.get("url", ""),
            "journal": paper.get("venue", ""),
            "source": "semanticscholar",
        })

    return results


async def _search_crossref(query: str, limit: int) -> list[dict]:
    """Search CrossRef — 130M+ DOIs, good for all disciplines."""
    url = "https://api.crossref.org/works"
    params = {
        "query": query,
        "rows": limit,
        "select": "DOI,title,author,published-print,is-referenced-by-count,container-title,abstract,URL",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(
            url, params=params,
            headers={"User-Agent": "iKopilot/1.0 (mailto:admin@ikopilot.com)"},
        )
        if res.status_code != 200:
            return []
        data = res.json()

    results = []
    for item in data.get("message", {}).get("items", []):
        title_list = item.get("title", [])
        title = title_list[0] if title_list else "Untitled"

        authors = []
        for a in item.get("author", [])[:5]:
            name = f"{a.get('given', '')} {a.get('family', '')}".strip()
            if name:
                authors.append(name)

        pub = item.get("published-print", {}) or item.get("published-online", {})
        date_parts = pub.get("date-parts", [[None]])
        year = date_parts[0][0] if date_parts and date_parts[0] else None

        container = item.get("container-title", [])
        journal = container[0] if container else ""

        abstract = item.get("abstract", "")
        # CrossRef abstracts often have JATS XML tags
        import re
        abstract = re.sub(r"<[^>]+>", "", abstract)[:500]

        results.append({
            "id": item.get("DOI", ""),
            "title": title,
            "authors": authors,
            "year": year,
            "abstract": abstract,
            "citation_count": item.get("is-referenced-by-count", 0),
            "doi": item.get("DOI"),
            "url": item.get("URL", ""),
            "journal": journal,
            "source": "crossref",
        })

    return results


# ---------- Citation Management ----------

@router.post("/citations/add")
async def add_citation(
    req: AddCitationRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a paper to a project's citation library."""
    result = await db.execute(
        select(Project).where(Project.id == req.project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Generate BibTeX
    bibtex = _generate_bibtex(req)

    from datetime import datetime, timezone
    citation = {
        "id": req.paper_id,
        "title": req.title,
        "authors": req.authors,
        "year": req.year,
        "doi": req.doi,
        "url": req.url,
        "journal": req.journal,
        "abstract": req.abstract[:300],
        "bibtex": bibtex,
        "added_at": datetime.now(timezone.utc).isoformat(),
    }

    # Store in context_files_json under a "citations" key
    files_data = project.context_files_json or []

    # Check for existing citations list
    citations_entry = next((f for f in files_data if f.get("_type") == "citations"), None)
    if citations_entry:
        citations_list = citations_entry.get("items", [])
        # Avoid duplicates
        if any(c["id"] == req.paper_id for c in citations_list):
            raise HTTPException(status_code=400, detail="Paper already in citations")
        citations_list.append(citation)
        citations_entry["items"] = citations_list
    else:
        files_data.append({
            "_type": "citations",
            "items": [citation],
        })

    await db.execute(
        update(Project)
        .where(Project.id == req.project_id)
        .values(context_files_json=files_data)
    )
    await db.commit()

    return citation


@router.get("/citations/{project_id}")
async def get_citations(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all citations for a project."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    files_data = project.context_files_json or []
    citations_entry = next((f for f in files_data if f.get("_type") == "citations"), None)

    return citations_entry.get("items", []) if citations_entry else []


@router.delete("/citations/{project_id}/{paper_id}")
async def remove_citation(
    project_id: int,
    paper_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a citation from a project."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    files_data = project.context_files_json or []
    citations_entry = next((f for f in files_data if f.get("_type") == "citations"), None)

    if citations_entry:
        citations_entry["items"] = [
            c for c in citations_entry.get("items", []) if c["id"] != paper_id
        ]

    await db.execute(
        update(Project)
        .where(Project.id == project_id)
        .values(context_files_json=files_data)
    )
    await db.commit()
    return {"message": "Citation removed"}


@router.get("/citations/{project_id}/bibtex")
async def export_bibtex(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export all citations as a BibTeX file."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    files_data = project.context_files_json or []
    citations_entry = next((f for f in files_data if f.get("_type") == "citations"), None)
    items = citations_entry.get("items", []) if citations_entry else []

    bibtex_entries = [c.get("bibtex", "") for c in items if c.get("bibtex")]
    bibtex_content = "\n\n".join(bibtex_entries)

    from fastapi.responses import Response
    return Response(
        content=bibtex_content,
        media_type="application/x-bibtex",
        headers={"Content-Disposition": f'attachment; filename="{project.title}_references.bib"'},
    )


@router.get("/citations/{project_id}/formatted")
async def get_formatted_citations(
    project_id: int,
    style: str = Query("apa", regex="^(apa|ieee|harvard)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get citations formatted in APA, IEEE, or Harvard style."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    files_data = project.context_files_json or []
    citations_entry = next((f for f in files_data if f.get("_type") == "citations"), None)
    items = citations_entry.get("items", []) if citations_entry else []

    formatted = []
    for c in items:
        formatted.append({
            "id": c["id"],
            "formatted": _format_citation(c, style),
            "bibtex": c.get("bibtex", ""),
        })

    return formatted


# ---------- Helpers ----------

def _generate_bibtex(paper) -> str:
    """Generate BibTeX entry from paper data."""
    # Create cite key: first_author_year
    authors = paper.authors or ["Unknown"]
    first_author = authors[0].split()[-1].lower() if authors else "unknown"
    # Remove non-alphanumeric
    first_author = "".join(c for c in first_author if c.isalnum())
    year = paper.year or "nd"
    cite_key = f"{first_author}{year}"

    author_str = " and ".join(paper.authors) if paper.authors else "Unknown"

    lines = [
        f"@article{{{cite_key},",
        f"  title = {{{paper.title}}},",
        f"  author = {{{author_str}}},",
    ]
    if paper.year:
        lines.append(f"  year = {{{paper.year}}},")
    if paper.journal:
        lines.append(f"  journal = {{{paper.journal}}},")
    if paper.doi:
        lines.append(f"  doi = {{{paper.doi}}},")
    if paper.url:
        lines.append(f"  url = {{{paper.url}}},")
    lines.append("}")

    return "\n".join(lines)


def _format_citation(paper: dict, style: str) -> str:
    """Format a citation in the given style."""
    authors = paper.get("authors", ["Unknown"])
    title = paper.get("title", "Untitled")
    year = paper.get("year", "n.d.")
    journal = paper.get("journal", "")
    doi = paper.get("doi", "")

    if style == "apa":
        # APA 7th: Author, A. A., & Author, B. B. (Year). Title. Journal. DOI
        if len(authors) == 1:
            author_str = authors[0]
        elif len(authors) == 2:
            author_str = f"{authors[0]} & {authors[1]}"
        else:
            author_str = f"{authors[0]} et al."
        cite = f"{author_str} ({year}). {title}."
        if journal:
            cite += f" *{journal}*."
        if doi:
            cite += f" https://doi.org/{doi}"
        return cite

    elif style == "ieee":
        # IEEE: [1] A. Author, "Title," Journal, year.
        author_parts = []
        for a in authors[:3]:
            parts = a.split()
            if len(parts) >= 2:
                initials = ". ".join(p[0] for p in parts[:-1]) + "."
                author_parts.append(f"{initials} {parts[-1]}")
            else:
                author_parts.append(a)
        author_str = ", ".join(author_parts)
        if len(authors) > 3:
            author_str += " et al."
        cite = f'{author_str}, "{title},"'
        if journal:
            cite += f" {journal},"
        cite += f" {year}."
        if doi:
            cite += f" doi: {doi}."
        return cite

    else:  # harvard
        # Harvard: Author (Year) Title. Journal. DOI
        if len(authors) <= 3:
            author_str = ", ".join(authors)
        else:
            author_str = f"{authors[0]} et al."
        cite = f"{author_str} ({year}) '{title}'."
        if journal:
            cite += f" {journal}."
        if doi:
            cite += f" doi: {doi}."
        return cite
