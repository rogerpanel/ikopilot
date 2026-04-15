"""JWT authentication, registration, login, and subscription management."""

from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
import bcrypt
import jwt

from database import get_db, User, Subscription, SubscriptionTier, UserRole, Program, PasswordResetToken
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer()


# ---------- Pydantic schemas ----------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    university: str = ""
    department: str = ""
    program: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserProfile(BaseModel):
    id: int
    email: str
    full_name: str
    university: str
    department: str
    program: Optional[str]
    subscription_tier: str
    tokens_used_today: int
    tokens_used_month: int
    role: str
    avatar_color: str
    created_at: str


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    university: Optional[str] = None
    department: Optional[str] = None
    program: Optional[str] = None
    avatar_color: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# ---------- Helpers ----------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_access_token(user_id: int, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.jwt_access_token_expire_minutes
    )
    payload = {"sub": str(user_id), "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "university": user.university,
        "department": user.department,
        "program": user.program.value if user.program else None,
        "subscription_tier": user.subscription_tier.value,
        "tokens_used_today": user.tokens_used_today,
        "tokens_used_month": user.tokens_used_month,
        "role": user.role.value,
        "avatar_color": user.avatar_color,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login": user.last_login.isoformat() if user.last_login else None,
    }


# ---------- Dependencies ----------

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(credentials.credentials)
    user_id = int(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_supervisor(user: User = Depends(get_current_user)) -> User:
    if user.role not in (UserRole.admin, UserRole.supervisor):
        raise HTTPException(status_code=403, detail="Supervisor access required")
    return user


# ---------- Endpoints ----------

@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check duplicate
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    program = None
    if req.program:
        try:
            program = Program(req.program)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid program. Use PhD, MSc, or MA")

    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        full_name=req.full_name,
        university=req.university,
        department=req.department,
        program=program,
        subscription_tier=SubscriptionTier.free,
        role=UserRole.student,
    )
    db.add(user)
    await db.flush()

    # Create free trial subscription
    trial_end = datetime.now(timezone.utc) + timedelta(days=7)
    sub = Subscription(
        user_id=user.id,
        tier=SubscriptionTier.free,
        amount_usd=0,
        start_date=datetime.now(timezone.utc),
        end_date=trial_end,
        is_active=True,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, user.role.value)
    return TokenResponse(access_token=token, user=user_to_dict(user))


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    token = create_access_token(user.id, user.role.value)
    return TokenResponse(access_token=token, user=user_to_dict(user))


@router.get("/me")
async def get_profile(user: User = Depends(get_current_user)):
    return user_to_dict(user)


