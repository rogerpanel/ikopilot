"""
iKo FlashCards — Spaced repetition study system.

LLM generates Q&A flashcards from academic text. SM-2 algorithm
schedules reviews based on recall performance.
"""

import json
import re
import math
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update, Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db, User, Base, utcnow
from auth import get_current_user
from litreview import _call_llm

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])


# ---------- Database Model ----------

class Flashcard(Base):
    __tablename__ = "flashcards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    deck = Column(String(255), default="General")
    front = Column(Text, nullable=False)
    back = Column(Text, nullable=False)
    source = Column(String(255), default="")
    interval = Column(Float, default=1.0)
    ease_factor = Column(Float, default=2.5)
    repetitions = Column(Integer, default=0)
    next_review = Column(DateTime(timezone=True), default=utcnow)
    last_reviewed = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


# ---------- SM-2 Algorithm ----------

def sm2_update(quality: int, repetitions: int, ease_factor: float, interval: float):
    """SM-2 spaced repetition algorithm. Quality: 0-5 (0=forgot, 5=perfect)."""
    if quality < 3:
        repetitions = 0
        interval = 1.0
    else:
        if repetitions == 0:
            interval = 1.0
        elif repetitions == 1:
            interval = 6.0
        else:
            interval = interval * ease_factor
        repetitions += 1

    ease_factor = max(1.3, ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    return repetitions, ease_factor, round(interval, 1)


# ---------- Schemas ----------

class GenerateCardsRequest(BaseModel):
    text: str
    deck: str = "General"
    count: int = 10
    card_type: str = "concept"  # concept, definition, methodology, defense_prep
    provider: str = "deepseek"


class ReviewRequest(BaseModel):
    card_id: int
    quality: int  # 0=forgot, 3=hard, 4=good, 5=easy


class CreateCardRequest(BaseModel):
    front: str
    back: str
    deck: str = "General"
    source: str = ""


# ---------- Endpoints ----------

@router.post("/generate")
async def generate_flashcards(
    req: GenerateCardsRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate flashcards from text using LLM."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    type_prompts = {
        "concept": "Generate question/answer flashcards about key concepts, theories, and ideas.",
        "definition": "Generate definition flashcards: term on front, definition on back.",
        "methodology": "Generate flashcards about research methods, statistical tests, and procedures.",
        "defense_prep": "Generate thesis defense Q&A cards: examiner question on front, answer framework on back.",
    }

    system = (
        f"You are a study card generator for academic content. "
        f"{type_prompts.get(req.card_type, type_prompts['concept'])}\n\n"
        f"Generate exactly {req.count} flashcards. Return ONLY valid JSON array:\n"
        '[{"front": "Question or term", "back": "Answer or definition"}, ...]\n'
        "Make cards specific and testable. No vague or overly broad questions."
    )

    raw = await _call_llm(system, f"Generate {req.count} flashcards from:\n\n{req.text[:8000]}", req.provider)
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        cards_data = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\[[\s\S]*\]", cleaned)
        if match:
            cards_data = json.loads(match.group())
        else:
            raise HTTPException(status_code=502, detail="Failed to generate flashcards")

    created = []
    for card in cards_data[:req.count]:
        fc = Flashcard(
            user_id=user.id,
            deck=req.deck,
            front=card.get("front", ""),
            back=card.get("back", ""),
            source="llm-generated",
        )
        db.add(fc)
        created.append({"front": fc.front, "back": fc.back})

    await db.commit()
    return {"cards_created": len(created), "cards": created, "deck": req.deck}


@router.post("/create")
async def create_card(
    req: CreateCardRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a single flashcard manually."""
    fc = Flashcard(
        user_id=user.id, deck=req.deck,
        front=req.front, back=req.back, source=req.source,
    )
    db.add(fc)
    await db.commit()
    await db.refresh(fc)
    return {"id": fc.id, "front": fc.front, "back": fc.back, "deck": fc.deck}


@router.get("/review")
async def get_review_cards(
    deck: str = "",
    limit: int = 20,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get cards due for review (next_review <= now)."""
    now = datetime.now(timezone.utc)
    query = select(Flashcard).where(
        Flashcard.user_id == user.id,
        Flashcard.next_review <= now,
    )
    if deck:
        query = query.where(Flashcard.deck == deck)
    query = query.order_by(Flashcard.next_review).limit(limit)

    result = await db.execute(query)
    cards = result.scalars().all()

    return {
        "due_count": len(cards),
        "cards": [
            {
                "id": c.id, "front": c.front, "back": c.back,
                "deck": c.deck, "repetitions": c.repetitions,
                "interval": c.interval, "ease_factor": round(c.ease_factor, 2),
            }
            for c in cards
        ],
    }


@router.post("/review")
async def review_card(
    req: ReviewRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a review for a flashcard. Quality: 0=forgot, 3=hard, 4=good, 5=easy."""
    result = await db.execute(
        select(Flashcard).where(Flashcard.id == req.card_id, Flashcard.user_id == user.id)
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    quality = max(0, min(5, req.quality))
    new_reps, new_ef, new_interval = sm2_update(
        quality, card.repetitions, card.ease_factor, card.interval
    )

    now = datetime.now(timezone.utc)
    card.repetitions = new_reps
    card.ease_factor = new_ef
    card.interval = new_interval
    card.next_review = now + timedelta(days=new_interval)
    card.last_reviewed = now
    await db.commit()

    return {
        "card_id": card.id,
        "new_interval_days": new_interval,
        "next_review": card.next_review.isoformat(),
        "ease_factor": round(new_ef, 2),
    }


@router.get("/decks")
async def list_decks(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all decks with card counts and due counts."""
    from sqlalchemy import func

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(
            Flashcard.deck,
            func.count(Flashcard.id).label("total"),
            func.sum(func.cast(Flashcard.next_review <= now, Integer)).label("due"),
        )
        .where(Flashcard.user_id == user.id)
        .group_by(Flashcard.deck)
    )

    decks = []
    for row in result:
        decks.append({
            "name": row.deck,
            "total_cards": row.total,
            "due_cards": row.due or 0,
        })

    return {"decks": decks}


@router.delete("/card/{card_id}")
async def delete_card(
    card_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a flashcard."""
    result = await db.execute(
        select(Flashcard).where(Flashcard.id == card_id, Flashcard.user_id == user.id)
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    await db.delete(card)
    await db.commit()
    return {"message": "Card deleted"}
