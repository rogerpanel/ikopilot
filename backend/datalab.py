"""
iKo DataLab — Research data analysis platform.

Upload CSV/Excel/images, explore data, run statistical tests,
generate visualizations, train ML models, and get LLM interpretations.
"""

import io
import json
import re
import base64
import logging
from typing import Optional

import pandas as pd
import numpy as np
from scipy import stats
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    mean_squared_error, r2_score, silhouette_score,
    classification_report, confusion_matrix,
)
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel

from database import User
from auth import get_current_user
from litreview import _call_llm

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/datalab", tags=["datalab"])

# In-memory session storage for uploaded datasets (keyed by user_id)
_datasets: dict[int, dict] = {}

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB
MAX_ROWS_DISPLAY = 500


def _get_dataset(user_id: int) -> pd.DataFrame:
    if user_id not in _datasets or "df" not in _datasets[user_id]:
        raise HTTPException(status_code=400, detail="No dataset uploaded. Upload a CSV or Excel file first.")
    return _datasets[user_id]["df"]


def _fig_to_base64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="#111827", edgecolor="none")
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode()


def _style_plot(ax, title=""):
    ax.set_facecolor("#1F2937")
    ax.figure.set_facecolor("#111827")
    ax.title.set_color("white")
    ax.xaxis.label.set_color("white")
    ax.yaxis.label.set_color("white")
    ax.tick_params(colors="white")
    for spine in ax.spines.values():
        spine.set_color("#374151")
    if title:
        ax.set_title(title, color="white", fontsize=12, fontweight="bold")


# ---------- Upload ----------

