"""
iKo MathLab — Computational knowledge engine with step-by-step solutions.

Solves equations, computes integrals/derivatives, matrix operations,
statistical formulas, and unit conversions using SymPy + LLM explanation.
"""

import json
import re
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import User
from auth import get_current_user
from litreview import _call_llm

import sympy
from sympy import symbols, solve, diff, integrate, simplify, expand, factor
from sympy import Matrix, det, Rational, oo, pi, E, sqrt, sin, cos, tan, log, exp
from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application
from sympy import latex as sympy_latex

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mathlab", tags=["mathlab"])


# ---------- Schemas ----------

class SolveRequest(BaseModel):
    query: str
    mode: str = "auto"  # auto, solve, differentiate, integrate, simplify, matrix, stats
    provider: str = "deepseek"


class FormulaLookupRequest(BaseModel):
    topic: str
    field: str = "statistics"


# ---------- SymPy Helpers ----------

TRANSFORMATIONS = standard_transformations + (implicit_multiplication_application,)


def safe_parse(expr_str: str):
    """Parse a math expression string into SymPy, with common substitutions."""
    cleaned = expr_str.strip()
    cleaned = cleaned.replace("^", "**")
    cleaned = cleaned.replace("ln(", "log(")
    x, y, z, t, n, a, b, c = symbols("x y z t n a b c")
    local_dict = {"x": x, "y": y, "z": z, "t": t, "n": n, "a": a, "b": b, "c": c,
                  "pi": pi, "e": E, "inf": oo}
    try:
        return parse_expr(cleaned, local_dict=local_dict, transformations=TRANSFORMATIONS)
    except Exception:
        return None


def to_latex(expr) -> str:
    try:
        return sympy_latex(expr)
    except Exception:
        return str(expr)


# ---------- Endpoints ----------

@router.post("/solve")
async def solve_math(
    req: SolveRequest,
    user: User = Depends(get_current_user),
):
    """Solve a math problem with step-by-step explanation."""
    query = req.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="No query provided")

    result = {"query": query, "mode": req.mode}
    sympy_result = None
    steps = []

    # Try SymPy computation first
    try:
        if req.mode == "solve" or (req.mode == "auto" and ("=" in query or "solve" in query.lower())):
            # Equation solving
            eq_str = query.lower().replace("solve", "").replace("for", "").strip()
            if "=" in eq_str:
                left, right = eq_str.split("=", 1)
                expr = safe_parse(f"({left}) - ({right})")
            else:
                expr = safe_parse(eq_str)

            if expr is not None:
                x = symbols("x")
                solutions = solve(expr, x)
                sympy_result = solutions
                steps.append(f"Expression: ${to_latex(expr)} = 0$")
                steps.append(f"Solving for x...")
                for i, sol in enumerate(solutions):
                    steps.append(f"Solution {i+1}: $x = {to_latex(sol)}$")
                result["solutions"] = [to_latex(s) for s in solutions]
                result["latex"] = f"{to_latex(expr)} = 0"

        elif req.mode == "differentiate" or (req.mode == "auto" and ("deriv" in query.lower() or "d/dx" in query.lower())):
            clean = re.sub(r"(?:d/d[a-z]|derivative of|differentiate)\s*", "", query, flags=re.IGNORECASE).strip()
            expr = safe_parse(clean)
            if expr is not None:
                x = symbols("x")
                derivative = diff(expr, x)
                sympy_result = derivative
                steps.append(f"$f(x) = {to_latex(expr)}$")
                steps.append(f"$f'(x) = {to_latex(derivative)}$")
                simplified = simplify(derivative)
                if simplified != derivative:
                    steps.append(f"Simplified: $f'(x) = {to_latex(simplified)}$")
                result["derivative"] = to_latex(simplified)
                result["latex"] = to_latex(simplified)

        elif req.mode == "integrate" or (req.mode == "auto" and "integr" in query.lower()):
            clean = re.sub(r"(?:integral of|integrate)\s*", "", query, flags=re.IGNORECASE).strip()
            clean = re.sub(r"\s*d[a-z]\s*$", "", clean)
            expr = safe_parse(clean)
            if expr is not None:
                x = symbols("x")
                integral = integrate(expr, x)
                sympy_result = integral
                steps.append(f"$\\int {to_latex(expr)} \\, dx$")
                steps.append(f"$= {to_latex(integral)} + C$")
                result["integral"] = to_latex(integral) + " + C"
                result["latex"] = f"\\int {to_latex(expr)} \\, dx = {to_latex(integral)} + C"

        elif req.mode == "simplify" or (req.mode == "auto" and "simplif" in query.lower()):
            clean = re.sub(r"simplify\s*", "", query, flags=re.IGNORECASE).strip()
            expr = safe_parse(clean)
            if expr is not None:
                simplified = simplify(expr)
                expanded = expand(expr)
                factored = factor(expr)
                steps.append(f"Original: ${to_latex(expr)}$")
                steps.append(f"Simplified: ${to_latex(simplified)}$")
                if expanded != simplified:
                    steps.append(f"Expanded: ${to_latex(expanded)}$")
                if factored != simplified and factored != expr:
                    steps.append(f"Factored: ${to_latex(factored)}$")
                result["simplified"] = to_latex(simplified)
                result["expanded"] = to_latex(expanded)
                result["factored"] = to_latex(factored)
                result["latex"] = to_latex(simplified)

    except Exception as e:
        logger.warning("SymPy computation failed for '%s': %s", query, e)

    # LLM explanation (always, enriches the SymPy result)
    system = (
        "You are a math tutor. Provide a clear step-by-step solution to the given math problem. "
        "Use LaTeX notation: $inline$ and $$display$$. "
        "If the problem involves statistics, include the formula name and when to use it. "
        "Keep explanations clear for a university student."
    )

    context = f"Problem: {query}"
    if steps:
        context += f"\n\nSymPy computed: {'; '.join(steps)}"
    context += "\n\nProvide a step-by-step explanation."

    try:
        explanation = await _call_llm(system, context, req.provider)
        result["explanation"] = explanation
    except Exception:
        result["explanation"] = "\n".join(steps) if steps else "Could not generate explanation."

    result["steps"] = steps
    result["computed"] = sympy_result is not None

    return result


