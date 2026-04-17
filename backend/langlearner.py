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
    "german": {"name": "German", "native_name": "Deutsch", "flag": "🇩🇪", "available": False, "levels": {}},
    "french": {"name": "French", "native_name": "Français", "flag": "🇫🇷", "available": False, "levels": {}},
    "spanish": {"name": "Spanish", "native_name": "Español", "flag": "🇪🇸", "available": False, "levels": {}},
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
        }
    }
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
