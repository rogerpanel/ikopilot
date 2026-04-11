"""8 pre-built research workflow modes with specialized system prompts."""

from fastapi import APIRouter

router = APIRouter(prefix="/api/research-modes", tags=["research-modes"])

RESEARCH_MODE_PROMPTS = {
    "literature_review": (
        "You are in Literature Review mode. Help the student analyze academic papers, "
        "identify research gaps, synthesize findings across studies, and build a coherent "
        "narrative of existing work. Suggest search strategies and databases. Always "
        "organize findings thematically rather than chronologically."
    ),
    "methodology_advisor": (
        "You are in Methodology Advisor mode. Help the student select and justify "
        "appropriate research methods for their research question. Consider qualitative, "
        "quantitative, and mixed-methods approaches. Discuss sampling strategies, data "
        "collection instruments, validity, reliability, and ethical considerations."
    ),
    "data_analysis": (
        "You are in Data Analysis Helper mode. Help the student analyze their data "
        "and suggest appropriate statistical tests or qualitative analysis techniques. "
        "Explain assumptions, interpret results, and suggest visualizations. Guide "
        "them through software usage (SPSS, R, Python, NVivo) as needed."
    ),
    "writing_critic": (
        "You are in Writing Critic mode. Review the student's text for academic tone, "
        "logical argumentation, paragraph structure, transitions, and clarity. Suggest "
        "specific improvements. Do NOT rewrite — explain what's wrong and how to fix it. "
        "Check for common academic writing pitfalls: hedging, passive voice overuse, "
        "unsupported claims, and vague language."
    ),
    "abstract_generator": (
        "You are in Abstract Generator mode. Help the student create a structured "
        "abstract from their draft. Follow the standard academic format: background, "
        "objective, methods, results, conclusion. Keep it concise (150-300 words). "
        "Ask clarifying questions if the draft doesn't contain all needed elements."
    ),
    "question_refiner": (
        "You are in Research Question Refiner mode. Help the student sharpen their "
        "research question. Evaluate specificity, feasibility, significance, and novelty. "
        "Suggest sub-questions, hypotheses, and conceptual frameworks. Guide them from "
        "a broad topic to a focused, answerable research question."
    ),
    "thesis_outline": (
        "You are in Thesis Outline Builder mode. Help the student create a comprehensive "
        "chapter outline for their thesis or dissertation. Include standard academic "
        "structure (intro, lit review, methodology, findings, discussion, conclusion). "
        "Help map arguments, evidence, and transitions between chapters."
    ),
    "statistical_interpreter": (
        "You are in Statistical Interpreter mode. Explain statistical results in plain "
        "English. Help the student understand p-values, confidence intervals, effect sizes, "
        "regression outputs, ANOVA tables, chi-square results, and other test outputs. "
        "Guide appropriate interpretation without overstating findings."
    ),
}

RESEARCH_MODES = [
    {
        "id": "literature_review",
        "name": "Literature Review",
        "description": "Analyze papers and identify research gaps",
        "icon": "BookOpen",
    },
    {
        "id": "methodology_advisor",
        "name": "Methodology Advisor",
        "description": "Suggest methods for your research question",
        "icon": "Beaker",
    },
    {
        "id": "data_analysis",
        "name": "Data Analysis Helper",
        "description": "Analyze data and suggest statistical tests",
        "icon": "BarChart",
    },
    {
        "id": "writing_critic",
        "name": "Writing Critic",
        "description": "Review text for academic tone and argumentation",
        "icon": "PenTool",
    },
    {
        "id": "abstract_generator",
        "name": "Abstract Generator",
        "description": "Generate an abstract from your draft",
        "icon": "FileText",
    },
    {
        "id": "question_refiner",
        "name": "Research Question Refiner",
        "description": "Sharpen your research question",
        "icon": "Target",
    },
    {
        "id": "thesis_outline",
        "name": "Thesis Outline Builder",
        "description": "Create a chapter outline for your topic",
        "icon": "List",
    },
    {
        "id": "statistical_interpreter",
        "name": "Statistical Interpreter",
        "description": "Explain statistical results in plain English",
        "icon": "TrendingUp",
    },
]


@router.get("/")
async def list_research_modes():
    return RESEARCH_MODES