@router.post("/formula-lookup")
async def formula_lookup(
    req: FormulaLookupRequest,
    user: User = Depends(get_current_user),
):
    """Look up formulas and when to use them."""
    system = (
        "You are a formula reference guide. Given a topic and field, provide:\n"
        "1. The formula with LaTeX notation\n"
        "2. What each variable means\n"
        "3. When to use this formula\n"
        "4. An example calculation\n"
        "5. Common mistakes to avoid\n\n"
        "Use $inline$ and $$display$$ LaTeX. Be specific and practical."
    )
    user_msg = f"Topic: {req.topic}\nField: {req.field}\nProvide the relevant formulas."

    try:
        result = await _call_llm(system, user_msg, "deepseek")
        return {"topic": req.topic, "field": req.field, "content": result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ---------- Common Statistical Formulas Reference ----------

STAT_FORMULAS = {
    "sample_size": {
        "name": "Sample Size (proportions)",
        "formula": "n = (Z^2 * p * (1-p)) / E^2",
        "latex": "n = \\frac{Z^2 \\cdot p(1-p)}{E^2}",
        "variables": {"Z": "Z-score (1.96 for 95% CI)", "p": "estimated proportion", "E": "margin of error"},
    },
    "effect_size_cohen_d": {
        "name": "Cohen's d (effect size)",
        "formula": "d = (M1 - M2) / SD_pooled",
        "latex": "d = \\frac{M_1 - M_2}{SD_{pooled}}",
        "variables": {"M1": "mean of group 1", "M2": "mean of group 2", "SD_pooled": "pooled standard deviation"},
    },
    "confidence_interval": {
        "name": "Confidence Interval (mean)",
        "formula": "CI = x̄ ± Z * (σ / √n)",
        "latex": "CI = \\bar{x} \\pm Z \\cdot \\frac{\\sigma}{\\sqrt{n}}",
        "variables": {"x̄": "sample mean", "Z": "Z-score", "σ": "standard deviation", "n": "sample size"},
    },
    "pearson_r": {
        "name": "Pearson correlation coefficient",
        "latex": "r = \\frac{\\sum(x_i - \\bar{x})(y_i - \\bar{y})}{\\sqrt{\\sum(x_i - \\bar{x})^2 \\sum(y_i - \\bar{y})^2}}",
        "variables": {"x_i": "individual x values", "y_i": "individual y values"},
    },
    "chi_square": {
        "name": "Chi-square statistic",
        "latex": "\\chi^2 = \\sum \\frac{(O_i - E_i)^2}{E_i}",
        "variables": {"O_i": "observed frequency", "E_i": "expected frequency"},
    },
}


@router.get("/formulas")
async def list_formulas(user: User = Depends(get_current_user)):
    """Return common statistical formula references."""
    return {"formulas": STAT_FORMULAS}
