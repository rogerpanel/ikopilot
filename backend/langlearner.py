"""
iKo LangLearner — Interactive language learning module.

Supports CEFR levels A1-C1 across Russian (full), German, French, Spanish.
LLM-powered exercise generation and answer grading.
"""

import json
import re
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db, User, LangProgress
from auth import get_current_user
from config import settings
from llm_proxy import get_api_key, PROVIDER_MODELS
from litreview import _call_llm

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lang", tags=["langlearner"])


# ---------- CURRICULUM ----------

CURRICULUM = {
    "russian": {
        "name": "Russian", "native_name": "Русский", "flag": "🇷🇺",
        "available": True,
        "levels": {
            "A1": {"name": "Beginner", "description": "Basic phrases, Cyrillic alphabet, greetings, numbers",
                "units": [
                    {"id": 1, "title": "Cyrillic Alphabet & Sounds", "lessons": [
                        {"id": 1, "title": "Vowels: А, О, У, Э, И, Ы", "type": "alphabet", "xp": 10},
                        {"id": 2, "title": "Consonants Part 1: Б, В, Г, Д, Ж, З", "type": "alphabet", "xp": 10},
                        {"id": 3, "title": "Consonants Part 2: К, Л, М, Н, П, Р, С, Т", "type": "alphabet", "xp": 10},
                        {"id": 4, "title": "Special Letters: Ъ, Ь, Ё, Й, Щ, Ц, Ч, Ш", "type": "alphabet", "xp": 15},
                        {"id": 5, "title": "Reading Simple Words", "type": "reading", "xp": 15},
                    ]},
                    {"id": 2, "title": "Greetings & Introductions", "lessons": [
                        {"id": 1, "title": "Hello & Goodbye", "type": "vocabulary", "xp": 10},
                        {"id": 2, "title": "My Name Is...", "type": "vocabulary", "xp": 10},
                        {"id": 3, "title": "How Are You?", "type": "conversation", "xp": 15},
                        {"id": 4, "title": "Nice to Meet You", "type": "conversation", "xp": 15},
                    ]},
                    {"id": 3, "title": "Numbers & Counting", "lessons": [
                        {"id": 1, "title": "Numbers 1-10", "type": "vocabulary", "xp": 10},
                        {"id": 2, "title": "Numbers 11-100", "type": "vocabulary", "xp": 15},
                        {"id": 3, "title": "Telling Time", "type": "practical", "xp": 15},
                    ]},
                    {"id": 4, "title": "Essential Phrases", "lessons": [
                        {"id": 1, "title": "Please, Thank You, Sorry", "type": "vocabulary", "xp": 10},
                        {"id": 2, "title": "Yes, No, I Don't Understand", "type": "vocabulary", "xp": 10},
                        {"id": 3, "title": "Where Is...? How Much?", "type": "practical", "xp": 15},
                        {"id": 4, "title": "At the Café", "type": "conversation", "xp": 20},
                    ]},
                ]},
            "A2": {"name": "Elementary", "description": "Simple conversations, basic grammar, everyday topics",
                "units": [
                    {"id": 1, "title": "Gender & Nouns", "lessons": [
                        {"id": 1, "title": "Masculine, Feminine, Neuter", "type": "grammar", "xp": 15},
                        {"id": 2, "title": "Plural Forms", "type": "grammar", "xp": 15},
                        {"id": 3, "title": "Possessive Pronouns: мой, твой, наш", "type": "grammar", "xp": 15},
                    ]},
                    {"id": 2, "title": "Present Tense Verbs", "lessons": [
                        {"id": 1, "title": "Conjugation Group 1 (-ать)", "type": "grammar", "xp": 15},
                        {"id": 2, "title": "Conjugation Group 2 (-ить)", "type": "grammar", "xp": 15},
                        {"id": 3, "title": "Common Irregular Verbs", "type": "grammar", "xp": 20},
                        {"id": 4, "title": "Daily Routine Conversations", "type": "conversation", "xp": 20},
                    ]},
                    {"id": 3, "title": "Cases Introduction", "lessons": [
                        {"id": 1, "title": "Nominative Case (кто? что?)", "type": "grammar", "xp": 15},
                        {"id": 2, "title": "Accusative Case (кого? что?)", "type": "grammar", "xp": 20},
                        {"id": 3, "title": "Prepositional Case (о ком? о чём?)", "type": "grammar", "xp": 20},
                    ]},
                    {"id": 4, "title": "Everyday Topics", "lessons": [
                        {"id": 1, "title": "Family Members", "type": "vocabulary", "xp": 15},
                        {"id": 2, "title": "Food & Shopping", "type": "vocabulary", "xp": 15},
                        {"id": 3, "title": "Weather & Seasons", "type": "vocabulary", "xp": 15},
                        {"id": 4, "title": "At the Restaurant", "type": "conversation", "xp": 20},
                    ]},
                ]},
            "B1": {"name": "Intermediate", "description": "Express opinions, past/future tense, complex grammar",
                "units": [
                    {"id": 1, "title": "Past & Future Tenses", "lessons": [
                        {"id": 1, "title": "Past Tense Formation", "type": "grammar", "xp": 20},
                        {"id": 2, "title": "Future Tense (быть + infinitive)", "type": "grammar", "xp": 20},
                        {"id": 3, "title": "Perfective vs Imperfective Aspect", "type": "grammar", "xp": 25},
                        {"id": 4, "title": "Narrating a Story", "type": "writing", "xp": 25},
                    ]},
                    {"id": 2, "title": "All Six Cases", "lessons": [
                        {"id": 1, "title": "Genitive Case (кого? чего?)", "type": "grammar", "xp": 20},
                        {"id": 2, "title": "Dative Case (кому? чему?)", "type": "grammar", "xp": 20},
                        {"id": 3, "title": "Instrumental Case (кем? чем?)", "type": "grammar", "xp": 20},
                        {"id": 4, "title": "Case Practice with Prepositions", "type": "grammar", "xp": 25},
                    ]},
                    {"id": 3, "title": "Expressing Opinions", "lessons": [
                        {"id": 1, "title": "I Think That... (Я думаю, что...)", "type": "conversation", "xp": 20},
                        {"id": 2, "title": "Agreement & Disagreement", "type": "conversation", "xp": 20},
                        {"id": 3, "title": "Describing Experiences", "type": "writing", "xp": 25},
                    ]},
                ]},
            "B2": {"name": "Upper Intermediate", "description": "Abstract topics, complex structures, professional contexts",
                "units": [
                    {"id": 1, "title": "Complex Sentence Structures", "lessons": [
                        {"id": 1, "title": "Subordinate Clauses (который, чтобы, если)", "type": "grammar", "xp": 25},
                        {"id": 2, "title": "Participles & Verbal Adverbs", "type": "grammar", "xp": 30},
                        {"id": 3, "title": "Indirect Speech", "type": "grammar", "xp": 25},
                    ]},
                    {"id": 2, "title": "Professional Russian", "lessons": [
                        {"id": 1, "title": "Business Correspondence", "type": "writing", "xp": 25},
                        {"id": 2, "title": "Academic Vocabulary", "type": "vocabulary", "xp": 25},
                        {"id": 3, "title": "Formal vs Informal Register", "type": "conversation", "xp": 25},
                    ]},
                    {"id": 3, "title": "Culture & Society", "lessons": [
                        {"id": 1, "title": "Russian Literature References", "type": "reading", "xp": 25},
                        {"id": 2, "title": "Current Events Discussion", "type": "conversation", "xp": 30},
                        {"id": 3, "title": "Essay Writing", "type": "writing", "xp": 30},
                    ]},
                ]},
            "C1": {"name": "Advanced", "description": "Nuanced expression, academic language, idiomatic usage",
                "units": [
                    {"id": 1, "title": "Stylistics & Nuance", "lessons": [
                        {"id": 1, "title": "Idioms & Proverbs (Пословицы)", "type": "vocabulary", "xp": 30},
                        {"id": 2, "title": "Slang vs Literary Language", "type": "reading", "xp": 30},
                        {"id": 3, "title": "Humor & Wordplay", "type": "reading", "xp": 30},
                    ]},
                    {"id": 2, "title": "Academic & Research Russian", "lessons": [
                        {"id": 1, "title": "Reading Academic Papers in Russian", "type": "reading", "xp": 30},
                        {"id": 2, "title": "Writing Abstracts in Russian", "type": "writing", "xp": 35},
                        {"id": 3, "title": "Conference Presentation Skills", "type": "conversation", "xp": 35},
                    ]},
                ]},
        },
    },
    "german": {
        "name": "German", "native_name": "Deutsch", "flag": "🇩🇪",
        "available": True,
        "levels": {
            "A1": {"name": "Beginner", "description": "Basic phrases, greetings, numbers, articles",
                "units": [
                    {"id": 1, "title": "Greetings & Introductions", "lessons": [
                        {"id": 1, "title": "Hello & Goodbye", "type": "vocabulary", "xp": 10},
                        {"id": 2, "title": "My Name Is...", "type": "vocabulary", "xp": 10},
                        {"id": 3, "title": "How Are You?", "type": "conversation", "xp": 15},
                    ]},
                    {"id": 2, "title": "Articles & Gender", "lessons": [
                        {"id": 1, "title": "Der, Die, Das", "type": "grammar", "xp": 15},
                        {"id": 2, "title": "Plural Forms", "type": "grammar", "xp": 15},
                    ]},
                    {"id": 3, "title": "Numbers & Time", "lessons": [
                        {"id": 1, "title": "Numbers 1-20", "type": "vocabulary", "xp": 10},
                        {"id": 2, "title": "Telling Time", "type": "practical", "xp": 15},
                    ]},
                    {"id": 4, "title": "Essential Phrases", "lessons": [
                        {"id": 1, "title": "Please, Thank You, Sorry", "type": "vocabulary", "xp": 10},
                        {"id": 2, "title": "At the Café", "type": "conversation", "xp": 20},
                    ]},
                ]},
            "A2": {"name": "Elementary", "description": "Simple conversations, present tense, cases",
                "units": [
                    {"id": 1, "title": "Present Tense Verbs", "lessons": [
                        {"id": 1, "title": "Regular Verbs", "type": "grammar", "xp": 15},
                        {"id": 2, "title": "Stem-Changing Verbs", "type": "grammar", "xp": 15},
                        {"id": 3, "title": "Separable Verbs", "type": "grammar", "xp": 20},
                    ]},
                    {"id": 2, "title": "Cases: Nominative & Accusative", "lessons": [
                        {"id": 1, "title": "Nominative Case", "type": "grammar", "xp": 15},
                        {"id": 2, "title": "Accusative Case", "type": "grammar", "xp": 20},
                    ]},
                    {"id": 3, "title": "Daily Life", "lessons": [
                        {"id": 1, "title": "Family & Home", "type": "vocabulary", "xp": 15},
                        {"id": 2, "title": "Food & Shopping", "type": "vocabulary", "xp": 15},
                        {"id": 3, "title": "Weather & Seasons", "type": "vocabulary", "xp": 15},
                    ]},
                ]},
            "B1": {"name": "Intermediate", "description": "Past tenses, dative case, opinions",
                "units": [
                    {"id": 1, "title": "Past Tenses", "lessons": [
                        {"id": 1, "title": "Perfekt (Present Perfect)", "type": "grammar", "xp": 20},
                        {"id": 2, "title": "Präteritum (Simple Past)", "type": "grammar", "xp": 20},
                    ]},
                    {"id": 2, "title": "Dative Case & Prepositions", "lessons": [
                        {"id": 1, "title": "Dative Case", "type": "grammar", "xp": 20},
                        {"id": 2, "title": "Two-Way Prepositions", "type": "grammar", "xp": 25},
                    ]},
                    {"id": 3, "title": "Expressing Opinions", "lessons": [
                        {"id": 1, "title": "Ich denke, dass...", "type": "conversation", "xp": 20},
                        {"id": 2, "title": "Konjunktiv II (Would)", "type": "grammar", "xp": 25},
                    ]},
                ]},
            "B2": {"name": "Upper Intermediate", "description": "Complex grammar, professional German", "units": []},
            "C1": {"name": "Advanced", "description": "Academic German, nuanced expression", "units": []},
        },
    },
    "french": {
        "name": "French", "native_name": "Français", "flag": "🇫🇷",
        "available": True,
        "levels": {
            "A1": {"name": "Beginner", "description": "Basic phrases, greetings, numbers, gender",
                "units": [
                    {"id": 1, "title": "Greetings & Introductions", "lessons": [
                        {"id": 1, "title": "Bonjour & Au revoir", "type": "vocabulary", "xp": 10},
                        {"id": 2, "title": "Je m'appelle...", "type": "vocabulary", "xp": 10},
                        {"id": 3, "title": "Comment allez-vous?", "type": "conversation", "xp": 15},
                    ]},
                    {"id": 2, "title": "Articles & Gender", "lessons": [
                        {"id": 1, "title": "Le, La, Les", "type": "grammar", "xp": 15},
                        {"id": 2, "title": "Un, Une, Des", "type": "grammar", "xp": 15},
                    ]},
                    {"id": 3, "title": "Numbers & Essentials", "lessons": [
                        {"id": 1, "title": "Numbers 1-20", "type": "vocabulary", "xp": 10},
                        {"id": 2, "title": "S'il vous plaît & Merci", "type": "vocabulary", "xp": 10},
                        {"id": 3, "title": "At the Café", "type": "conversation", "xp": 20},
                    ]},
                ]},
            "A2": {"name": "Elementary", "description": "Present tense, basic conversations",
                "units": [
                    {"id": 1, "title": "Present Tense", "lessons": [
                        {"id": 1, "title": "-ER Verbs (parler, manger)", "type": "grammar", "xp": 15},
                        {"id": 2, "title": "-IR and -RE Verbs", "type": "grammar", "xp": 15},
                        {"id": 3, "title": "Être & Avoir", "type": "grammar", "xp": 20},
                    ]},
                    {"id": 2, "title": "Daily Life", "lessons": [
                        {"id": 1, "title": "Family & Home", "type": "vocabulary", "xp": 15},
                        {"id": 2, "title": "Food & Shopping", "type": "vocabulary", "xp": 15},
                    ]},
                ]},
            "B1": {"name": "Intermediate", "description": "Past tenses, subjunctive, opinions",
                "units": [
                    {"id": 1, "title": "Past Tenses", "lessons": [
                        {"id": 1, "title": "Passé Composé", "type": "grammar", "xp": 20},
                        {"id": 2, "title": "Imparfait", "type": "grammar", "xp": 20},
                    ]},
                    {"id": 2, "title": "Expressing Opinions", "lessons": [
                        {"id": 1, "title": "Je pense que...", "type": "conversation", "xp": 20},
                        {"id": 2, "title": "Subjonctif Basics", "type": "grammar", "xp": 25},
                    ]},
                ]},
            "B2": {"name": "Upper Intermediate", "description": "Complex grammar, professional French", "units": []},
            "C1": {"name": "Advanced", "description": "Academic French, nuanced expression", "units": []},
        },
    },
    "spanish": {
        "name": "Spanish", "native_name": "Español", "flag": "🇪🇸",
        "available": True,
        "levels": {
            "A1": {"name": "Beginner", "description": "Basic phrases, greetings, numbers, gender",
                "units": [
                    {"id": 1, "title": "Greetings & Introductions", "lessons": [
                        {"id": 1, "title": "Hola & Adiós", "type": "vocabulary", "xp": 10},
                        {"id": 2, "title": "Me llamo...", "type": "vocabulary", "xp": 10},
                        {"id": 3, "title": "¿Cómo estás?", "type": "conversation", "xp": 15},
                    ]},
                    {"id": 2, "title": "Articles & Gender", "lessons": [
                        {"id": 1, "title": "El, La, Los, Las", "type": "grammar", "xp": 15},
                        {"id": 2, "title": "Un, Una, Unos, Unas", "type": "grammar", "xp": 15},
                    ]},
                    {"id": 3, "title": "Numbers & Essentials", "lessons": [
                        {"id": 1, "title": "Numbers 1-20", "type": "vocabulary", "xp": 10},
                        {"id": 2, "title": "Por favor & Gracias", "type": "vocabulary", "xp": 10},
                        {"id": 3, "title": "At the Café", "type": "conversation", "xp": 20},
                    ]},
                ]},
            "A2": {"name": "Elementary", "description": "Present tense, basic conversations",
                "units": [
                    {"id": 1, "title": "Present Tense", "lessons": [
                        {"id": 1, "title": "-AR Verbs (hablar, estudiar)", "type": "grammar", "xp": 15},
                        {"id": 2, "title": "-ER and -IR Verbs", "type": "grammar", "xp": 15},
                        {"id": 3, "title": "Ser & Estar", "type": "grammar", "xp": 20},
                    ]},
                    {"id": 2, "title": "Daily Life", "lessons": [
                        {"id": 1, "title": "Family & Home", "type": "vocabulary", "xp": 15},
                        {"id": 2, "title": "Food & Shopping", "type": "vocabulary", "xp": 15},
                    ]},
                ]},
            "B1": {"name": "Intermediate", "description": "Past tenses, subjunctive, opinions",
                "units": [
                    {"id": 1, "title": "Past Tenses", "lessons": [
                        {"id": 1, "title": "Pretérito Indefinido", "type": "grammar", "xp": 20},
                        {"id": 2, "title": "Pretérito Imperfecto", "type": "grammar", "xp": 20},
                    ]},
                    {"id": 2, "title": "Expressing Opinions", "lessons": [
                        {"id": 1, "title": "Creo que... / Pienso que...", "type": "conversation", "xp": 20},
                        {"id": 2, "title": "Subjuntivo Basics", "type": "grammar", "xp": 25},
                    ]},
                ]},
            "B2": {"name": "Upper Intermediate", "description": "Complex grammar, professional Spanish", "units": []},
            "C1": {"name": "Advanced", "description": "Academic Spanish, nuanced expression", "units": []},
        },
    },
}


