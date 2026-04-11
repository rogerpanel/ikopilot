"""Central LLM provider management — admin keys, user routing, streaming."""

import json
import time
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import httpx

from database import (
    get_db, User, Conversation, ApiUsage, LLMProvider, Project,
)
from auth import get_current_user
from config import settings

router = APIRouter(prefix="/api/chat", tags=["chat"])

ACADEMIC_SYSTEM_PROMPT = (
    "You are an academic research assistant for graduate students. You help "
    "with research methodology, literature analysis, data interpretation, and "
    "academic writing. You always cite sources when making claims. You suggest "
    "rather than assert. You flag ethical research implications. You never write "
    "full papers or assignments — you guide the student's thinking. You respond "
    "in academic English appropriate for thesis-level work."
)

PROVIDER_MODELS = {
    "claude": "claude-sonnet-4-20250514",
    "gpt4o": "gpt-4o",
    "gemini": "gemini-2.0-flash",
    "deepseek": "deepseek-chat",
}


# ---------- Schemas ----------

class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


LATEX_SYSTEM_PROMPT = (
    "\n\nIMPORTANT: The user has requested LaTeX output format. "
    "Format all responses using LaTeX markup suitable for compilation in Overleaf. "
    "Use \\section{}, \\subsection{}, \\textbf{}, \\textit{}, \\cite{}, "
    "\\begin{itemize}/\\begin{enumerate} for lists, "
    "\\begin{equation} for math, and \\begin{table} for tables. "
    "Wrap code in \\begin{verbatim}. "
    "Do NOT wrap the entire response in a document class — just provide the body content "
    "that can be pasted into an existing LaTeX document."
)


class ChatRequest(BaseModel):
    provider: str = "deepseek"
    messages: list[ChatMessage]
    conversation_id: Optional[int] = None
    project_id: Optional[int] = None
    research_mode: Optional[str] = None
    response_format: Optional[str] = None  # "markdown" or "latex"
    stream: bool = True


class ConversationOut(BaseModel):
    id: int
    title: str
    provider: str
    tokens_input: int
    tokens_output: int
    cost_usd: float
    created_at: str
    message_count: int


# ---------- Provider validation ----------

def validate_provider_access(user: User, provider: str):
    tier_info = settings.tier_limits.get(user.subscription_tier.value, {})
    allowed = tier_info.get("providers", [])
    if provider not in allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Your {user.subscription_tier.value} plan doesn't include {provider}. "
                   f"Allowed: {', '.join(allowed)}",
        )


def check_token_limit(user: User):
    tier_info = settings.tier_limits.get(user.subscription_tier.value, {})
    limit = tier_info.get("tokens_per_day", 0)
    if user.tokens_used_today >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily token limit reached ({limit:,} tokens). Resets at midnight UTC.",
        )


def get_api_key(provider: str) -> str:
    keys = {
        "claude": settings.anthropic_api_key,
        "gpt4o": settings.openai_api_key,
        "gemini": settings.google_api_key,
        "deepseek": settings.deepseek_api_key,
    }
    key = keys.get(provider, "").strip()
    if not key or key.endswith("..."):
        raise HTTPException(status_code=503, detail=f"Provider {provider} not configured. Ask your admin to add the API key.")
    return key


def build_system_prompt(project: Optional[Project] = None, research_mode: Optional[str] = None, response_format: Optional[str] = None) -> str:
    prompt = ACADEMIC_SYSTEM_PROMPT
    if research_mode:
        from research_modes import RESEARCH_MODE_PROMPTS
        mode_prompt = RESEARCH_MODE_PROMPTS.get(research_mode)
        if mode_prompt:
            prompt = f"{prompt}\n\n{mode_prompt}"
    if project:
        if project.system_prompt_override:
            prompt = f"{prompt}\n\nProject context: {project.system_prompt_override}"
        # Inject file context
        from file_upload import get_project_context_text
        file_context = get_project_context_text(project)
        if file_context:
            prompt = f"{prompt}\n{file_context}"
    if response_format == "latex":
        prompt = f"{prompt}{LATEX_SYSTEM_PROMPT}"
    return prompt


# ---------- Streaming generators ----------

async def stream_anthropic(
    messages: list[dict], system_prompt: str, api_key: str
) -> AsyncGenerator[tuple[str, int, int], None]:
    """Stream from Claude API via SSE."""
    formatted = []
    for m in messages:
        formatted.append({"role": m["role"], "content": m["content"]})

    payload = {
        "model": PROVIDER_MODELS["claude"],
        "max_tokens": 4096,
        "system": system_prompt,
        "messages": formatted,
        "stream": True,
    }

    tokens_in, tokens_out = 0, 0
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=payload,
        ) as response:
            if response.status_code != 200:
                body = await response.aread()
                try:
                    err = json.loads(body.decode())
                    msg = err.get("error", {}).get("message", body.decode()[:200])
                except (json.JSONDecodeError, KeyError):
                    msg = body.decode()[:200]
                raise HTTPException(status_code=502, detail=f"Claude API error: {msg}")

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
                        yield text, 0, 0
                elif event.get("type") == "message_start":
                    usage = event.get("message", {}).get("usage", {})
                    tokens_in = usage.get("input_tokens", 0)
                elif event.get("type") == "message_delta":
                    usage = event.get("usage", {})
                    tokens_out = usage.get("output_tokens", 0)

    yield "", tokens_in, tokens_out


