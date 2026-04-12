"""Automated data cleanup — 30-day expiry for conversations/files/sessions, 90-day for API usage."""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import select, delete, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, User, Conversation, ApiUsage, Project, async_session
from auth import require_admin
from config import settings
from orchestrator import _sessions
from file_upload import UPLOAD_DIR

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/cleanup", tags=["cleanup"])


# ---------- Core cleanup logic ----------

async def cleanup_expired_data(db: AsyncSession) -> dict:
    """Delete expired conversations, API usage records, uploaded files, and orchestrator sessions.

    Returns a summary dict with counts of deleted items per category.
    """
    now = datetime.now(timezone.utc)
    cutoff_30 = now - timedelta(days=30)
    cutoff_90 = now - timedelta(days=90)

    summary = {
        "conversations_deleted": 0,
        "api_usage_deleted": 0,
        "files_deleted": 0,
        "orchestrator_sessions_deleted": 0,
        "daily_tokens_reset": False,
    }

    # --- 1. Conversations older than 30 days ---
    result = await db.execute(
        delete(Conversation).where(Conversation.created_at < cutoff_30)
    )
    summary["conversations_deleted"] = result.rowcount
    logger.info("Cleanup: deleted %d conversations older than 30 days", result.rowcount)

    # --- 2. API usage records older than 90 days ---
    result = await db.execute(
        delete(ApiUsage).where(ApiUsage.timestamp < cutoff_90)
    )
    summary["api_usage_deleted"] = result.rowcount
    logger.info("Cleanup: deleted %d API usage records older than 90 days", result.rowcount)

    # --- 3. Uploaded files older than 30 days (disk + project references) ---
    files_removed = 0
    if UPLOAD_DIR.exists():
        for file_path in UPLOAD_DIR.rglob("*"):
            if not file_path.is_file():
                continue
            mtime = datetime.fromtimestamp(file_path.stat().st_mtime, tz=timezone.utc)
            if mtime < cutoff_30:
                try:
                    file_path.unlink()
                    files_removed += 1
                except OSError as exc:
                    logger.warning("Cleanup: failed to delete file %s: %s", file_path, exc)

    # Clean stale entries from context_files_json in projects
    projects_result = await db.execute(
        select(Project).where(Project.context_files_json.isnot(None))
    )
    for project in projects_result.scalars().all():
        files_list = project.context_files_json or []
        if not files_list:
            continue
        # Keep only files that still exist on disk
        surviving = []
        for entry in files_list:
            stored = UPLOAD_DIR / str(project.user_id) / entry.get("stored_name", "")
            if stored.exists():
                surviving.append(entry)
        if len(surviving) != len(files_list):
            await db.execute(
                update(Project)
                .where(Project.id == project.id)
                .values(context_files_json=surviving)
            )

    summary["files_deleted"] = files_removed
    logger.info("Cleanup: deleted %d expired files from disk", files_removed)

    # --- 4. Orchestrator sessions older than 30 days ---
    expired_ids = [
        sid for sid, session in _sessions.items()
        if session.created_at < cutoff_30
    ]
    for sid in expired_ids:
        del _sessions[sid]
    summary["orchestrator_sessions_deleted"] = len(expired_ids)
    logger.info("Cleanup: removed %d expired orchestrator sessions", len(expired_ids))

    # --- 5. Reset daily token counters ---
    await db.execute(update(User).values(tokens_used_today=0))
    summary["daily_tokens_reset"] = True
    logger.info("Cleanup: daily token counters reset")

    await db.commit()
    return summary


# ---------- Preview helper (no mutations) ----------

async def preview_expired_data(db: AsyncSession) -> dict:
    """Return counts of data that *would* be cleaned up, without deleting anything."""
    now = datetime.now(timezone.utc)
    cutoff_30 = now - timedelta(days=30)
    cutoff_90 = now - timedelta(days=90)

    conv_count = await db.execute(
        select(func.count(Conversation.id)).where(Conversation.created_at < cutoff_30)
    )
    usage_count = await db.execute(
        select(func.count(ApiUsage.id)).where(ApiUsage.timestamp < cutoff_90)
    )

    # Count expired files on disk
    expired_files = 0
    expired_files_bytes = 0
    if UPLOAD_DIR.exists():
        for file_path in UPLOAD_DIR.rglob("*"):
            if not file_path.is_file():
                continue
            mtime = datetime.fromtimestamp(file_path.stat().st_mtime, tz=timezone.utc)
            if mtime < cutoff_30:
                expired_files += 1
                expired_files_bytes += file_path.stat().st_size

    # Count expired orchestrator sessions
    expired_sessions = sum(
        1 for s in _sessions.values() if s.created_at < cutoff_30
    )

    return {
        "conversations": conv_count.scalar() or 0,
        "api_usage_records": usage_count.scalar() or 0,
        "files": expired_files,
        "files_size_mb": round(expired_files_bytes / (1024 * 1024), 2),
        "orchestrator_sessions": expired_sessions,
        "cutoff_30_days": cutoff_30.isoformat(),
        "cutoff_90_days": cutoff_90.isoformat(),
    }


# ---------- Admin endpoints ----------

@router.post("/run")
async def run_cleanup(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger the data cleanup process (admin only)."""
    summary = await cleanup_expired_data(db)
    return {"message": "Cleanup completed", "summary": summary}


@router.get("/stats")
async def cleanup_stats(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Preview what would be cleaned up without deleting anything (admin only)."""
    stats = await preview_expired_data(db)
    return {"message": "Cleanup preview — no data was deleted", "stats": stats}


# ---------- Scheduled background task ----------

async def schedule_cleanup():
    """Run cleanup every day at midnight UTC. Launch as a background task on startup."""
    while True:
        now = datetime.now(timezone.utc)
        # Calculate seconds until next midnight UTC
        tomorrow = (now + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        wait_seconds = (tomorrow - now).total_seconds()
        logger.info(
            "Cleanup scheduler: next run in %.0f seconds (at %s)",
            wait_seconds,
            tomorrow.isoformat(),
        )
        await asyncio.sleep(wait_seconds)
        # Run cleanup
        try:
            async with async_session() as db:
                summary = await cleanup_expired_data(db)
                logger.info("Scheduled cleanup finished: %s", summary)
        except Exception:
            logger.exception("Scheduled cleanup failed")