# ---------- Schemas ----------

class ProgressUpdateRequest(BaseModel):
    level: str
    unit: int
    lesson: int
    correct: int
    total: int
    xp_earned: int = 10


class CheckAnswerRequest(BaseModel):
    language: str
    question: str
    user_answer: str
    correct_answer: str = ""
    exercise_type: str = "free_text"
    provider: str = "deepseek"


class GenerateExercisesRequest(BaseModel):
    language: str
    level: str
    unit: int
    lesson: int
    lesson_title: str
    lesson_type: str
    count: int = 5
    provider: str = "deepseek"


class PlacementTestRequest(BaseModel):
    language: str


# ---------- GET endpoints ----------

@router.get("/languages")
async def list_languages(user: User = Depends(get_current_user)):
    """List all available languages."""
    return {
        "languages": [
            {
                "id": key,
                "name": info["name"],
                "native_name": info["native_name"],
                "flag": info["flag"],
                "available": info["available"],
                "level_count": len(info.get("levels", {})),
            }
            for key, info in CURRICULUM.items()
        ]
    }


@router.get("/curriculum/{language}")
async def get_curriculum(language: str, user: User = Depends(get_current_user)):
    """Return full curriculum tree for a language."""
    if language not in CURRICULUM:
        raise HTTPException(status_code=404, detail="Language not supported")
    return CURRICULUM[language]