@router.post("/upload")
async def upload_data(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Upload a CSV or Excel file for analysis."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ("csv", "xlsx", "xls", "tsv"):
        raise HTTPException(status_code=400, detail="Upload CSV, TSV, or Excel files (.csv, .tsv, .xlsx, .xls)")

    data = await file.read()
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum 50 MB.")

    try:
        if ext == "csv":
            df = pd.read_csv(io.BytesIO(data))
        elif ext == "tsv":
            df = pd.read_csv(io.BytesIO(data), sep="\t")
        else:
            df = pd.read_excel(io.BytesIO(data))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")

    _datasets[user.id] = {"df": df, "filename": file.filename}

    # Auto-detect column types
    columns = []
    for col in df.columns:
        dtype = str(df[col].dtype)
        if df[col].dtype in ["int64", "float64"]:
            col_type = "numeric"
        elif df[col].dtype == "bool":
            col_type = "boolean"
        else:
            nunique = df[col].nunique()
            col_type = "categorical" if nunique < min(20, len(df) * 0.1) else "text"
        columns.append({
            "name": col, "dtype": dtype, "type": col_type,
            "missing": int(df[col].isnull().sum()),
            "unique": int(df[col].nunique()),
        })

    return {
        "filename": file.filename,
        "rows": len(df),
        "columns": columns,
        "preview": json.loads(df.head(10).to_json(orient="records", default_handler=str)),
        "memory_mb": round(df.memory_usage(deep=True).sum() / 1024 / 1024, 2),
    }


# ---------- Explore ----------

@router.get("/summary")
async def data_summary(user: User = Depends(get_current_user)):
    """Return descriptive statistics for the uploaded dataset."""
    df = _get_dataset(user.id)

    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    cat_cols = df.select_dtypes(include=["object", "category", "bool"]).columns.tolist()

    summary = {
        "shape": {"rows": len(df), "columns": len(df.columns)},
        "missing_total": int(df.isnull().sum().sum()),
        "missing_pct": round(df.isnull().sum().sum() / (len(df) * len(df.columns)) * 100, 2),
        "numeric_columns": numeric_cols,
        "categorical_columns": cat_cols,
        "dtypes": {col: str(df[col].dtype) for col in df.columns},
    }

    if numeric_cols:
        desc = df[numeric_cols].describe().round(4)
        summary["numeric_stats"] = json.loads(desc.to_json(default_handler=str))

    if cat_cols:
        cat_stats = {}
        for col in cat_cols[:10]:
            vc = df[col].value_counts().head(10)
            cat_stats[col] = {"top_values": json.loads(vc.to_json()), "unique": int(df[col].nunique())}
        summary["categorical_stats"] = cat_stats

    return summary


@router.get("/correlations")
async def correlations(user: User = Depends(get_current_user)):
    """Return correlation matrix for numeric columns."""
    df = _get_dataset(user.id)
    numeric = df.select_dtypes(include=[np.number])
    if numeric.shape[1] < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 numeric columns for correlations")

    corr = numeric.corr().round(4)

    # Generate heatmap
    fig, ax = plt.subplots(figsize=(max(8, numeric.shape[1]), max(6, numeric.shape[1] * 0.8)))
    _style_plot(ax, "Correlation Matrix")
    im = ax.imshow(corr.values, cmap="RdBu_r", vmin=-1, vmax=1, aspect="auto")
    ax.set_xticks(range(len(corr.columns)))
    ax.set_yticks(range(len(corr.columns)))
    ax.set_xticklabels(corr.columns, rotation=45, ha="right", fontsize=8, color="white")
    ax.set_yticklabels(corr.columns, fontsize=8, color="white")
    for i in range(len(corr)):
        for j in range(len(corr)):
            ax.text(j, i, f"{corr.values[i, j]:.2f}", ha="center", va="center",
                    fontsize=7, color="white" if abs(corr.values[i, j]) > 0.5 else "gray")
    fig.colorbar(im, ax=ax, shrink=0.8)

    return {
        "matrix": json.loads(corr.to_json(default_handler=str)),
        "chart": _fig_to_base64(fig),
    }


# ---------- Visualize ----------

class VisualizeRequest(BaseModel):
    chart_type: str  # histogram, scatter, bar, box, line, pie
    x_column: str
    y_column: str = ""
    hue_column: str = ""
    title: str = ""
    bins: int = 30


@router.post("/visualize")
async def visualize(req: VisualizeRequest, user: User = Depends(get_current_user)):
    """Generate a chart from the uploaded dataset."""
    df = _get_dataset(user.id)

    if req.x_column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{req.x_column}' not found")
    if req.y_column and req.y_column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{req.y_column}' not found")

    fig, ax = plt.subplots(figsize=(10, 6))
    title = req.title or f"{req.chart_type.title()}: {req.x_column}"

    try:
        if req.chart_type == "histogram":
            ax.hist(df[req.x_column].dropna(), bins=req.bins, color="#F97316", edgecolor="#1F2937", alpha=0.8)
            ax.set_xlabel(req.x_column)
            ax.set_ylabel("Frequency")

        elif req.chart_type == "scatter":
            if not req.y_column:
                raise HTTPException(status_code=400, detail="Scatter plot requires y_column")
            colors = "#F97316"
            if req.hue_column and req.hue_column in df.columns:
                cats = df[req.hue_column].astype("category").cat.codes
                colors = plt.cm.tab10(cats / max(cats.max(), 1))
            ax.scatter(df[req.x_column], df[req.y_column], c=colors, alpha=0.6, s=30)
            ax.set_xlabel(req.x_column)
            ax.set_ylabel(req.y_column)

        elif req.chart_type == "bar":
            vc = df[req.x_column].value_counts().head(20)
            ax.barh(vc.index.astype(str), vc.values, color="#3B82F6")
            ax.set_xlabel("Count")

        elif req.chart_type == "box":
            cols = [req.x_column]
            if req.y_column:
                cols.append(req.y_column)
            data_to_plot = [df[c].dropna().values for c in cols]
            bp = ax.boxplot(data_to_plot, labels=cols, patch_artist=True)
            for patch in bp["boxes"]:
                patch.set_facecolor("#F97316")
                patch.set_alpha(0.7)

        elif req.chart_type == "line":
            ax.plot(df[req.x_column].values, color="#F97316", linewidth=1.5)
            if req.y_column:
                ax.plot(df[req.y_column].values, color="#3B82F6", linewidth=1.5)
                ax.legend([req.x_column, req.y_column], labelcolor="white")
            ax.set_xlabel("Index")

        elif req.chart_type == "pie":
            vc = df[req.x_column].value_counts().head(8)
            colors_list = plt.cm.Set3(np.linspace(0, 1, len(vc)))
            ax.pie(vc.values, labels=vc.index.astype(str), colors=colors_list,
                   autopct="%1.1f%%", textprops={"color": "white", "fontsize": 9})

        else:
            raise HTTPException(status_code=400, detail=f"Unknown chart type: {req.chart_type}")

    except HTTPException:
        raise
    except Exception as e:
        plt.close(fig)
        raise HTTPException(status_code=400, detail=f"Chart error: {str(e)}")

    _style_plot(ax, title)
    return {"chart": _fig_to_base64(fig), "chart_type": req.chart_type}


# ---------- Statistical Tests ----------

class StatsTestRequest(BaseModel):
    test: str  # ttest, anova, chi_square, correlation_test, normality, mannwhitney
    columns: list[str]
    group_column: str = ""


@router.post("/stats-test")
async def run_stats_test(req: StatsTestRequest, user: User = Depends(get_current_user)):
    """Run a statistical test on the uploaded dataset."""
    df = _get_dataset(user.id)

    for col in req.columns:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Column '{col}' not found")

    result = {"test": req.test, "columns": req.columns}

    try:
        if req.test == "ttest":
            if len(req.columns) != 1 or not req.group_column:
                raise HTTPException(status_code=400, detail="T-test needs 1 numeric column and a group column")
            groups = df.groupby(req.group_column)[req.columns[0]].apply(list).values
            if len(groups) != 2:
                raise HTTPException(status_code=400, detail="T-test requires exactly 2 groups")
            t_stat, p_val = stats.ttest_ind(groups[0], groups[1], nan_policy="omit")
            result.update({"t_statistic": round(float(t_stat), 4), "p_value": round(float(p_val), 6),
                          "significant": p_val < 0.05, "group_column": req.group_column})

        elif req.test == "anova":
            if not req.group_column:
                raise HTTPException(status_code=400, detail="ANOVA needs a group column")
            groups = [g.dropna().values for _, g in df.groupby(req.group_column)[req.columns[0]]]
            f_stat, p_val = stats.f_oneway(*groups)
            result.update({"f_statistic": round(float(f_stat), 4), "p_value": round(float(p_val), 6),
                          "significant": p_val < 0.05, "num_groups": len(groups)})

        elif req.test == "chi_square":
            if len(req.columns) != 2:
                raise HTTPException(status_code=400, detail="Chi-square needs exactly 2 categorical columns")
            ct = pd.crosstab(df[req.columns[0]], df[req.columns[1]])
            chi2, p_val, dof, expected = stats.chi2_contingency(ct)
            result.update({"chi2_statistic": round(float(chi2), 4), "p_value": round(float(p_val), 6),
                          "degrees_of_freedom": int(dof), "significant": p_val < 0.05})

        elif req.test == "correlation_test":
            if len(req.columns) != 2:
                raise HTTPException(status_code=400, detail="Correlation test needs exactly 2 numeric columns")
            clean = df[req.columns].dropna()
            r, p_val = stats.pearsonr(clean[req.columns[0]], clean[req.columns[1]])
            rho, p_spearman = stats.spearmanr(clean[req.columns[0]], clean[req.columns[1]])
            result.update({"pearson_r": round(float(r), 4), "pearson_p": round(float(p_val), 6),
                          "spearman_rho": round(float(rho), 4), "spearman_p": round(float(p_spearman), 6),
                          "significant": p_val < 0.05})

        elif req.test == "normality":
            col_data = df[req.columns[0]].dropna()
            if len(col_data) > 5000:
                col_data = col_data.sample(5000)
            stat_sw, p_sw = stats.shapiro(col_data) if len(col_data) <= 5000 else (None, None)
            stat_ks, p_ks = stats.kstest(col_data, "norm", args=(col_data.mean(), col_data.std()))
            result.update({"shapiro_statistic": round(float(stat_sw), 4) if stat_sw else None,
                          "shapiro_p": round(float(p_sw), 6) if p_sw else None,
                          "ks_statistic": round(float(stat_ks), 4), "ks_p": round(float(p_ks), 6),
                          "normal": (p_sw or p_ks) > 0.05})

        elif req.test == "mannwhitney":
            if len(req.columns) != 1 or not req.group_column:
                raise HTTPException(status_code=400, detail="Mann-Whitney needs 1 numeric column and a group column")
            groups = df.groupby(req.group_column)[req.columns[0]].apply(list).values
            if len(groups) != 2:
                raise HTTPException(status_code=400, detail="Mann-Whitney requires exactly 2 groups")
            u_stat, p_val = stats.mannwhitneyu(groups[0], groups[1], alternative="two-sided")
            result.update({"u_statistic": round(float(u_stat), 4), "p_value": round(float(p_val), 6),
                          "significant": p_val < 0.05})

        else:
            raise HTTPException(status_code=400, detail=f"Unknown test: {req.test}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Test error: {str(e)}")

    return result


# ---------- Machine Learning ----------

class MLRequest(BaseModel):
    task: str  # classify, regress, cluster, pca
    target_column: str = ""
    feature_columns: list[str] = []
    model_type: str = "random_forest"  # random_forest, linear, logistic, kmeans
    test_size: float = 0.2
    n_clusters: int = 3
    n_components: int = 2


@router.post("/ml")
async def run_ml(req: MLRequest, user: User = Depends(get_current_user)):
    """Train a machine learning model on the uploaded dataset."""
    df = _get_dataset(user.id)

    features = req.feature_columns or [c for c in df.select_dtypes(include=[np.number]).columns if c != req.target_column]
    if not features:
        raise HTTPException(status_code=400, detail="No numeric feature columns available")

    X = df[features].dropna()
    if len(X) < 10:
        raise HTTPException(status_code=400, detail="Need at least 10 rows for ML")

    result = {"task": req.task, "features": features, "n_samples": len(X)}

    try:
        if req.task in ("classify", "regress"):
            if not req.target_column or req.target_column not in df.columns:
                raise HTTPException(status_code=400, detail="Target column required for classification/regression")

            y = df.loc[X.index, req.target_column]
            X_clean = X.loc[y.notna()]
            y_clean = y.loc[y.notna()]

            if req.task == "classify":
                le = LabelEncoder()
                y_enc = le.fit_transform(y_clean.astype(str))
                X_train, X_test, y_train, y_test = train_test_split(X_clean, y_enc, test_size=req.test_size, random_state=42)
                model = RandomForestClassifier(n_estimators=100, random_state=42) if req.model_type == "random_forest" else LogisticRegression(max_iter=1000, random_state=42)
                model.fit(X_train, y_train)
                y_pred = model.predict(X_test)
                result.update({
                    "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
                    "precision": round(float(precision_score(y_test, y_pred, average="weighted", zero_division=0)), 4),
                    "recall": round(float(recall_score(y_test, y_pred, average="weighted", zero_division=0)), 4),
                    "f1": round(float(f1_score(y_test, y_pred, average="weighted", zero_division=0)), 4),
                    "classes": le.classes_.tolist(),
                    "model": req.model_type,
                    "train_size": len(X_train), "test_size": len(X_test),
                })
                if hasattr(model, "feature_importances_"):
                    imp = dict(zip(features, [round(float(v), 4) for v in model.feature_importances_]))
                    result["feature_importances"] = dict(sorted(imp.items(), key=lambda x: -x[1]))

                    fig, ax = plt.subplots(figsize=(10, max(4, len(features) * 0.4)))
                    sorted_imp = sorted(imp.items(), key=lambda x: x[1])
                    ax.barh([x[0] for x in sorted_imp], [x[1] for x in sorted_imp], color="#F97316")
                    _style_plot(ax, "Feature Importances")
                    result["chart"] = _fig_to_base64(fig)

            else:
                X_train, X_test, y_train, y_test = train_test_split(X_clean, y_clean.astype(float), test_size=req.test_size, random_state=42)
                model = RandomForestRegressor(n_estimators=100, random_state=42) if req.model_type == "random_forest" else LinearRegression()
                model.fit(X_train, y_train)
                y_pred = model.predict(X_test)
                result.update({
                    "r2_score": round(float(r2_score(y_test, y_pred)), 4),
                    "rmse": round(float(np.sqrt(mean_squared_error(y_test, y_pred))), 4),
                    "mae": round(float(np.mean(np.abs(y_test - y_pred))), 4),
                    "model": req.model_type,
                    "train_size": len(X_train), "test_size": len(X_test),
                })

                fig, ax = plt.subplots(figsize=(8, 6))
                ax.scatter(y_test, y_pred, alpha=0.5, color="#F97316", s=20)
                mn, mx = min(y_test.min(), y_pred.min()), max(y_test.max(), y_pred.max())
                ax.plot([mn, mx], [mn, mx], "--", color="#3B82F6", linewidth=1.5)
                ax.set_xlabel("Actual")
                ax.set_ylabel("Predicted")
                _style_plot(ax, "Actual vs Predicted")
                result["chart"] = _fig_to_base64(fig)

        elif req.task == "cluster":
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)
            km = KMeans(n_clusters=req.n_clusters, random_state=42, n_init=10)
            labels = km.fit_predict(X_scaled)
            sil = silhouette_score(X_scaled, labels) if req.n_clusters > 1 else 0

            result.update({
                "n_clusters": req.n_clusters,
                "silhouette_score": round(float(sil), 4),
                "cluster_sizes": {str(i): int((labels == i).sum()) for i in range(req.n_clusters)},
                "inertia": round(float(km.inertia_), 2),
            })

            if X_scaled.shape[1] >= 2:
                pca = PCA(n_components=2)
                X_2d = pca.fit_transform(X_scaled)
                fig, ax = plt.subplots(figsize=(8, 6))
                scatter = ax.scatter(X_2d[:, 0], X_2d[:, 1], c=labels, cmap="tab10", alpha=0.6, s=20)
                ax.set_xlabel("PC1")
                ax.set_ylabel("PC2")
                _style_plot(ax, f"K-Means Clustering (k={req.n_clusters})")
                result["chart"] = _fig_to_base64(fig)

        elif req.task == "pca":
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X)
            n = min(req.n_components, X_scaled.shape[1])
            pca = PCA(n_components=n)
            X_pca = pca.fit_transform(X_scaled)

            result.update({
                "n_components": n,
                "explained_variance": [round(float(v), 4) for v in pca.explained_variance_ratio_],
                "total_variance_explained": round(float(sum(pca.explained_variance_ratio_)), 4),
                "loadings": {features[i]: [round(float(v), 4) for v in pca.components_[:, i]] for i in range(len(features))},
            })

            fig, ax = plt.subplots(figsize=(8, 5))
            cumvar = np.cumsum(pca.explained_variance_ratio_)
            ax.bar(range(1, n + 1), pca.explained_variance_ratio_, color="#F97316", alpha=0.7, label="Individual")
            ax.plot(range(1, n + 1), cumvar, "o-", color="#3B82F6", label="Cumulative")
            ax.set_xlabel("Component")
            ax.set_ylabel("Variance Explained")
            ax.legend(labelcolor="white")
            _style_plot(ax, "PCA — Explained Variance")
            result["chart"] = _fig_to_base64(fig)

        else:
            raise HTTPException(status_code=400, detail=f"Unknown task: {req.task}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"ML error: {str(e)}")

    return result


# ---------- LLM Interpretation ----------

class InterpretRequest(BaseModel):
    context: str
    results: dict
    provider: str = "deepseek"


@router.post("/interpret")
async def interpret_results(req: InterpretRequest, user: User = Depends(get_current_user)):
    """Use LLM to interpret statistical or ML results in research context."""
    system = (
        "You are a research data analyst helping a student interpret their results. "
        "Explain in clear, academic language what the results mean, whether they are "
        "statistically significant, what the practical implications are, and suggest "
        "how to report these findings in a research paper. Be specific and reference "
        "the actual numbers. Keep it concise (3-5 paragraphs)."
    )
    user_msg = f"Context: {req.context}\n\nResults:\n{json.dumps(req.results, indent=2)}\n\nInterpret these results."

    try:
        interpretation = await _call_llm(system, user_msg, req.provider)
        return {"interpretation": interpretation}
    except Exception as e:
        return {"interpretation": f"Could not generate interpretation: {str(e)}"}


@router.get("/columns")
async def get_columns(user: User = Depends(get_current_user)):
    """Return column info for the uploaded dataset."""
    df = _get_dataset(user.id)
    columns = []
    for col in df.columns:
        if df[col].dtype in ["int64", "float64"]:
            col_type = "numeric"
        elif df[col].dtype == "bool":
            col_type = "boolean"
        else:
            col_type = "categorical"
        columns.append({"name": col, "type": col_type, "dtype": str(df[col].dtype)})
    return {"columns": columns, "rows": len(df)}