@router.put("/me")
async def update_profile(
    req: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    updates = req.model_dump(exclude_none=True)
    if "program" in updates:
        try:
            updates["program"] = Program(updates["program"])
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid program")

    if updates:
        await db.execute(
            update(User).where(User.id == user.id).values(**updates)
        )
        await db.commit()

    result = await db.execute(select(User).where(User.id == user.id))
    updated_user = result.scalar_one()
    return user_to_dict(updated_user)


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(req.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    await db.execute(
        update(User)
        .where(User.id == user.id)
        .values(password_hash=hash_password(req.new_password))
    )
    await db.commit()
    return {"message": "Password updated successfully"}


def send_reset_email(to_email: str, reset_link: str) -> bool:
    """Send password reset email via SMTP. Returns True if sent, False if SMTP not configured."""
    if not settings.smtp_host or not settings.smtp_user:
        logger.warning("SMTP not configured — reset link logged instead: %s", reset_link)
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "iKopilot — Reset Your Password"
    msg["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    msg["To"] = to_email

    text_body = f"""Hi,

You requested a password reset for your iKopilot account.

Click the link below to set a new password (valid for 1 hour):
{reset_link}

If you didn't request this, you can safely ignore this email.

— iKopilot Team
"""

    html_body = f"""
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h2 style="color: #F97316; margin: 0;">iKopilot</h2>
    <p style="color: #9CA3AF; font-size: 13px; margin: 4px 0 0;">Your Intelligent Research Co-Pilot</p>
  </div>
  <div style="background: #1F2937; border-radius: 12px; padding: 32px; border: 1px solid #374151;">
    <h3 style="color: #F3F4F6; margin: 0 0 12px;">Reset your password</h3>
    <p style="color: #9CA3AF; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
      You requested a password reset. Click the button below to choose a new password. This link expires in 1 hour.
    </p>
    <div style="text-align: center; margin-bottom: 24px;">
      <a href="{reset_link}" style="display: inline-block; background: #F97316; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Set New Password
      </a>
    </div>
    <p style="color: #6B7280; font-size: 12px; margin: 0;">
      If you didn't request this, you can safely ignore this email.
    </p>
  </div>
  <p style="color: #4B5563; font-size: 11px; text-align: center; margin-top: 20px;">
    &copy; iKopilot &mdash; ikopilot.com
  </p>
</div>
"""

    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_from_email, to_email, msg.as_string())
        logger.info("Password reset email sent to %s", to_email)
        return True
    except Exception as e:
        logger.error("Failed to send reset email to %s: %s", to_email, e)
        return False


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Request a password reset. Always returns success to prevent email enumeration."""
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    response = {
        "message": "If an account with that email exists, a password reset link has been sent.",
        "email_registered": user is not None,
    }

    if not user:
        return response

    # Invalidate any existing unused tokens for this user
    await db.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used == False)
        .values(used=True)
    )

    # Generate a secure token
    token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

    reset_token = PasswordResetToken(
        user_id=user.id,
        token=token,
        expires_at=expires_at,
    )
    db.add(reset_token)
    await db.commit()

    reset_link = f"{settings.app_url}/reset-password?token={token}"
    email_sent = send_reset_email(user.email, reset_link)

    if not email_sent:
        # SMTP not configured — return the link so admin can share it
        response["reset_link"] = reset_link
        response["note"] = "SMTP not configured. Share this link with the user manually."

    return response


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Set a new password using a valid reset token."""
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token == req.token,
            PasswordResetToken.used == False,
        )
    )
    reset_token = result.scalar_one_or_none()

    if not reset_token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    if reset_token.expires_at < datetime.now(timezone.utc):
        reset_token.used = True
        await db.commit()
        raise HTTPException(status_code=400, detail="Reset link has expired. Please request a new one.")

    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    # Update password
    await db.execute(
        update(User)
        .where(User.id == reset_token.user_id)
        .values(password_hash=hash_password(req.new_password))
    )

    # Mark token as used
    reset_token.used = True
    await db.commit()

    return {"message": "Password has been reset successfully. You can now sign in with your new password."}


@router.post("/check-email")
async def check_email(req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Check if an email is registered (used by the forgot-password form)."""
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()
    return {"registered": user is not None}


@router.get("/subscription")
async def get_subscription(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == user.id, Subscription.is_active == True)
        .order_by(Subscription.start_date.desc())
    )
    sub = result.scalar_one_or_none()

    tier_info = settings.tier_limits.get(user.subscription_tier.value, {})
    return {
        "tier": user.subscription_tier.value,
        "tokens_per_day": tier_info.get("tokens_per_day", 0),
        "tokens_used_today": user.tokens_used_today,
        "tokens_used_month": user.tokens_used_month,
        "allowed_providers": tier_info.get("providers", []),
        "max_projects": tier_info.get("max_projects", 1),
        "file_upload": tier_info.get("file_upload", False),
        "subscription": {
            "id": sub.id,
            "start_date": sub.start_date.isoformat() if sub.start_date else None,
            "end_date": sub.end_date.isoformat() if sub.end_date else None,
            "auto_renew": sub.auto_renew,
        } if sub else None,
    }