async def stream_openai(
    messages: list[dict], system_prompt: str, api_key: str, provider: str = "gpt4o"
) -> AsyncGenerator[tuple[str, int, int], None]:
    """Stream from OpenAI-compatible APIs (GPT-4o, DeepSeek)."""
    formatted = [{"role": "system", "content": system_prompt}]
    for m in messages:
        formatted.append({"role": m["role"], "content": m["content"]})

    if provider == "deepseek":
        url = "https://api.deepseek.com/chat/completions"
        model = PROVIDER_MODELS["deepseek"]
    else:
        url = "https://api.openai.com/v1/chat/completions"
        model = PROVIDER_MODELS["gpt4o"]

    payload = {
        "model": model,
        "messages": formatted,
        "stream": True,
        "stream_options": {"include_usage": True},
    }

    tokens_in, tokens_out = 0, 0
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        ) as response:
            if response.status_code != 200:
                body = await response.aread()
                try:
                    err = json.loads(body.decode())
                    msg = err.get("error", {}).get("message", body.decode()[:200])
                except (json.JSONDecodeError, KeyError, AttributeError):
                    msg = body.decode()[:200]
                raise HTTPException(status_code=502, detail=f"Provider error: {msg}")

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
                    delta = choices[0].get("delta", {})
                    text = delta.get("content", "")
                    if text:
                        yield text, 0, 0

                usage = event.get("usage")
                if usage:
                    tokens_in = usage.get("prompt_tokens", 0)
                    tokens_out = usage.get("completion_tokens", 0)

    yield "", tokens_in, tokens_out


async def stream_gemini(
    messages: list[dict], system_prompt: str, api_key: str
) -> AsyncGenerator[tuple[str, int, int], None]:
    """Stream from Google Gemini API."""
    contents = []
    for m in messages:
        role = "user" if m["role"] == "user" else "model"
        contents.append({"role": role, "parts": [{"text": m["content"]}]})

    model = PROVIDER_MODELS["gemini"]
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent"

    payload = {
        "contents": contents,
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "generationConfig": {"maxOutputTokens": 4096},
    }

    tokens_in, tokens_out = 0, 0
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            url,
            params={"key": api_key, "alt": "sse"},
            headers={"Content-Type": "application/json"},
            json=payload,
        ) as response:
            if response.status_code != 200:
                body = await response.aread()
                try:
                    err = json.loads(body.decode())
                    msg = err.get("error", {}).get("message", body.decode()[:200])
                except (json.JSONDecodeError, KeyError, AttributeError):
                    msg = body.decode()[:200]
                raise HTTPException(status_code=502, detail=f"Gemini error: {msg}")

            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                try:
                    event = json.loads(data)
                except json.JSONDecodeError:
                    continue

                candidates = event.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    for part in parts:
                        text = part.get("text", "")
                        if text:
                            yield text, 0, 0

                usage = event.get("usageMetadata")
                if usage:
                    tokens_in = usage.get("promptTokenCount", 0)
                    tokens_out = usage.get("candidatesTokenCount", 0)

    yield "", tokens_in, tokens_out


# ---------- Endpoints ----------

