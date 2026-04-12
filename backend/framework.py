"""
iKo Framework — Architectural design and research illustration tool.

Provides four design modes (TikZ, Mermaid, AI Image Generation, Draw.io)
for creating professional academic diagrams, frameworks, and figures.
"""

import json
import base64
import io
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import httpx

from auth import get_current_user
from database import User
from config import settings
from llm_proxy import get_api_key, PROVIDER_MODELS
from orchestrator import _call_anthropic, _call_openai_compat


router = APIRouter(prefix="/api/framework", tags=["framework"])


# ---------- Design Modes ----------

DESIGN_MODES = [
    {
        "id": "tikz",
        "name": "TikZ Code",
        "description": "Generate LaTeX TikZ code for research diagrams, flowcharts, and frameworks",
        "llm": "claude",
        "output_format": "code",
        "icon": "Code",
    },
    {
        "id": "mermaid",
        "name": "Mermaid Diagram",
        "description": "Generate Mermaid.js code for flowcharts, sequence diagrams, class diagrams, and Gantt charts",
        "llm": "claude",
        "output_format": "code",
        "icon": "GitBranch",
    },
    {
        "id": "image_gen",
        "name": "AI Image Generation",
        "description": "Generate scientific illustrations, architectural frameworks, and research figures using DALL-E",
        "llm": "gpt4o",
        "output_format": "image",
        "icon": "Image",
    },
    {
        "id": "drawio",
        "name": "Draw.io XML",
        "description": "Generate draw.io/diagrams.net XML for editable flowcharts and system architectures",
        "llm": "claude",
        "output_format": "code",
        "icon": "Layout",
    },
]


# ---------- System Prompts ----------

SYSTEM_PROMPTS = {
    "tikz": (
        "You are an expert LaTeX TikZ designer specializing in academic research diagrams. "
        "Generate compilable TikZ code. Include: research frameworks, conceptual models, "
        "flowcharts, system architectures, methodology diagrams, data flow diagrams. "
        "Always produce complete, standalone TikZ code wrapped in "
        "\\begin{tikzpicture}...\\end{tikzpicture}. "
        "Use professional colors, proper spacing, and clean typography. "
        "Add comments explaining each section."
    ),
    "mermaid": (
        "You are a Mermaid.js diagram specialist for academic research. "
        "Generate valid Mermaid syntax for: flowcharts, sequence diagrams, class diagrams, "
        "state diagrams, entity-relationship diagrams, Gantt charts. "
        "Use proper academic terminology. Keep diagrams clean and readable."
    ),
    "image_gen": (
        "You are a scientific illustration designer. Generate detailed prompts for DALL-E "
        "to create: research framework diagrams, methodology flowcharts, conceptual models, "
        "system architectures, data pipeline visualizations. The output should look like "
        "professional academic journal figures — clean, labeled, with proper typography. "
        "Style: technical illustration, white background, vector-style, labeled components."
    ),
    "drawio": (
        "You are a draw.io XML generator. Create valid draw.io/diagrams.net XML that can "
        "be imported directly. Include proper shapes, connectors, labels, and styling for: "
        "flowcharts, system architectures, UML diagrams, research frameworks, network diagrams."
    ),
}


# ---------- Request / Response Schemas ----------

class DesignRequest(BaseModel):
    mode: str  # tikz, mermaid, image_gen, drawio
    prompt: str  # user's description of what to design
    context: str = ""  # pasted text from research, or extracted file text
    conversation_history: list[dict] = []  # for iterative refinement
    uploaded_file_context: str = ""


class RefineRequest(BaseModel):
    mode: str
    original_output: str  # the previous generated code/prompt
    refinement: str  # user's feedback on what to change
    conversation_history: list[dict] = []


class ExportRequest(BaseModel):
    mode: str
    content: str  # the final code or image prompt
    format: str = "png"  # png, pdf, jpg, gif, svg


# ---------- Helpers ----------

def _get_mode_config(mode_id: str) -> dict:
    """Look up a design mode by ID or raise 400."""
    for m in DESIGN_MODES:
        if m["id"] == mode_id:
            return m
    raise HTTPException(status_code=400, detail=f"Unknown design mode: {mode_id}")


async def _call_llm(system_prompt: str, user_message: str, mode_config: dict) -> str:
    """Route the request to the correct LLM based on the mode configuration."""
    provider = mode_config["llm"]
    api_key = get_api_key(provider)
    model = PROVIDER_MODELS[provider]

    if provider == "claude":
        return await _call_anthropic(system_prompt, user_message, api_key, model)
    else:
        return await _call_openai_compat(
            system_prompt, user_message, api_key, model, provider
        )