@router.get("/progress/{language}")
async def get_progress(
    language: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user's progress for a language. Creates empty record if none exists."""
    result = await db.execute(
        select(LangProgress).where(
            LangProgress.user_id == user.id,
            LangProgress.language == language,
        )
    )
    progress = result.scalar_one_or_none()

    if not progress:
        progress = LangProgress(
            user_id=user.id,
            language=language,
            level="A1",
            unit=1,
            lesson=1,
            xp=0,
            streak_days=0,
            exercises_completed=0,
            exercises_correct=0,
            placement_done=False,
            completed_lessons=[],
        )
        db.add(progress)
        await db.commit()
        await db.refresh(progress)

    accuracy = 0
    if progress.exercises_completed > 0:
        accuracy = round(progress.exercises_correct / progress.exercises_completed * 100)

    return {
        "language": progress.language,
        "level": progress.level,
        "unit": progress.unit,
        "lesson": progress.lesson,
        "xp": progress.xp,
        "streak_days": progress.streak_days,
        "exercises_completed": progress.exercises_completed,
        "exercises_correct": progress.exercises_correct,
        "accuracy": accuracy,
        "placement_done": progress.placement_done,
        "completed_lessons": progress.completed_lessons or [],
        "last_activity": progress.last_activity.isoformat() if progress.last_activity else None,
    }


# ---------- Static Exercise Bank ----------

EXERCISE_BANK = {
    "russian": {
        "A1": {
            "1-1": [
                {"type": "multiple_choice", "question": "Which letter makes the 'ah' sound?", "options": ["А", "Б", "В", "Г"], "correct": 0, "explanation": "А (ah) is the first vowel in the Russian alphabet."},
                {"type": "multiple_choice", "question": "Which is NOT a Russian vowel?", "options": ["А", "О", "Б", "У"], "correct": 2, "explanation": "Б (b) is a consonant. The vowels here are А, О, У."},
                {"type": "matching", "instruction": "Match the Russian letter to its sound", "pairs": [["А", "ah"], ["О", "oh"], ["У", "oo"], ["И", "ee"], ["Э", "eh"]]},
                {"type": "multiple_choice", "question": "How do you write 'mama' in Russian?", "options": ["мама", "папа", "баба", "дада"], "correct": 0, "explanation": "Мама = mama (mother). Папа = papa (father)."},
                {"type": "fill_blank", "sentence": "The Russian letter ___ sounds like English 'ee'", "answer": "И", "hint": "It looks like the English letter 'N' backwards"},
            ],
            "1-2": [
                {"type": "multiple_choice", "question": "What sound does Б make?", "options": ["b", "v", "g", "d"], "correct": 0, "explanation": "Б makes the 'b' sound, like in 'boy'."},
                {"type": "multiple_choice", "question": "Which letter looks like English 'B' but sounds different?", "options": ["Б", "В", "Г", "Д"], "correct": 1, "explanation": "В looks like B but makes a 'v' sound!"},
                {"type": "matching", "instruction": "Match the consonant to its sound", "pairs": [["Б", "b"], ["В", "v"], ["Г", "g"], ["Д", "d"], ["Ж", "zh"]]},
                {"type": "fill_blank", "sentence": "The Russian word 'вода' (water) starts with the letter В, which sounds like ___", "answer": "v", "hint": "Think of 'vodka'"},
            ],
            "2-1": [
                {"type": "multiple_choice", "question": "How do you say 'Hello' (informal) in Russian?", "options": ["Привет", "Здравствуйте", "Пока", "Спасибо"], "correct": 0, "explanation": "Привет (Privet) = informal hello. Здравствуйте = formal hello."},
                {"type": "multiple_choice", "question": "Which is the FORMAL way to say hello?", "options": ["Привет", "Здравствуйте", "Пока", "Давай"], "correct": 1, "explanation": "Здравствуйте (Zdravstvuyte) is formal. Use with strangers, elders, professors."},
                {"type": "translation", "direction": "ru_to_en", "sentence": "До свидания", "answer": "Goodbye", "alternatives": ["See you", "Bye"], "explanation": "До свидания (Do svidaniya) = Goodbye (formal)."},
                {"type": "translation", "direction": "en_to_ru", "sentence": "Thank you", "answer": "Спасибо", "explanation": "Спасибо (Spasibo) = Thank you."},
                {"type": "multiple_choice", "question": "You meet your professor. You say:", "options": ["Привет!", "Здравствуйте!", "Пока!", "Давай!"], "correct": 1, "explanation": "Use Здравствуйте with professors — it's formal and respectful."},
                {"type": "fill_blank", "sentence": "Informal goodbye in Russian is ___", "answer": "Пока", "hint": "Sounds like 'paka'"},
            ],
            "2-2": [
                {"type": "multiple_choice", "question": "How do you say 'My name is Anna'?", "options": ["Меня зовут Анна", "Я есть Анна", "Моё имя Анна", "Анна я"], "correct": 0, "explanation": "Меня зовут... (Menya zovut...) = My name is..."},
                {"type": "translation", "direction": "en_to_ru", "sentence": "My name is...", "answer": "Меня зовут...", "explanation": "Меня зовут literally means 'me they call'."},
                {"type": "fill_blank", "sentence": "Меня ___ Иван.", "answer": "зовут", "hint": "The verb meaning 'they call'"},
                {"type": "sentence_build", "words": ["зовут", "Анна", "Меня"], "correct_order": [2, 0, 1], "translation": "My name is Anna"},
            ],
            "3-1": [
                {"type": "matching", "instruction": "Match the number to Russian", "pairs": [["1", "один"], ["2", "два"], ["3", "три"], ["4", "четыре"], ["5", "пять"]]},
                {"type": "multiple_choice", "question": "What is 'три' in English?", "options": ["Two", "Three", "Four", "Five"], "correct": 1, "explanation": "Три (tri) = Three."},
                {"type": "matching", "instruction": "Match numbers 6-10", "pairs": [["6", "шесть"], ["7", "семь"], ["8", "восемь"], ["9", "девять"], ["10", "десять"]]},
                {"type": "fill_blank", "sentence": "The Russian word for 'seven' is ___", "answer": "семь", "hint": "Starts with 'с'"},
            ],
            "4-1": [
                {"type": "multiple_choice", "question": "How do you say 'Please' in Russian?", "options": ["Пожалуйста", "Спасибо", "Извините", "Ничего"], "correct": 0, "explanation": "Пожалуйста = Please / You're welcome."},
                {"type": "translation", "direction": "en_to_ru", "sentence": "Sorry / Excuse me", "answer": "Извините", "alternatives": ["Простите"], "explanation": "Извините = Sorry/Excuse me (formal)."},
                {"type": "translation", "direction": "ru_to_en", "sentence": "Спасибо большое", "answer": "Thank you very much", "alternatives": ["Thanks a lot", "Many thanks"], "explanation": "Большое = big/great. Literally 'big thank you'."},
            ],
            "1-3": [
                {"type": "multiple_choice", "question": "What sound does К make?", "options": ["k", "g", "h", "j"], "correct": 0, "explanation": "К makes the 'k' sound, same as English K."},
                {"type": "multiple_choice", "question": "Which letter makes the 'l' sound?", "options": ["П", "Р", "Л", "М"], "correct": 2, "explanation": "Л (el) = 'l' sound."},
                {"type": "matching", "instruction": "Match the consonant to its sound", "pairs": [["К", "k"], ["Л", "l"], ["М", "m"], ["Н", "n"], ["П", "p"]]},
                {"type": "fill_blank", "sentence": "The Russian letter ___ makes the 'r' sound (rolled)", "answer": "Р", "hint": "Looks like English P but sounds like a rolled R"},
                {"type": "multiple_choice", "question": "Russian Р sounds like:", "options": ["English P", "English R (rolled)", "English B", "English D"], "correct": 1, "explanation": "Р looks like P but is a rolled R!"},
            ],
            "1-4": [
                {"type": "multiple_choice", "question": "What does Ь (soft sign) do?", "options": ["Makes the previous consonant soft", "Is silent", "Makes a vowel sound", "Doubles the consonant"], "correct": 0, "explanation": "Ь softens the preceding consonant. It has no sound of its own."},
                {"type": "multiple_choice", "question": "Which letter is the hard sign?", "options": ["Ь", "Ъ", "Щ", "Ц"], "correct": 1, "explanation": "Ъ is the hard sign. Ь is the soft sign."},
                {"type": "multiple_choice", "question": "What sound does Ш make?", "options": ["sh", "ch", "zh", "ts"], "correct": 0, "explanation": "Ш = 'sh' as in 'shoe'."},
                {"type": "matching", "instruction": "Match special letters", "pairs": [["Ш", "sh"], ["Щ", "shch"], ["Ц", "ts"], ["Ч", "ch"], ["Ё", "yo"]]},
                {"type": "fill_blank", "sentence": "The letter ___ sounds like 'ch' in 'cheese'", "answer": "Ч", "hint": "It looks a bit like the number 4"},
            ],
            "1-5": [
                {"type": "multiple_choice", "question": "How do you read 'мама'?", "options": ["mama", "papa", "baba", "dada"], "correct": 0, "explanation": "М=m, А=a, М=m, А=a → mama (mother)."},
                {"type": "translation", "direction": "ru_to_en", "sentence": "молоко", "answer": "milk", "explanation": "М-О-Л-О-К-О = mo-lo-ko = milk."},
                {"type": "translation", "direction": "ru_to_en", "sentence": "кот", "answer": "cat", "alternatives": ["male cat"], "explanation": "К-О-Т = kot = cat (male)."},
                {"type": "fill_blank", "sentence": "The Russian word 'дом' means ___", "answer": "house", "hint": "Д=d, О=o, М=m", "alternatives": ["home"]},
                {"type": "multiple_choice", "question": "What does 'нет' mean?", "options": ["Yes", "No", "Maybe", "Hello"], "correct": 1, "explanation": "Нет = No. Да = Yes."},
            ],
            "2-3": [
                {"type": "translation", "direction": "en_to_ru", "sentence": "How are you? (informal)", "answer": "Как дела?", "alternatives": ["Как дела"], "explanation": "Как дела? = How are things? (informal)"},
                {"type": "multiple_choice", "question": "Someone asks 'Как дела?' You reply:", "options": ["Хорошо, спасибо!", "До свидания!", "Меня зовут...", "Пожалуйста!"], "correct": 0, "explanation": "Хорошо, спасибо! = Good, thanks!"},
                {"type": "multiple_choice", "question": "'Так себе' means:", "options": ["Great", "So-so", "Terrible", "Excellent"], "correct": 1, "explanation": "Так себе = so-so / not great, not bad."},
                {"type": "sentence_build", "words": ["дела", "Как", "?"], "correct_order": [1, 0, 2], "translation": "How are you?"},
                {"type": "matching", "instruction": "Match the response", "pairs": [["Хорошо", "Good"], ["Плохо", "Bad"], ["Отлично", "Excellent"], ["Так себе", "So-so"], ["Нормально", "OK"]]},
            ],
            "2-4": [
                {"type": "translation", "direction": "en_to_ru", "sentence": "Nice to meet you", "answer": "Очень приятно", "alternatives": ["Приятно познакомиться"], "explanation": "Очень приятно = Very pleasant (nice to meet you)."},
                {"type": "multiple_choice", "question": "How do you say 'And you?' in Russian?", "options": ["А вы?", "И ты?", "Но мы?", "Или они?"], "correct": 0, "explanation": "А вы? = And you? (formal). А ты? = And you? (informal)."},
                {"type": "fill_blank", "sentence": "Очень ___ (Nice to meet you)", "answer": "приятно", "hint": "Means 'pleasant'"},
                {"type": "sentence_build", "words": ["приятно", "Очень", "познакомиться"], "correct_order": [1, 0, 2], "translation": "Nice to meet you"},
            ],
            "3-2": [
                {"type": "matching", "instruction": "Match the number", "pairs": [["11", "одиннадцать"], ["20", "двадцать"], ["30", "тридцать"], ["50", "пятьдесят"], ["100", "сто"]]},
                {"type": "multiple_choice", "question": "What is 'двадцать' in English?", "options": ["12", "20", "22", "200"], "correct": 1, "explanation": "Двадцать = 20 (twenty)."},
                {"type": "fill_blank", "sentence": "The Russian word for 100 is ___", "answer": "сто", "hint": "Very short word — just 3 letters"},
                {"type": "multiple_choice", "question": "How do you say 15 in Russian?", "options": ["пятнадцать", "пятьдесят", "пять", "двенадцать"], "correct": 0, "explanation": "Пятнадцать = 15. Пятьдесят = 50."},
                {"type": "translation", "direction": "ru_to_en", "sentence": "тридцать три", "answer": "33", "alternatives": ["thirty-three", "thirty three"], "explanation": "Тридцать (30) + три (3) = 33."},
            ],
            "3-3": [
                {"type": "multiple_choice", "question": "How do you say 'What time is it?' in Russian?", "options": ["Который час?", "Сколько лет?", "Как дела?", "Где ты?"], "correct": 0, "explanation": "Который час? = What time is it? (literally: which hour?)"},
                {"type": "translation", "direction": "ru_to_en", "sentence": "три часа", "answer": "three o'clock", "alternatives": ["3 o'clock", "3:00"], "explanation": "Три часа = three hours / three o'clock."},
                {"type": "fill_blank", "sentence": "Сейчас ___ часов (It is now 5 o'clock)", "answer": "пять", "hint": "The number 5"},
                {"type": "matching", "instruction": "Match times", "pairs": [["час", "1 o'clock"], ["два часа", "2 o'clock"], ["пять часов", "5 o'clock"], ["полдень", "noon"], ["полночь", "midnight"]]},
            ],
            "4-2": [
                {"type": "translation", "direction": "en_to_ru", "sentence": "Yes", "answer": "Да", "explanation": "Да = Yes. One of the first words to learn!"},
                {"type": "translation", "direction": "en_to_ru", "sentence": "No", "answer": "Нет", "explanation": "Нет = No."},
                {"type": "multiple_choice", "question": "How do you say 'I don't understand' in Russian?", "options": ["Я не понимаю", "Я понимаю", "Я не знаю", "Я знаю"], "correct": 0, "explanation": "Я не понимаю = I don't understand. Не = not."},
                {"type": "fill_blank", "sentence": "Я не ___ (I don't know)", "answer": "знаю", "hint": "The verb 'to know' in first person"},
                {"type": "sentence_build", "words": ["понимаю", "не", "Я"], "correct_order": [2, 1, 0], "translation": "I don't understand"},
            ],
            "4-3": [
                {"type": "translation", "direction": "en_to_ru", "sentence": "Where is...?", "answer": "Где...?", "alternatives": ["Где"], "explanation": "Где = Where. Где туалет? = Where is the toilet?"},
                {"type": "multiple_choice", "question": "How do you ask 'How much?' in Russian?", "options": ["Сколько?", "Где?", "Когда?", "Почему?"], "correct": 0, "explanation": "Сколько? = How much? / How many?"},
                {"type": "matching", "instruction": "Match question words", "pairs": [["Где?", "Where?"], ["Сколько?", "How much?"], ["Когда?", "When?"], ["Почему?", "Why?"], ["Что?", "What?"]]},
                {"type": "fill_blank", "sentence": "___ стоит? (How much does it cost?)", "answer": "Сколько", "hint": "The question word for 'how much'"},
                {"type": "translation", "direction": "ru_to_en", "sentence": "Где метро?", "answer": "Where is the metro?", "alternatives": ["Where is the subway?", "Where's the metro?"], "explanation": "Где = where, метро = metro/subway."},
            ],
            "4-4": [
                {"type": "multiple_choice", "question": "At a café, how do you say 'I would like...'?", "options": ["Я хотел бы...", "Я хочу...", "Дайте мне...", "Можно..."], "correct": 0, "explanation": "Я хотел бы = I would like (polite). Дайте мне = Give me (direct)."},
                {"type": "translation", "direction": "en_to_ru", "sentence": "Coffee, please", "answer": "Кофе, пожалуйста", "explanation": "Кофе = coffee, пожалуйста = please."},
                {"type": "translation", "direction": "en_to_ru", "sentence": "The bill, please", "answer": "Счёт, пожалуйста", "alternatives": ["Счет, пожалуйста"], "explanation": "Счёт = bill/check at a restaurant."},
                {"type": "matching", "instruction": "Match café vocabulary", "pairs": [["чай", "tea"], ["кофе", "coffee"], ["вода", "water"], ["хлеб", "bread"], ["молоко", "milk"]]},
                {"type": "sentence_build", "words": ["пожалуйста", "Кофе", ","], "correct_order": [1, 2, 0], "translation": "Coffee, please"},
                {"type": "fill_blank", "sentence": "Можно ___, пожалуйста? (Can I have water, please?)", "answer": "воду", "hint": "The accusative case of 'вода' (water)"},
            ],
        },
        "A2": {
            "1-1": [
                {"type": "multiple_choice", "question": "What gender is 'стол' (table)?", "options": ["Masculine", "Feminine", "Neuter"], "correct": 0, "explanation": "Стол ends in a consonant → masculine. Most nouns ending in a consonant are masculine."},
                {"type": "multiple_choice", "question": "What gender is 'книга' (book)?", "options": ["Masculine", "Feminine", "Neuter"], "correct": 1, "explanation": "Книга ends in -а → feminine. Most nouns ending in -а/-я are feminine."},
                {"type": "multiple_choice", "question": "What gender is 'окно' (window)?", "options": ["Masculine", "Feminine", "Neuter"], "correct": 2, "explanation": "Окно ends in -о → neuter. Most nouns ending in -о/-е are neuter."},
                {"type": "matching", "instruction": "Match the noun to its gender", "pairs": [["дом (house)", "Masculine"], ["мама (mom)", "Feminine"], ["молоко (milk)", "Neuter"], ["студент (student)", "Masculine"], ["школа (school)", "Feminine"]]},
                {"type": "fill_blank", "sentence": "The word 'письмо' (letter) is ___ gender because it ends in -о", "answer": "neuter", "hint": "-о ending = neuter"},
            ],
            "1-2": [
                {"type": "multiple_choice", "question": "What is the plural of 'стол' (table)?", "options": ["столы", "стола", "столи", "столе"], "correct": 0, "explanation": "Masculine nouns ending in consonant → add -ы. Стол → столы."},
                {"type": "multiple_choice", "question": "What is the plural of 'книга' (book)?", "options": ["книги", "книга", "книгы", "книге"], "correct": 0, "explanation": "Feminine -а → -и (after г, к, х, ж, ч, ш, щ). Книга → книги."},
                {"type": "fill_blank", "sentence": "The plural of 'окно' (window) is ___", "answer": "окна", "hint": "Neuter -о → -а in plural"},
                {"type": "matching", "instruction": "Match singular to plural", "pairs": [["студент", "студенты"], ["книга", "книги"], ["окно", "окна"], ["стул (chair)", "стулья"], ["дом", "дома"]]},
                {"type": "translation", "direction": "ru_to_en", "sentence": "столы и стулья", "answer": "tables and chairs", "explanation": "столы = tables, стулья = chairs (irregular plural)."},
            ],
            "1-3": [
                {"type": "multiple_choice", "question": "Which is correct: 'мой книга' or 'моя книга'?", "options": ["моя книга", "мой книга", "моё книга", "мои книга"], "correct": 0, "explanation": "Книга is feminine → моя. Мой = masculine, моё = neuter, мои = plural."},
                {"type": "matching", "instruction": "Match possessive to gender", "pairs": [["мой", "masculine"], ["моя", "feminine"], ["моё", "neuter"], ["мои", "plural"]]},
                {"type": "fill_blank", "sentence": "___ дом (my house) — дом is masculine", "answer": "мой", "hint": "Masculine possessive 'my'"},
                {"type": "fill_blank", "sentence": "___ окно (my window) — окно is neuter", "answer": "моё", "hint": "Neuter possessive 'my'"},
                {"type": "multiple_choice", "question": "'Наш университет' means:", "options": ["Our university", "My university", "Your university", "Their university"], "correct": 0, "explanation": "Наш = our. Мой = my, твой = your, их = their."},
            ],
            "2-1": [
                {"type": "multiple_choice", "question": "What is the я-form of 'читать' (to read)?", "options": ["читаю", "читаешь", "читает", "читать"], "correct": 0, "explanation": "Читать → я читаю. Group 1 verbs (-ать): remove -ть, add -ю."},
                {"type": "matching", "instruction": "Conjugate 'знать' (to know)", "pairs": [["я", "знаю"], ["ты", "знаешь"], ["он/она", "знает"], ["мы", "знаем"], ["они", "знают"]]},
                {"type": "fill_blank", "sentence": "Я ___ по-русски (I speak Russian) — verb: говорить", "answer": "говорю", "hint": "говорить is Group 2 — я form ends in -ю"},
                {"type": "translation", "direction": "en_to_ru", "sentence": "I read a book", "answer": "Я читаю книгу", "explanation": "Читаю = I read, книгу = book (accusative case)."},
                {"type": "sentence_build", "words": ["читаю", "книгу", "Я"], "correct_order": [2, 0, 1], "translation": "I read a book"},
            ],
            "2-2": [
                {"type": "multiple_choice", "question": "What is the я-form of 'говорить' (to speak)?", "options": ["говорю", "говоришь", "говорит", "говорить"], "correct": 0, "explanation": "Говорить → я говорю. Group 2 verbs (-ить): remove -ить, add -ю (with possible consonant change)."},
                {"type": "matching", "instruction": "Conjugate 'любить' (to love)", "pairs": [["я", "люблю"], ["ты", "любишь"], ["он/она", "любит"], ["мы", "любим"], ["они", "любят"]]},
                {"type": "fill_blank", "sentence": "Он ___ музыку (He loves music)", "answer": "любит", "hint": "Third person singular of 'любить'"},
                {"type": "translation", "direction": "ru_to_en", "sentence": "Мы говорим по-русски", "answer": "We speak Russian", "explanation": "Говорим = we speak, по-русски = in Russian."},
            ],
            "2-3": [
                {"type": "multiple_choice", "question": "'Хотеть' (to want) — я form is:", "options": ["хочу", "хотю", "хочешь", "хотеть"], "correct": 0, "explanation": "Хотеть is irregular: я хочу, ты хочешь, он хочет, мы хотим, они хотят."},
                {"type": "multiple_choice", "question": "'Есть' (to eat) — я form is:", "options": ["ем", "ею", "есть", "еш"], "correct": 0, "explanation": "Есть is irregular: я ем, ты ешь, он ест, мы едим, они едят."},
                {"type": "fill_blank", "sentence": "Я ___ в университете (I study at university) — verb: учиться", "answer": "учусь", "hint": "Reflexive verb: -ся becomes -сь after vowels"},
                {"type": "matching", "instruction": "Match irregular verbs", "pairs": [["хотеть → я", "хочу"], ["есть → я", "ем"], ["пить → я", "пью"], ["идти → я", "иду"], ["мочь → я", "могу"]]},
            ],
            "2-4": [
                {"type": "translation", "direction": "en_to_ru", "sentence": "I wake up at 7", "answer": "Я просыпаюсь в семь", "alternatives": ["Я просыпаюсь в 7"], "explanation": "Просыпаюсь = I wake up (reflexive), в семь = at seven."},
                {"type": "multiple_choice", "question": "What does 'Я завтракаю' mean?", "options": ["I eat breakfast", "I eat lunch", "I eat dinner", "I cook"], "correct": 0, "explanation": "Завтракать = to eat breakfast. Обедать = lunch. Ужинать = dinner."},
                {"type": "matching", "instruction": "Match daily routine verbs", "pairs": [["просыпаться", "wake up"], ["завтракать", "eat breakfast"], ["работать", "work"], ["обедать", "eat lunch"], ["ложиться спать", "go to bed"]]},
                {"type": "sentence_build", "words": ["в", "Я", "семь", "просыпаюсь"], "correct_order": [1, 3, 0, 2], "translation": "I wake up at seven"},
                {"type": "fill_blank", "sentence": "Вечером я ___ спать (In the evening I go to bed)", "answer": "ложусь", "hint": "Reflexive verb 'ложиться' in я-form"},
            ],
            "3-1": [
                {"type": "multiple_choice", "question": "The nominative case answers which questions?", "options": ["Кто? Что? (Who? What?)", "Кого? Что? (Whom? What?)", "Кому? (To whom?)", "Где? (Where?)"], "correct": 0, "explanation": "Nominative = кто? что? It's the dictionary form and subject of the sentence."},
                {"type": "fill_blank", "sentence": "___ читает книгу (The student reads a book) — nominative case", "answer": "Студент", "hint": "The subject (who?) is in nominative case — no change needed"},
                {"type": "multiple_choice", "question": "In 'Мама готовит ужин', what case is 'мама'?", "options": ["Nominative", "Accusative", "Dative", "Genitive"], "correct": 0, "explanation": "Мама is the subject (who is cooking?) → nominative."},
                {"type": "translation", "direction": "ru_to_en", "sentence": "Это мой друг", "answer": "This is my friend", "explanation": "Это = this is. Мой друг = my friend (nominative)."},
            ],
            "3-2": [
                {"type": "multiple_choice", "question": "The accusative case answers:", "options": ["Кого? Что? (Whom? What?)", "Кто? Что? (Who? What?)", "Кому? (To whom?)", "О ком? (About whom?)"], "correct": 0, "explanation": "Accusative = кого? что? Used for direct objects."},
                {"type": "multiple_choice", "question": "In 'Я читаю книгу', why is it 'книгу' not 'книга'?", "options": ["Accusative case (direct object)", "Genitive case", "Dative case", "It's plural"], "correct": 0, "explanation": "Книга → книгу in accusative. Feminine -а → -у."},
                {"type": "fill_blank", "sentence": "Я люблю ___ (I love mom) — мама in accusative", "answer": "маму", "hint": "Feminine -а → -у in accusative"},
                {"type": "matching", "instruction": "Nominative → Accusative", "pairs": [["книга", "книгу"], ["мама", "маму"], ["студент (animate)", "студента"], ["окно", "окно"], ["стол", "стол"]]},
                {"type": "translation", "direction": "en_to_ru", "sentence": "I love music", "answer": "Я люблю музыку", "explanation": "Музыка → музыку in accusative (feminine -а → -у)."},
            ],
            "3-3": [
                {"type": "multiple_choice", "question": "The prepositional case is used with which prepositions?", "options": ["в, на, о (in, on, about)", "из, от (from)", "к, по (to, along)", "с, без (with, without)"], "correct": 0, "explanation": "Prepositional case follows в (in), на (on), о (about)."},
                {"type": "fill_blank", "sentence": "Я живу в ___ (I live in Moscow) — Москва in prepositional", "answer": "Москве", "hint": "Feminine -а → -е in prepositional case"},
                {"type": "multiple_choice", "question": "'Он думает о работе' — what case is 'работе'?", "options": ["Prepositional", "Accusative", "Nominative", "Genitive"], "correct": 0, "explanation": "О + prepositional case. Работа → работе (feminine -а → -е)."},
                {"type": "matching", "instruction": "Form prepositional case", "pairs": [["Москва", "в Москве"], ["университет", "в университете"], ["школа", "в школе"], ["дом", "в доме"], ["офис", "в офисе"]]},
                {"type": "translation", "direction": "en_to_ru", "sentence": "I work in an office", "answer": "Я работаю в офисе", "explanation": "Офис → в офисе (prepositional after 'в')."},
            ],
            "4-1": [
                {"type": "matching", "instruction": "Match family members", "pairs": [["мама", "mom"], ["папа", "dad"], ["брат", "brother"], ["сестра", "sister"], ["бабушка", "grandmother"]]},
                {"type": "translation", "direction": "ru_to_en", "sentence": "У меня есть брат и сестра", "answer": "I have a brother and sister", "alternatives": ["I have a brother and a sister"], "explanation": "У меня есть = I have. Брат = brother, сестра = sister."},
                {"type": "fill_blank", "sentence": "Мой ___ работает в больнице (My dad works in a hospital)", "answer": "папа", "hint": "Father/dad"},
                {"type": "multiple_choice", "question": "'Дедушка' means:", "options": ["Grandfather", "Grandmother", "Uncle", "Father"], "correct": 0, "explanation": "Дедушка = grandfather. Бабушка = grandmother."},
            ],
            "4-2": [
                {"type": "matching", "instruction": "Match food words", "pairs": [["хлеб", "bread"], ["сыр", "cheese"], ["мясо", "meat"], ["рыба", "fish"], ["овощи", "vegetables"]]},
                {"type": "translation", "direction": "en_to_ru", "sentence": "I want to buy bread", "answer": "Я хочу купить хлеб", "explanation": "Хочу = want, купить = to buy, хлеб = bread."},
                {"type": "multiple_choice", "question": "'Сколько стоит?' means:", "options": ["How much does it cost?", "Where is it?", "What is it?", "Is it good?"], "correct": 0, "explanation": "Сколько стоит? = How much does it cost?"},
                {"type": "fill_blank", "sentence": "Дайте, пожалуйста, ___ (Give me cheese, please)", "answer": "сыр", "hint": "A yellow dairy product"},
                {"type": "sentence_build", "words": ["купить", "хочу", "хлеб", "Я"], "correct_order": [3, 1, 0, 2], "translation": "I want to buy bread"},
            ],
            "4-3": [
                {"type": "matching", "instruction": "Match weather words", "pairs": [["жарко", "hot"], ["холодно", "cold"], ["дождь", "rain"], ["снег", "snow"], ["ветер", "wind"]]},
                {"type": "multiple_choice", "question": "'Сегодня холодно' means:", "options": ["It's cold today", "It's hot today", "It's raining today", "It's sunny today"], "correct": 0, "explanation": "Сегодня = today, холодно = cold."},
                {"type": "matching", "instruction": "Match seasons", "pairs": [["зима", "winter"], ["весна", "spring"], ["лето", "summer"], ["осень", "autumn"]]},
                {"type": "translation", "direction": "en_to_ru", "sentence": "It's warm today", "answer": "Сегодня тепло", "explanation": "Тепло = warm."},
                {"type": "fill_blank", "sentence": "Зимой в России очень ___ (In winter in Russia it's very cold)", "answer": "холодно", "hint": "The opposite of hot"},
            ],
            "4-4": [
                {"type": "translation", "direction": "en_to_ru", "sentence": "I would like tea with sugar", "answer": "Я хотел бы чай с сахаром", "alternatives": ["Я хотела бы чай с сахаром"], "explanation": "С сахаром = with sugar (instrumental case)."},
                {"type": "multiple_choice", "question": "How do you ask for the menu?", "options": ["Меню, пожалуйста", "Счёт, пожалуйста", "Спасибо", "До свидания"], "correct": 0, "explanation": "Меню = menu. Счёт = bill."},
                {"type": "matching", "instruction": "Match restaurant phrases", "pairs": [["Меню, пожалуйста", "Menu, please"], ["Я хотел бы...", "I would like..."], ["Счёт, пожалуйста", "Bill, please"], ["Очень вкусно!", "Very delicious!"], ["Спасибо за ужин", "Thanks for dinner"]]},
                {"type": "fill_blank", "sentence": "Очень ___! (Very delicious!)", "answer": "вкусно", "hint": "Adjective meaning 'delicious/tasty'"},
                {"type": "sentence_build", "words": ["бы", "хотел", "суп", "Я"], "correct_order": [3, 1, 0, 2], "translation": "I would like soup"},
            ],
        },
        "B1": {
            "1-1": [
                {"type": "multiple_choice", "question": "How do you form the past tense of 'читать' for 'он'?", "options": ["читал", "читала", "читало", "читали"], "correct": 0, "explanation": "Masculine past: remove -ть, add -л. Он читал."},
                {"type": "matching", "instruction": "Match past tense by gender", "pairs": [["он читал", "he read"], ["она читала", "she read"], ["оно читало", "it read"], ["они читали", "they read"]]},
                {"type": "fill_blank", "sentence": "Вчера она ___ книгу (Yesterday she read a book)", "answer": "читала", "hint": "Feminine past tense: -ла"},
                {"type": "translation", "direction": "en_to_ru", "sentence": "I worked yesterday", "answer": "Я работал вчера", "alternatives": ["Вчера я работал", "Я работала вчера"], "explanation": "Работать → работал (m) / работала (f)."},
                {"type": "sentence_build", "words": ["читала", "Она", "вчера", "книгу"], "correct_order": [1, 3, 0, 2], "translation": "She read a book yesterday"},
            ],
            "1-2": [
                {"type": "multiple_choice", "question": "How do you say 'I will read' (compound future)?", "options": ["Я буду читать", "Я читаю", "Я читал", "Я прочитаю"], "correct": 0, "explanation": "Compound future = буду + infinitive. Я буду читать = I will read."},
                {"type": "matching", "instruction": "Conjugate 'буду' (will)", "pairs": [["я", "буду"], ["ты", "будешь"], ["он/она", "будет"], ["мы", "будем"], ["они", "будут"]]},
                {"type": "fill_blank", "sentence": "Завтра мы ___ работать (Tomorrow we will work)", "answer": "будем", "hint": "'We will' form of быть"},
                {"type": "translation", "direction": "en_to_ru", "sentence": "She will study tomorrow", "answer": "Она будет учиться завтра", "alternatives": ["Завтра она будет учиться"], "explanation": "Будет + infinitive = will + verb."},
            ],
            "1-3": [
                {"type": "multiple_choice", "question": "What's the difference between 'читать' and 'прочитать'?", "options": ["Imperfective vs Perfective", "Present vs Past", "Active vs Passive", "Formal vs Informal"], "correct": 0, "explanation": "Читать = imperfective (process). Прочитать = perfective (completed action)."},
                {"type": "multiple_choice", "question": "'Я написал письмо' — is 'написал' perfective or imperfective?", "options": ["Perfective (completed)", "Imperfective (ongoing)"], "correct": 0, "explanation": "Написал (perfective) = wrote and finished. Писал (imperfective) = was writing."},
                {"type": "matching", "instruction": "Match imperfective → perfective pairs", "pairs": [["читать", "прочитать"], ["писать", "написать"], ["делать", "сделать"], ["учить", "выучить"], ["покупать", "купить"]]},
                {"type": "fill_blank", "sentence": "Я уже ___ эту книгу (I already read this book — completed)", "answer": "прочитал", "hint": "Perfective past of читать"},
                {"type": "translation", "direction": "ru_to_en", "sentence": "Я писал письмо два часа", "answer": "I was writing a letter for two hours", "alternatives": ["I wrote a letter for two hours"], "explanation": "Писал (imperfective) = was writing (process, duration)."},
            ],
            "1-4": [
                {"type": "translation", "direction": "en_to_ru", "sentence": "Yesterday I went to the store and bought bread", "answer": "Вчера я пошёл в магазин и купил хлеб", "alternatives": ["Вчера я пошла в магазин и купила хлеб"], "explanation": "Пошёл = went (perfective), купил = bought (perfective). Both completed actions."},
                {"type": "fill_blank", "sentence": "Когда я ___ маленьким, я жил в Москве (When I was little, I lived in Moscow)", "answer": "был", "hint": "Past tense of 'быть' (to be), masculine"},
                {"type": "multiple_choice", "question": "Which sentence uses aspect correctly for a story?", "options": ["Я пришёл домой и приготовил ужин", "Я приходил домой и готовил ужин", "Я прихожу домой и приготовил ужин"], "correct": 0, "explanation": "Perfective chain for sequential completed actions in narration."},
                {"type": "sentence_build", "words": ["купил", "магазин", "Я", "в", "и", "пошёл", "хлеб"], "correct_order": [2, 5, 3, 1, 4, 0, 6], "translation": "I went to the store and bought bread"},
            ],
            "2-1": [
                {"type": "multiple_choice", "question": "The genitive case answers:", "options": ["Кого? Чего? (Of whom? Of what?)", "Кому? (To whom?)", "Кем? (By whom?)", "О ком? (About whom?)"], "correct": 0, "explanation": "Genitive = кого? чего? Used for possession, absence, quantities."},
                {"type": "fill_blank", "sentence": "У ___ есть машина (My brother has a car) — брат in genitive", "answer": "брата", "hint": "Masculine animate nouns: add -а in genitive"},
                {"type": "matching", "instruction": "Form genitive case", "pairs": [["брат", "брата"], ["мама", "мамы"], ["окно", "окна"], ["книга", "книги"], ["студент", "студента"]]},
                {"type": "translation", "direction": "ru_to_en", "sentence": "У меня нет времени", "answer": "I don't have time", "alternatives": ["I have no time"], "explanation": "Нет + genitive = don't have. Время → времени (genitive)."},
                {"type": "multiple_choice", "question": "'Стакан воды' means:", "options": ["A glass of water", "A glass with water", "Water in a glass", "The glass is water"], "correct": 0, "explanation": "Genitive after quantity: стакан + воды (genitive of вода)."},
            ],
            "2-2": [
                {"type": "multiple_choice", "question": "The dative case answers:", "options": ["Кому? Чему? (To whom? To what?)", "Кого? Чего?", "Кем? Чем?", "О ком?"], "correct": 0, "explanation": "Dative = кому? чему? Used for indirect objects, age, and with certain verbs."},
                {"type": "fill_blank", "sentence": "Я дал книгу ___ (I gave the book to my friend) — друг in dative", "answer": "другу", "hint": "Masculine: add -у in dative"},
                {"type": "matching", "instruction": "Form dative case", "pairs": [["друг", "другу"], ["мама", "маме"], ["студент", "студенту"], ["сестра", "сестре"], ["брат", "брату"]]},
                {"type": "translation", "direction": "ru_to_en", "sentence": "Мне двадцать лет", "answer": "I am twenty years old", "alternatives": ["I'm twenty years old", "I'm 20 years old"], "explanation": "Мне (dative of я) + number + лет = age expression."},
                {"type": "multiple_choice", "question": "In 'Мне нравится музыка', 'мне' is:", "options": ["Dative case", "Accusative case", "Nominative case", "Genitive case"], "correct": 0, "explanation": "Нравиться uses dative for the person who likes something."},
            ],
            "2-3": [
                {"type": "multiple_choice", "question": "The instrumental case answers:", "options": ["Кем? Чем? (By whom? With what?)", "Кого? Чего?", "Кому? Чему?", "О ком?"], "correct": 0, "explanation": "Instrumental = кем? чем? Used with 'с' (with) and for instruments/means."},
                {"type": "fill_blank", "sentence": "Я пишу ___ (I write with a pen) — ручка in instrumental", "answer": "ручкой", "hint": "Feminine -а → -ой in instrumental"},
                {"type": "matching", "instruction": "Form instrumental case", "pairs": [["ручка (pen)", "ручкой"], ["друг (friend)", "другом"], ["мама (mom)", "мамой"], ["нож (knife)", "ножом"], ["студент", "студентом"]]},
                {"type": "translation", "direction": "en_to_ru", "sentence": "I drink coffee with milk", "answer": "Я пью кофе с молоком", "explanation": "С + instrumental. Молоко → молоком."},
            ],
            "2-4": [
                {"type": "matching", "instruction": "Match preposition to case", "pairs": [["в, на (location)", "Prepositional"], ["в, на (direction)", "Accusative"], ["из, от, без", "Genitive"], ["к, по", "Dative"], ["с, за, между", "Instrumental"]]},
                {"type": "multiple_choice", "question": "'Я иду в школу' — what case is 'школу'?", "options": ["Accusative (direction/motion)", "Prepositional (location)", "Genitive", "Dative"], "correct": 0, "explanation": "В + accusative = direction (going TO). В + prepositional = location (being AT)."},
                {"type": "fill_blank", "sentence": "Я живу в ___ (I live in Russia) — Россия in prepositional", "answer": "России", "hint": "Feminine -ия → -ии in prepositional"},
                {"type": "translation", "direction": "ru_to_en", "sentence": "Я еду из Москвы в Петербург", "answer": "I'm going from Moscow to Petersburg", "alternatives": ["I am going from Moscow to Saint Petersburg"], "explanation": "Из + genitive (from), в + accusative (to/direction)."},
                {"type": "multiple_choice", "question": "Which is correct: 'на столе' or 'на стол'?", "options": ["Both — столе is location, стол is direction", "Only на столе", "Only на стол", "Neither"], "correct": 0, "explanation": "На столе = on the table (location, prepositional). На стол = onto the table (direction, accusative)."},
            ],
            "3-1": [
                {"type": "translation", "direction": "en_to_ru", "sentence": "I think that this is interesting", "answer": "Я думаю, что это интересно", "explanation": "Я думаю, что... = I think that..."},
                {"type": "multiple_choice", "question": "How do you say 'In my opinion' in Russian?", "options": ["По-моему", "По-твоему", "По-нашему", "По-вашему"], "correct": 0, "explanation": "По-моему = in my opinion. По-твоему = in your opinion (informal)."},
                {"type": "fill_blank", "sentence": "Мне кажется, ___ это хорошая идея (It seems to me that this is a good idea)", "answer": "что", "hint": "The conjunction 'that'"},
                {"type": "matching", "instruction": "Match opinion phrases", "pairs": [["Я думаю", "I think"], ["Мне кажется", "It seems to me"], ["По-моему", "In my opinion"], ["Я считаю", "I believe"], ["Я уверен", "I am sure"]]},
            ],
            "3-2": [
                {"type": "multiple_choice", "question": "How do you say 'I agree' in Russian?", "options": ["Я согласен", "Я не согласен", "Может быть", "Конечно"], "correct": 0, "explanation": "Я согласен (m) / согласна (f) = I agree."},
                {"type": "matching", "instruction": "Match agreement/disagreement phrases", "pairs": [["Я согласен", "I agree"], ["Я не согласен", "I disagree"], ["Конечно", "Of course"], ["Может быть", "Maybe"], ["Ни в коем случае", "No way"]]},
                {"type": "translation", "direction": "en_to_ru", "sentence": "I disagree with you", "answer": "Я не согласен с вами", "alternatives": ["Я не согласна с вами", "Я с вами не согласен"], "explanation": "Не согласен с + instrumental = disagree with."},
                {"type": "fill_blank", "sentence": "Вы правы, но я ___ по-другому (You're right, but I think differently)", "answer": "думаю", "hint": "Verb 'to think' in я-form"},
            ],
            "3-3": [
                {"type": "translation", "direction": "en_to_ru", "sentence": "Last year I traveled to Italy", "answer": "В прошлом году я ездил в Италию", "alternatives": ["В прошлом году я ездила в Италию"], "explanation": "В прошлом году = last year, ездил = traveled."},
                {"type": "fill_blank", "sentence": "Это был самый ___ день в моей жизни (This was the happiest day of my life)", "answer": "счастливый", "hint": "Adjective meaning 'happy'"},
                {"type": "multiple_choice", "question": "Which phrase means 'I have never been to...'?", "options": ["Я никогда не был в...", "Я всегда был в...", "Я часто бываю в...", "Я хочу поехать в..."], "correct": 0, "explanation": "Никогда не был = never been. Никогда = never."},
                {"type": "sentence_build", "words": ["году", "В", "я", "Италию", "ездил", "прошлом", "в"], "correct_order": [1, 5, 0, 2, 4, 6, 3], "translation": "Last year I traveled to Italy"},
            ],
        },
    },
    "german": {
        "A1": {
            "1-1": [
                {"type": "multiple_choice", "question": "How do you say 'Hello' in German?", "options": ["Hallo", "Tschüss", "Danke", "Bitte"], "correct": 0, "explanation": "Hallo = Hello. Tschüss = Bye. Danke = Thanks. Bitte = Please."},
                {"type": "multiple_choice", "question": "Which is the FORMAL greeting?", "options": ["Guten Tag", "Hallo", "Hi", "Na"], "correct": 0, "explanation": "Guten Tag (Good day) is formal. Hallo/Hi are informal."},
                {"type": "translation", "direction": "de_to_en", "sentence": "Auf Wiedersehen", "answer": "Goodbye", "alternatives": ["See you again"], "explanation": "Auf Wiedersehen = formal goodbye (literally 'until we see again')."},
                {"type": "matching", "instruction": "Match greetings", "pairs": [["Guten Morgen", "Good morning"], ["Guten Tag", "Good day"], ["Guten Abend", "Good evening"], ["Gute Nacht", "Good night"], ["Tschüss", "Bye"]]},
            ],
            "1-2": [
                {"type": "multiple_choice", "question": "How do you say 'My name is Anna'?", "options": ["Ich heiße Anna", "Ich bin Anna", "Ich habe Anna", "Mein Anna"], "correct": 0, "explanation": "Ich heiße... = My name is... (literally 'I am called...'). Ich bin Anna also works."},
                {"type": "translation", "direction": "en_to_de", "sentence": "What is your name?", "answer": "Wie heißen Sie?", "alternatives": ["Wie heißt du?"], "explanation": "Wie heißen Sie? (formal) / Wie heißt du? (informal)."},
                {"type": "fill_blank", "sentence": "Ich ___ Max (My name is Max)", "answer": "heiße", "hint": "The verb 'heißen' in ich-form"},
                {"type": "sentence_build", "words": ["heiße", "Anna", "Ich"], "correct_order": [2, 0, 1], "translation": "My name is Anna"},
            ],
            "1-3": [
                {"type": "translation", "direction": "en_to_de", "sentence": "How are you? (informal)", "answer": "Wie geht es dir?", "alternatives": ["Wie geht's?", "Wie geht's dir?"], "explanation": "Wie geht es dir? (informal) / Wie geht es Ihnen? (formal)."},
                {"type": "matching", "instruction": "Match responses", "pairs": [["Gut", "Good"], ["Sehr gut", "Very good"], ["Nicht so gut", "Not so good"], ["Es geht", "It's okay"], ["Schlecht", "Bad"]]},
                {"type": "multiple_choice", "question": "'Danke, mir geht es gut' means:", "options": ["Thanks, I'm fine", "Thanks, I'm bad", "Thank you very much", "Thanks, see you"], "correct": 0, "explanation": "Danke = thanks, mir geht es gut = I'm fine."},
                {"type": "fill_blank", "sentence": "Wie geht es ___? (How are you? — formal)", "answer": "Ihnen", "hint": "Formal 'you' in dative"},
            ],
            "2-1": [
                {"type": "multiple_choice", "question": "Which article is masculine?", "options": ["der", "die", "das"], "correct": 0, "explanation": "Der = masculine, die = feminine, das = neuter."},
                {"type": "matching", "instruction": "Match noun to article", "pairs": [["der Mann", "the man"], ["die Frau", "the woman"], ["das Kind", "the child"], ["der Tisch", "the table"], ["die Katze", "the cat"]]},
                {"type": "multiple_choice", "question": "What article does 'Buch' (book) take?", "options": ["das", "der", "die"], "correct": 0, "explanation": "Das Buch = the book. Buch is neuter."},
                {"type": "fill_blank", "sentence": "___ Hund ist groß (The dog is big)", "answer": "Der", "hint": "Hund is masculine"},
            ],
            "2-2": [
                {"type": "multiple_choice", "question": "What is the plural of 'das Kind'?", "options": ["die Kinder", "die Kinds", "das Kinder", "der Kinder"], "correct": 0, "explanation": "All plurals use 'die'. Kind → Kinder."},
                {"type": "matching", "instruction": "Match singular to plural", "pairs": [["das Kind", "die Kinder"], ["der Mann", "die Männer"], ["die Frau", "die Frauen"], ["das Buch", "die Bücher"], ["der Hund", "die Hunde"]]},
                {"type": "fill_blank", "sentence": "Die ___ spielen im Park (The children play in the park)", "answer": "Kinder", "hint": "Plural of 'Kind'"},
            ],
            "3-1": [
                {"type": "matching", "instruction": "Match numbers", "pairs": [["eins", "1"], ["zwei", "2"], ["drei", "3"], ["vier", "4"], ["fünf", "5"]]},
                {"type": "matching", "instruction": "Match numbers 6-10", "pairs": [["sechs", "6"], ["sieben", "7"], ["acht", "8"], ["neun", "9"], ["zehn", "10"]]},
                {"type": "fill_blank", "sentence": "Sieben plus drei ist ___", "answer": "zehn", "hint": "7 + 3 = ?"},
                {"type": "translation", "direction": "de_to_en", "sentence": "zwanzig", "answer": "twenty", "alternatives": ["20"], "explanation": "Zwanzig = 20."},
            ],
            "3-2": [
                {"type": "multiple_choice", "question": "How do you ask 'What time is it?' in German?", "options": ["Wie spät ist es?", "Wie alt bist du?", "Wie heißen Sie?", "Wo ist das?"], "correct": 0, "explanation": "Wie spät ist es? = What time is it? (literally 'How late is it?')"},
                {"type": "translation", "direction": "de_to_en", "sentence": "Es ist drei Uhr", "answer": "It is three o'clock", "alternatives": ["It's three o'clock", "It's 3 o'clock"], "explanation": "Es ist... Uhr = It is... o'clock."},
                {"type": "fill_blank", "sentence": "Es ist halb ___ (It is half past two — 2:30)", "answer": "drei", "hint": "In German, 'halb drei' means half TO three = 2:30"},
            ],
            "4-1": [
                {"type": "translation", "direction": "en_to_de", "sentence": "Please", "answer": "Bitte", "explanation": "Bitte = please / you're welcome."},
                {"type": "translation", "direction": "en_to_de", "sentence": "Thank you very much", "answer": "Vielen Dank", "alternatives": ["Danke schön", "Danke sehr"], "explanation": "Vielen Dank / Danke schön = Thank you very much."},
                {"type": "matching", "instruction": "Match polite phrases", "pairs": [["Bitte", "Please"], ["Danke", "Thanks"], ["Entschuldigung", "Excuse me"], ["Es tut mir leid", "I'm sorry"], ["Kein Problem", "No problem"]]},
                {"type": "fill_blank", "sentence": "___, wo ist die Toilette? (Excuse me, where is the toilet?)", "answer": "Entschuldigung", "hint": "The polite way to get someone's attention"},
            ],
            "4-2": [
                {"type": "translation", "direction": "en_to_de", "sentence": "I would like a coffee, please", "answer": "Ich hätte gerne einen Kaffee, bitte", "alternatives": ["Ich möchte einen Kaffee, bitte"], "explanation": "Ich hätte gerne... = I would like... (polite café ordering)."},
                {"type": "matching", "instruction": "Match café vocabulary", "pairs": [["der Kaffee", "coffee"], ["der Tee", "tea"], ["das Wasser", "water"], ["das Bier", "beer"], ["der Kuchen", "cake"]]},
                {"type": "fill_blank", "sentence": "Die Rechnung, ___ (The bill, please)", "answer": "bitte", "hint": "The German word for 'please'"},
                {"type": "multiple_choice", "question": "'Zahlen, bitte' means:", "options": ["Pay, please (asking for the bill)", "Count, please", "Number, please", "More, please"], "correct": 0, "explanation": "Zahlen bitte = I'd like to pay (asking for the bill at a restaurant)."},
            ],
        },
    },
    "french": {
        "A1": {
            "1-1": [
                {"type": "multiple_choice", "question": "How do you say 'Hello' in French?", "options": ["Bonjour", "Au revoir", "Merci", "S'il vous plaît"], "correct": 0, "explanation": "Bonjour = Hello/Good day. Au revoir = Goodbye."},
                {"type": "translation", "direction": "fr_to_en", "sentence": "Au revoir", "answer": "Goodbye", "alternatives": ["See you", "Bye"], "explanation": "Au revoir = Goodbye (formal)."},
                {"type": "matching", "instruction": "Match greetings", "pairs": [["Bonjour", "Hello"], ["Bonsoir", "Good evening"], ["Bonne nuit", "Good night"], ["Salut", "Hi/Bye (informal)"], ["Au revoir", "Goodbye"]]},
                {"type": "fill_blank", "sentence": "___! Comment allez-vous? (Hello! How are you?)", "answer": "Bonjour", "hint": "The standard French greeting"},
            ],
            "1-2": [
                {"type": "translation", "direction": "en_to_fr", "sentence": "My name is Marie", "answer": "Je m'appelle Marie", "explanation": "Je m'appelle... = My name is... (literally 'I call myself...')."},
                {"type": "fill_blank", "sentence": "Je ___ Pierre (My name is Pierre)", "answer": "m'appelle", "hint": "Reflexive verb 's'appeler' in je-form"},
                {"type": "sentence_build", "words": ["m'appelle", "Marie", "Je"], "correct_order": [2, 0, 1], "translation": "My name is Marie"},
                {"type": "multiple_choice", "question": "'Comment vous appelez-vous?' means:", "options": ["What is your name? (formal)", "How are you?", "Where are you from?", "How old are you?"], "correct": 0, "explanation": "Comment vous appelez-vous? = What is your name? (formal)."},
            ],
            "1-3": [
                {"type": "matching", "instruction": "Match responses", "pairs": [["Très bien", "Very well"], ["Bien", "Good"], ["Comme ci, comme ça", "So-so"], ["Mal", "Bad"], ["Pas mal", "Not bad"]]},
                {"type": "translation", "direction": "fr_to_en", "sentence": "Ça va bien, merci", "answer": "I'm fine, thank you", "alternatives": ["It's going well, thanks"], "explanation": "Ça va bien = It's going well. Merci = thank you."},
                {"type": "fill_blank", "sentence": "Comment ___-vous? (How are you? — formal)", "answer": "allez", "hint": "The verb 'aller' (to go) in vous-form"},
            ],
            "2-1": [
                {"type": "multiple_choice", "question": "Which article is masculine singular?", "options": ["le", "la", "les", "l'"], "correct": 0, "explanation": "Le = masculine, la = feminine, les = plural, l' = before vowels."},
                {"type": "matching", "instruction": "Match the article", "pairs": [["le garçon", "the boy"], ["la fille", "the girl"], ["les enfants", "the children"], ["l'homme", "the man"], ["l'eau", "the water"]]},
                {"type": "fill_blank", "sentence": "___ chat est noir (The cat is black — chat is masculine)", "answer": "Le", "hint": "Masculine singular article"},
            ],
            "2-2": [
                {"type": "multiple_choice", "question": "'Un' is:", "options": ["Masculine indefinite article (a/an)", "Feminine indefinite article", "Plural article", "Definite article"], "correct": 0, "explanation": "Un = a (masculine), une = a (feminine), des = some (plural)."},
                {"type": "matching", "instruction": "Match indefinite articles", "pairs": [["un livre", "a book"], ["une maison", "a house"], ["des amis", "some friends"], ["un chat", "a cat"], ["une école", "a school"]]},
                {"type": "fill_blank", "sentence": "J'ai ___ sœur (I have a sister — sœur is feminine)", "answer": "une", "hint": "Feminine indefinite article"},
            ],
            "3-1": [
                {"type": "matching", "instruction": "Match numbers", "pairs": [["un", "1"], ["deux", "2"], ["trois", "3"], ["quatre", "4"], ["cinq", "5"]]},
                {"type": "matching", "instruction": "Match numbers 6-10", "pairs": [["six", "6"], ["sept", "7"], ["huit", "8"], ["neuf", "9"], ["dix", "10"]]},
                {"type": "fill_blank", "sentence": "Cinq plus cinq font ___", "answer": "dix", "hint": "5 + 5 = ?"},
                {"type": "translation", "direction": "fr_to_en", "sentence": "vingt", "answer": "twenty", "alternatives": ["20"], "explanation": "Vingt = 20."},
            ],
            "3-2": [
                {"type": "translation", "direction": "en_to_fr", "sentence": "Please", "answer": "S'il vous plaît", "alternatives": ["S'il te plaît"], "explanation": "S'il vous plaît (formal) / S'il te plaît (informal) = Please."},
                {"type": "matching", "instruction": "Match polite phrases", "pairs": [["Merci", "Thank you"], ["S'il vous plaît", "Please"], ["Excusez-moi", "Excuse me"], ["Pardon", "Sorry"], ["De rien", "You're welcome"]]},
                {"type": "fill_blank", "sentence": "Merci ___! (Thank you very much!)", "answer": "beaucoup", "hint": "The French word for 'a lot/much'"},
            ],
            "3-3": [
                {"type": "translation", "direction": "en_to_fr", "sentence": "A coffee, please", "answer": "Un café, s'il vous plaît", "alternatives": ["Un café, s'il te plaît"], "explanation": "Un café = a coffee."},
                {"type": "matching", "instruction": "Match café vocabulary", "pairs": [["un café", "a coffee"], ["un thé", "a tea"], ["un croissant", "a croissant"], ["l'addition", "the bill"], ["de l'eau", "some water"]]},
                {"type": "fill_blank", "sentence": "L'___, s'il vous plaît (The bill, please)", "answer": "addition", "hint": "The French word for 'bill' at a restaurant"},
            ],
        },
    },
    "spanish": {
        "A1": {
            "1-1": [
                {"type": "multiple_choice", "question": "How do you say 'Hello' in Spanish?", "options": ["Hola", "Adiós", "Gracias", "Por favor"], "correct": 0, "explanation": "Hola = Hello. Adiós = Goodbye. Gracias = Thanks."},
                {"type": "translation", "direction": "es_to_en", "sentence": "Buenos días", "answer": "Good morning", "alternatives": ["Good day"], "explanation": "Buenos días = Good morning/day."},
                {"type": "matching", "instruction": "Match greetings", "pairs": [["Buenos días", "Good morning"], ["Buenas tardes", "Good afternoon"], ["Buenas noches", "Good evening/night"], ["Hola", "Hello"], ["Adiós", "Goodbye"]]},
                {"type": "fill_blank", "sentence": "¡___! ¿Cómo estás? (Hello! How are you?)", "answer": "Hola", "hint": "The most common Spanish greeting"},
            ],
            "1-2": [
                {"type": "translation", "direction": "en_to_es", "sentence": "My name is Carlos", "answer": "Me llamo Carlos", "alternatives": ["Mi nombre es Carlos"], "explanation": "Me llamo... = My name is... (literally 'I call myself...')."},
                {"type": "fill_blank", "sentence": "Me ___ María (My name is María)", "answer": "llamo", "hint": "The verb 'llamarse' in yo-form"},
                {"type": "sentence_build", "words": ["llamo", "Carlos", "Me"], "correct_order": [2, 0, 1], "translation": "My name is Carlos"},
                {"type": "multiple_choice", "question": "'¿Cómo te llamas?' means:", "options": ["What's your name? (informal)", "How are you?", "Where are you from?", "How old are you?"], "correct": 0, "explanation": "¿Cómo te llamas? = What's your name? (informal)."},
            ],
            "1-3": [
                {"type": "matching", "instruction": "Match responses", "pairs": [["Muy bien", "Very well"], ["Bien", "Good"], ["Regular", "So-so"], ["Mal", "Bad"], ["Más o menos", "More or less"]]},
                {"type": "translation", "direction": "es_to_en", "sentence": "Estoy bien, gracias", "answer": "I'm fine, thank you", "alternatives": ["I'm good, thanks"], "explanation": "Estoy bien = I'm fine. Gracias = thank you."},
                {"type": "fill_blank", "sentence": "¿Cómo ___? (How are you? — informal)", "answer": "estás", "hint": "The verb 'estar' in tú-form"},
            ],
            "2-1": [
                {"type": "multiple_choice", "question": "Which article is masculine singular?", "options": ["el", "la", "los", "las"], "correct": 0, "explanation": "El = masculine singular, la = feminine singular, los = masculine plural, las = feminine plural."},
                {"type": "matching", "instruction": "Match articles", "pairs": [["el libro", "the book"], ["la casa", "the house"], ["los niños", "the children (m)"], ["las mujeres", "the women"], ["el agua", "the water"]]},
                {"type": "fill_blank", "sentence": "___ gato es negro (The cat is black — gato is masculine)", "answer": "El", "hint": "Masculine singular definite article"},
            ],
            "2-2": [
                {"type": "multiple_choice", "question": "'Un' is:", "options": ["Masculine indefinite article", "Feminine indefinite article", "Definite article", "Plural article"], "correct": 0, "explanation": "Un = a (masculine), una = a (feminine), unos/unas = some (plural)."},
                {"type": "matching", "instruction": "Match indefinite articles", "pairs": [["un libro", "a book"], ["una casa", "a house"], ["unos amigos", "some friends (m)"], ["unas flores", "some flowers"], ["un perro", "a dog"]]},
                {"type": "fill_blank", "sentence": "Tengo ___ hermana (I have a sister — hermana is feminine)", "answer": "una", "hint": "Feminine indefinite article"},
            ],
            "3-1": [
                {"type": "matching", "instruction": "Match numbers", "pairs": [["uno", "1"], ["dos", "2"], ["tres", "3"], ["cuatro", "4"], ["cinco", "5"]]},
                {"type": "matching", "instruction": "Match numbers 6-10", "pairs": [["seis", "6"], ["siete", "7"], ["ocho", "8"], ["nueve", "9"], ["diez", "10"]]},
                {"type": "fill_blank", "sentence": "Cinco más cinco son ___", "answer": "diez", "hint": "5 + 5 = ?"},
                {"type": "translation", "direction": "es_to_en", "sentence": "veinte", "answer": "twenty", "alternatives": ["20"], "explanation": "Veinte = 20."},
            ],
            "3-2": [
                {"type": "translation", "direction": "en_to_es", "sentence": "Please", "answer": "Por favor", "explanation": "Por favor = Please."},
                {"type": "matching", "instruction": "Match polite phrases", "pairs": [["Gracias", "Thank you"], ["Por favor", "Please"], ["Perdón", "Sorry"], ["Disculpe", "Excuse me"], ["De nada", "You're welcome"]]},
                {"type": "fill_blank", "sentence": "Muchas ___! (Thank you very much!)", "answer": "gracias", "hint": "The Spanish word for 'thanks'"},
            ],
            "3-3": [
                {"type": "translation", "direction": "en_to_es", "sentence": "A coffee, please", "answer": "Un café, por favor", "explanation": "Un café = a coffee. Por favor = please."},
                {"type": "matching", "instruction": "Match café vocabulary", "pairs": [["un café", "a coffee"], ["un té", "a tea"], ["agua", "water"], ["la cuenta", "the bill"], ["un zumo", "a juice"]]},
                {"type": "fill_blank", "sentence": "La ___, por favor (The bill, please)", "answer": "cuenta", "hint": "The Spanish word for 'bill' at a restaurant"},
            ],
        },
    },
}


# ---------- LLM Exercise Generation ----------

async def _generate_exercises_llm(language: str, level: str, unit: int, lesson: int,
                                   lesson_title: str, lesson_type: str, count: int, provider: str):
    """Use LLM to generate exercises when not in the static bank."""
    system = (
        f"You are a {language} language teacher creating exercises for CEFR level {level}. "
        f"Generate exactly {count} diverse exercises for the lesson: '{lesson_title}' (type: {lesson_type}).\n\n"
        "Return ONLY valid JSON array, no markdown fences:\n"
        "[\n"
        '  {"type": "multiple_choice", "question": "...", "options": ["a", "b", "c", "d"], "correct": 0, "explanation": "..."},\n'
        '  {"type": "fill_blank", "sentence": "... ___ ...", "answer": "...", "hint": "...", "explanation": "..."},\n'
        '  {"type": "translation", "direction": "ru_to_en" or "en_to_ru", "sentence": "...", "answer": "...", "alternatives": [], "explanation": "..."},\n'
        '  {"type": "matching", "instruction": "Match ...", "pairs": [["left1", "right1"], ...]},\n'
        '  {"type": "sentence_build", "words": ["word1", "word2", "word3"], "correct_order": [2, 0, 1], "translation": "English meaning"}\n'
        "]\n\n"
        "Use a mix of exercise types. All answers must be correct. Include explanations for learning."
    )
    user_msg = f"Language: {language}\nLevel: {level}\nLesson: {lesson_title}\nType: {lesson_type}\nGenerate {count} exercises."
    raw = await _call_llm(system, user_msg, provider)
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\[[\s\S]*\]", cleaned)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        return []


@router.get("/exercises/{language}/{level}/{unit_id}/{lesson_id}")
async def get_exercises(
    language: str, level: str, unit_id: int, lesson_id: int,
    user: User = Depends(get_current_user),
):
    """Return exercises for a specific lesson. Uses static bank first, then LLM."""
    key = f"{unit_id}-{lesson_id}"
    static = EXERCISE_BANK.get(language, {}).get(level, {}).get(key)
    if static:
        return {"exercises": static, "source": "static"}

    # Fallback to LLM
    lang_data = CURRICULUM.get(language, {})
    level_data = lang_data.get("levels", {}).get(level, {})
    unit = next((u for u in level_data.get("units", []) if u["id"] == unit_id), None)
    if not unit:
        raise HTTPException(status_code=404, detail="Lesson not found")
    lesson = next((l for l in unit["lessons"] if l["id"] == lesson_id), None)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    try:
        exercises = await _generate_exercises_llm(
            language, level, unit_id, lesson_id,
            lesson["title"], lesson["type"], 5, "deepseek"
        )
        if exercises:
            return {"exercises": exercises, "source": "llm"}
    except Exception as e:
        logger.warning("LLM exercise generation unavailable: %s", e)

    # Graceful fallback: generate basic exercises from the lesson metadata
    fallback = [
        {
            "type": "multiple_choice",
            "question": f"This is a {lesson['type']} lesson: {lesson['title']}. Which CEFR level is this?",
            "options": ["A1", "A2", "B1", "B2"],
            "correct": ["A1", "A2", "B1", "B2", "C1"].index(level) if level in ["A1", "A2", "B1", "B2"] else 0,
            "explanation": f"This lesson is at {level} ({CURRICULUM[language]['levels'][level]['name']}) level.",
        },
        {
            "type": "fill_blank",
            "sentence": f"Complete the exercise for: {lesson['title']}. Type the lesson type: ___",
            "answer": lesson["type"],
            "hint": f"The lesson type is '{lesson['type']}'",
            "explanation": "LLM-generated exercises are unavailable. Contact admin to configure an API key.",
        },
    ]
    return {"exercises": fallback, "source": "fallback", "note": "LLM unavailable — showing basic exercises. Full exercises require an active LLM API key."}


@router.post("/progress/{language}/update")
async def update_progress(
    language: str,
    req: ProgressUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user's progress after completing a lesson."""
    result = await db.execute(
        select(LangProgress).where(
            LangProgress.user_id == user.id,
            LangProgress.language == language,
        )
    )
    progress = result.scalar_one_or_none()
    if not progress:
        progress = LangProgress(user_id=user.id, language=language, level=req.level,
                                unit=req.unit, lesson=req.lesson, completed_lessons=[])
        db.add(progress)
        await db.flush()

    # Update stats
    progress.exercises_completed = (progress.exercises_completed or 0) + req.total
    progress.exercises_correct = (progress.exercises_correct or 0) + req.correct

    # Award XP (proportional to correctness)
    xp_fraction = req.correct / req.total if req.total > 0 else 0
    xp_awarded = int(req.xp_earned * xp_fraction)
    progress.xp = (progress.xp or 0) + xp_awarded

    # Mark lesson complete if >= 70% correct
    if xp_fraction >= 0.7:
        key = f"{req.level}-{req.unit}-{req.lesson}"
        completed = progress.completed_lessons or []
        if key not in completed:
            completed.append(key)
            progress.completed_lessons = completed

    # Streak tracking
    now = datetime.now(timezone.utc)
    if progress.last_activity:
        last = progress.last_activity
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        delta_hours = (now - last).total_seconds() / 3600
        if delta_hours < 24:
            pass  # same day, no change
        elif delta_hours < 48:
            progress.streak_days = (progress.streak_days or 0) + 1
        else:
            progress.streak_days = 1
    else:
        progress.streak_days = 1

    progress.last_activity = now
    progress.level = req.level

    await db.commit()

    return {
        "xp_awarded": xp_awarded,
        "total_xp": progress.xp,
        "streak_days": progress.streak_days,
        "completed": xp_fraction >= 0.7,
    }


@router.post("/check-answer")
async def check_answer(
    req: CheckAnswerRequest,
    user: User = Depends(get_current_user),
):
    """Use LLM to grade a free-text answer."""
    system = (
        f"You are a {req.language} language teacher grading a student's answer. "
        "Return ONLY valid JSON:\n"
        '{"correct": true/false, "score": 0-100, "explanation": "Brief feedback", "correct_answer": "The ideal answer"}'
    )
    user_msg = (
        f"Question/prompt: {req.question}\n"
        f"Expected answer: {req.correct_answer}\n"
        f"Student's answer: {req.user_answer}\n"
        f"Exercise type: {req.exercise_type}"
    )
    try:
        raw = await _call_llm(system, user_msg, req.provider)
        cleaned = raw.strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        return json.loads(cleaned)
    except Exception as e:
        logger.error("Answer check failed: %s", e)
        return {"correct": False, "score": 0, "explanation": "Could not grade answer automatically"}


@router.post("/placement-test")
async def placement_test(
    req: PlacementTestRequest,
    user: User = Depends(get_current_user),
):
    """Generate a placement test to determine user's starting level."""
    # Mix of exercises from A1, A2, B1, B2
    test = []
    for level in ["A1", "A2", "B1", "B2"]:
        # Get first static exercise set from each level if available
        level_bank = EXERCISE_BANK.get(req.language, {}).get(level, {})
        for key, exercises in list(level_bank.items())[:1]:
            for ex in exercises[:3]:
                test.append({**ex, "_level": level})
    return {"exercises": test, "total": len(test)}
