"""Chat history search and export endpoints."""

import io
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, User, Conversation, Project
from auth import get_current_user

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("/search")
async def search_conversations(
    q: str = Query(..., min_length=1),
    project_id: Optional[int] = Query(None),
    provider: Optional[str] = Query(None),
    limit: int = Query(20, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full-text search across conversation titles and messages."""
    query = select(Conversation).where(Conversation.user_id == user.id)

    if project_id is not None:
        query = query.where(Conversation.project_id == project_id)
    if provider:
        query = query.where(Conversation.provider == provider)

    # Search in title
    query = query.where(Conversation.title.ilike(f"%{q}%"))
    query = query.order_by(Conversation.created_at.desc()).limit(limit)

    result = await db.execute(query)
    conversations = result.scalars().all()

    # Also search in message content (JSON field)
    if len(conversations) < limit:
        msg_query = (
            select(Conversation)
            .where(
                Conversation.user_id == user.id,
                Conversation.messages_json.cast(str).ilike(f"%{q}%"),
                ~Conversation.title.ilike(f"%{q}%"),  # Avoid duplicates
            )
            .order_by(Conversation.created_at.desc())
            .limit(limit - len(conversations))
        )
        if project_id is not None:
            msg_query = msg_query.where(Conversation.project_id == project_id)

        msg_result = await db.execute(msg_query)
        conversations.extend(msg_result.scalars().all())

    return [
        {
            "id": c.id,
            "title": c.title,
            "provider": c.provider.value if c.provider else None,
            "project_id": c.project_id,
            "tokens_input": c.tokens_input,
            "tokens_output": c.tokens_output,
            "cost_usd": c.cost_usd,
            "message_count": len(c.messages_json) if c.messages_json else 0,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "preview": _get_preview(c.messages_json, q),
        }
        for c in conversations
    ]


@router.get("/stats")
async def conversation_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user's conversation statistics."""
    total = await db.execute(
        select(func.count(Conversation.id)).where(Conversation.user_id == user.id)
    )
    total_tokens = await db.execute(
        select(
            func.sum(Conversation.tokens_input),
            func.sum(Conversation.tokens_output),
            func.sum(Conversation.cost_usd),
        ).where(Conversation.user_id == user.id)
    )
    tokens_row = total_tokens.one()

    by_provider = await db.execute(
        select(
            Conversation.provider,
            func.count(Conversation.id),
        )
        .where(Conversation.user_id == user.id)
        .group_by(Conversation.provider)
    )

    return {
        "total_conversations": total.scalar() or 0,
        "total_tokens_input": tokens_row[0] or 0,
        "total_tokens_output": tokens_row[1] or 0,
        "total_cost_usd": round(tokens_row[2] or 0, 4),
        "by_provider": {
            row[0].value if row[0] else "unknown": row[1]
            for row in by_provider.all()
        },
    }


@router.get("/export/{conversation_id}")
async def export_conversation(
    conversation_id: int,
    format: str = Query("md", regex="^(md|txt|json)$"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export a conversation as Markdown, plain text, or JSON."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = conv.messages_json or []
    title = conv.title or "Conversation"
    date = conv.created_at.strftime("%Y-%m-%d") if conv.created_at else "unknown"

    if format == "json":
        content = json.dumps({
            "title": title,
            "provider": conv.provider.value if conv.provider else None,
            "date": date,
            "messages": messages,
            "tokens": {
                "input": conv.tokens_input,
                "output": conv.tokens_output,
            },
        }, indent=2)
        media_type = "application/json"
        ext = "json"
    elif format == "txt":
        lines = [f"Conversation: {title}", f"Date: {date}", f"Provider: {conv.provider.value if conv.provider else 'N/A'}", ""]
        for msg in messages:
            role = "You" if msg["role"] == "user" else "iKoPilot.com"
            lines.append(f"[{role}]")
            lines.append(msg["content"])
            lines.append("")
        content = "\n".join(lines)
        media_type = "text/plain"
        ext = "txt"
    else:  # markdown
        lines = [f"# {title}", f"*Date: {date} | Provider: {conv.provider.value if conv.provider else 'N/A'}*", ""]
        for msg in messages:
            if msg["role"] == "user":
                lines.append(f"## You")
            else:
                lines.append(f"## iKoPilot.com")
            lines.append(msg["content"])
            lines.append("")
        content = "\n".join(lines)
        media_type = "text/markdown"
        ext = "md"

    safe_title = "".join(c for c in title if c.isalnum() or c in " -_")[:50].strip()
    filename = f"{safe_title}_{date}.{ext}"

    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _get_preview(messages_json: list, query: str) -> str:
    """Get a preview snippet around the search query."""
    if not messages_json:
        return ""
    query_lower = query.lower()
    for msg in messages_json:
        content = msg.get("content", "")
        idx = content.lower().find(query_lower)
        if idx >= 0:
            start = max(0, idx - 50)
            end = min(len(content), idx + len(query) + 50)
            snippet = content[start:end]
            if start > 0:
                snippet = "..." + snippet
            if end < len(content):
                snippet = snippet + "..."
            return snippet
    # Fallback: return start of first message
    first = messages_json[0].get("content", "") if messages_json else ""
    return first[:100] + ("..." if len(first) > 100 else "")