async def _generate_image(prompt: str, api_key: str) -> str:
    """Call DALL-E to generate an image. Returns base64 image data."""
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            "https://api.openai.com/v1/images/generations",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "dall-e-3",
                "prompt": prompt,
                "n": 1,
                "size": "1024x1024",
                "response_format": "b64_json",
            },
        )
        if res.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Image generation failed: {res.text[:200]}",
            )
        data = res.json()
        return data["data"][0]["b64_json"]


def _build_user_message(prompt: str, context: str, uploaded_file_context: str, conversation_history: list[dict]) -> str:
    """Assemble the full user message from prompt, context, and history."""
    parts: list[str] = []

    # Include conversation history as context
    if conversation_history:
        parts.append("=== Previous conversation ===")
        for msg in conversation_history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            parts.append(f"{role}: {content}")
        parts.append("=== End of previous conversation ===\n")

    # Include pasted research context
    if context:
        parts.append(f"=== Research context ===\n{context}\n=== End of context ===\n")

    # Include uploaded file context
    if uploaded_file_context:
        parts.append(f"=== Uploaded file content ===\n{uploaded_file_context}\n=== End of file content ===\n")

    parts.append(prompt)

    return "\n".join(parts)


# ---------- Endpoints ----------

@router.get("/modes")
async def get_design_modes(user: User = Depends(get_current_user)):
    """Return the available design modes."""
    return {"modes": DESIGN_MODES}


@router.post("/generate")
async def generate_design(req: DesignRequest, user: User = Depends(get_current_user)):
    """Generate a design in the requested mode."""
    mode_config = _get_mode_config(req.mode)
    system_prompt = SYSTEM_PROMPTS[req.mode]

    user_message = _build_user_message(
        prompt=req.prompt,
        context=req.context,
        uploaded_file_context=req.uploaded_file_context,
        conversation_history=req.conversation_history,
    )

    result = await _call_llm(system_prompt, user_message, mode_config)

    return {
        "mode": req.mode,
        "output_format": mode_config["output_format"],
        "content": result,
        "llm_used": mode_config["llm"],
        "model": PROVIDER_MODELS[mode_config["llm"]],
    }


@router.post("/refine")
async def refine_design(req: RefineRequest, user: User = Depends(get_current_user)):
    """Refine an existing design with user feedback."""
    mode_config = _get_mode_config(req.mode)
    system_prompt = SYSTEM_PROMPTS[req.mode]

    # Build a refinement-oriented user message
    parts: list[str] = []

    # Include conversation history
    if req.conversation_history:
        parts.append("=== Previous conversation ===")
        for msg in req.conversation_history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            parts.append(f"{role}: {content}")
        parts.append("=== End of previous conversation ===\n")

    parts.append(f"=== Current output ===\n{req.original_output}\n=== End of current output ===\n")
    parts.append(f"Please refine the above output based on the following feedback:\n{req.refinement}")

    user_message = "\n".join(parts)

    result = await _call_llm(system_prompt, user_message, mode_config)

    return {
        "mode": req.mode,
        "output_format": mode_config["output_format"],
        "content": result,
        "llm_used": mode_config["llm"],
        "model": PROVIDER_MODELS[mode_config["llm"]],
    }


@router.post("/export")
async def export_design(req: ExportRequest, user: User = Depends(get_current_user)):
    """Export a design — generate an image for image_gen mode, or return code for others."""
    mode_config = _get_mode_config(req.mode)

    # For image generation mode, call DALL-E
    if req.mode == "image_gen":
        api_key = get_api_key("gpt4o")
        image_b64 = await _generate_image(req.content, api_key)
        image_bytes = base64.b64decode(image_b64)

        # Determine content type based on requested format
        content_type_map = {
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "gif": "image/gif",
        }
        content_type = content_type_map.get(req.format, "image/png")
        file_ext = req.format if req.format in content_type_map else "png"

        return StreamingResponse(
            io.BytesIO(image_bytes),
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="framework_design.{file_ext}"'
            },
        )

    # For code modes, return the raw code as a downloadable file
    content_type_map = {
        "tikz": {"content_type": "application/x-tex", "ext": "tex"},
        "mermaid": {"content_type": "text/plain", "ext": "mmd"},
        "drawio": {"content_type": "application/xml", "ext": "drawio"},
    }
    mode_info = content_type_map.get(req.mode, {"content_type": "text/plain", "ext": "txt"})

    return StreamingResponse(
        io.BytesIO(req.content.encode("utf-8")),
        media_type=mode_info["content_type"],
        headers={
            "Content-Disposition": f'attachment; filename="framework_design.{mode_info["ext"]}"'
        },
    )