@router.post("/completions")
async def chat_completions(
    req: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    validate_provider_access(user, req.provider)
    check_token_limit(user)

    api_key = get_api_key(req.provider)

    # Load project context if specified
    project = None
    if req.project_id:
        result = await db.execute(
            select(Project).where(Project.id == req.project_id, Project.user_id == user.id)
        )
        project = result.scalar_one_or_none()

    system_prompt = build_system_prompt(project, req.research_mode, req.response_format)
    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    # Select provider stream
    if req.provider == "claude":
        stream_gen = stream_anthropic(messages, system_prompt, api_key)
    elif req.provider == "gemini":
        stream_gen = stream_gemini(messages, system_prompt, api_key)
    elif req.provider == "deepseek":
        stream_gen = stream_openai(messages, system_prompt, api_key, provider="deepseek")
    else:
        stream_gen = stream_openai(messages, system_prompt, api_key, provider="gpt4o")

    if not req.stream:
        # Non-streaming: collect full response
        full_text = ""
        tokens_in, tokens_out = 0, 0
        async for chunk, t_in, t_out in stream_gen:
            full_text += chunk
            if t_in:
                tokens_in = t_in
            if t_out:
                tokens_out = t_out

        await _log_usage(db, user, req.provider, tokens_in, tokens_out)
        await _save_conversation(
            db, user, req, full_text, tokens_in, tokens_out
        )

        return {"content": full_text, "tokens_input": tokens_in, "tokens_output": tokens_out}

    # Streaming: return SSE
    async def event_stream():
        full_text = ""
        tokens_in, tokens_out = 0, 0
        try:
            async for chunk, t_in, t_out in stream_gen:
                if chunk:
                    full_text += chunk
                    yield f"data: {json.dumps({'content': chunk})}\n\n"
                if t_in:
                    tokens_in = t_in
                if t_out:
                    tokens_out = t_out

            yield f"data: {json.dumps({'done': True, 'tokens_input': tokens_in, 'tokens_output': tokens_out})}\n\n"

            # Log usage after stream completes
            await _log_usage(db, user, req.provider, tokens_in, tokens_out)
            await _save_conversation(db, user, req, full_text, tokens_in, tokens_out)
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/conversations")
async def list_conversations(
    project_id: Optional[int] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Conversation).where(Conversation.user_id == user.id)
    if project_id is not None:
        query = query.where(Conversation.project_id == project_id)
    query = query.order_by(Conversation.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    conversations = result.scalars().all()

    return [
        {
            "id": c.id,
            "title": c.title,
            "provider": c.provider.value if c.provider else None,
            "tokens_input": c.tokens_input,
            "tokens_output": c.tokens_output,
            "cost_usd": c.cost_usd,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "message_count": len(c.messages_json) if c.messages_json else 0,
        }
        for c in conversations
    ]


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {
        "id": conv.id,
        "title": conv.title,
        "provider": conv.provider.value if conv.provider else None,
        "messages": conv.messages_json or [],
        "tokens_input": conv.tokens_input,
        "tokens_output": conv.tokens_output,
        "cost_usd": conv.cost_usd,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
    }


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    await db.delete(conv)
    await db.commit()
    return {"message": "Conversation deleted"}


@router.get("/providers")
async def list_providers(user: User = Depends(get_current_user)):
    """List available providers for the user's subscription tier."""
    tier_info = settings.tier_limits.get(user.subscription_tier.value, {})
    allowed = tier_info.get("providers", [])
    return {
        "providers": [
            {
                "id": p,
                "model": PROVIDER_MODELS.get(p, ""),
                "available": p in allowed,
            }
            for p in PROVIDER_MODELS
        ],
        "tier": user.subscription_tier.value,
    }


# ---------- Internal helpers ----------

async def _log_usage(
    db: AsyncSession, user: User, provider: str,
    tokens_in: int, tokens_out: int
):
    model = PROVIDER_MODELS.get(provider, provider)
    pricing = settings.model_pricing.get(model, {"input": 0, "output": 0})
    cost = (tokens_in * pricing["input"] + tokens_out * pricing["output"]) / 1_000_000

    usage = ApiUsage(
        user_id=user.id,
        provider=LLMProvider(provider),
        model=model,
        tokens_input=tokens_in,
        tokens_output=tokens_out,
        cost_usd=cost,
        endpoint="/api/chat/completions",
    )
    db.add(usage)

    await db.execute(
        update(User).where(User.id == user.id).values(
            tokens_used_today=User.tokens_used_today + tokens_in + tokens_out,
            tokens_used_month=User.tokens_used_month + tokens_in + tokens_out,
        )
    )
    await db.commit()


async def _save_conversation(
    db: AsyncSession, user: User, req: ChatRequest,
    assistant_response: str, tokens_in: int, tokens_out: int
):
    model = PROVIDER_MODELS.get(req.provider, req.provider)
    pricing = settings.model_pricing.get(model, {"input": 0, "output": 0})
    cost = (tokens_in * pricing["input"] + tokens_out * pricing["output"]) / 1_000_000

    if req.conversation_id:
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == req.conversation_id,
                Conversation.user_id == user.id,
            )
        )
        conv = result.scalar_one_or_none()
        if conv:
            msgs = conv.messages_json or []
            msgs.append({"role": "user", "content": req.messages[-1].content})
            msgs.append({"role": "assistant", "content": assistant_response})
            conv.messages_json = msgs
            conv.tokens_input += tokens_in
            conv.tokens_output += tokens_out
            conv.cost_usd += cost
            await db.commit()
            return

    # New conversation
    title = req.messages[0].content[:80] if req.messages else "New conversation"
    messages_data = [{"role": m.role, "content": m.content} for m in req.messages]
    messages_data.append({"role": "assistant", "content": assistant_response})

    conv = Conversation(
        user_id=user.id,
        project_id=req.project_id,
        title=title,
        provider=LLMProvider(req.provider),
        messages_json=messages_data,
        tokens_input=tokens_in,
        tokens_output=tokens_out,
        cost_usd=cost,
    )
    db.add(conv)
    await db.commit()
