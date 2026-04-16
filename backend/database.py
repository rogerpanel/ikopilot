"""Database models and session management for iKoPilot.com."""

from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, DateTime,
    ForeignKey, Enum as SAEnum, JSON, BigInteger,
)
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship
import enum

from config import settings


engine = create_async_engine(settings.database_url, echo=settings.debug, pool_size=20)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def utcnow():
    return datetime.now(timezone.utc)


# ---------- Enums ----------

class UserRole(str, enum.Enum):
    admin = "admin"
    supervisor = "supervisor"
    student = "student"


class SubscriptionTier(str, enum.Enum):
    free = "free"
    starter = "starter"
    pro = "pro"
    lab_group = "lab_group"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"
    refunded = "refunded"


class LLMProvider(str, enum.Enum):
    claude = "claude"
    gpt4o = "gpt4o"
    gemini = "gemini"
    deepseek = "deepseek"


class Program(str, enum.Enum):
    phd = "PhD"
    msc = "MSc"
    ma = "MA"
    bsc = "BSc"
    ba = "BA"


# ---------- Models ----------

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    university = Column(String(255), default="")
    department = Column(String(255), default="")
    program = Column(SAEnum(Program), nullable=True)
    supervisor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    subscription_tier = Column(
        SAEnum(SubscriptionTier), default=SubscriptionTier.free, nullable=False
    )
    tokens_used_today = Column(BigInteger, default=0)
    tokens_used_month = Column(BigInteger, default=0)
    is_active = Column(Boolean, default=True)
    role = Column(SAEnum(UserRole), default=UserRole.student, nullable=False)
    avatar_color = Column(String(7), default="#3B82F6")
    created_at = Column(DateTime(timezone=True), default=utcnow)
    last_login = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    supervisor = relationship("User", remote_side="User.id", backref="mentees")
    subscriptions = relationship("Subscription", back_populates="user")
    projects = relationship("Project", back_populates="user")
    conversations = relationship("Conversation", back_populates="user")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    tier = Column(SAEnum(SubscriptionTier), nullable=False)
    payment_provider = Column(String(50), nullable=True)
    payment_id = Column(String(255), nullable=True)
    amount_usd = Column(Float, default=0.0)
    start_date = Column(DateTime(timezone=True), default=utcnow)
    end_date = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    auto_renew = Column(Boolean, default=False)

    user = relationship("User", back_populates="subscriptions")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, default="")
    research_field = Column(String(255), default="")
    system_prompt_override = Column(Text, nullable=True)
    context_files_json = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="projects")
    conversations = relationship("Conversation", back_populates="project")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), default="New conversation")
    provider = Column(SAEnum(LLMProvider), default=LLMProvider.deepseek)
    messages_json = Column(JSON, default=list)
    tokens_input = Column(BigInteger, default=0)
    tokens_output = Column(BigInteger, default=0)
    cost_usd = Column(Float, default=0.0)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    project = relationship("Project", back_populates="conversations")
    user = relationship("User", back_populates="conversations")


class ApiUsage(Base):
    __tablename__ = "api_usage"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    provider = Column(SAEnum(LLMProvider), nullable=False)
    model = Column(String(100), nullable=False)
    tokens_input = Column(BigInteger, default=0)
    tokens_output = Column(BigInteger, default=0)
    cost_usd = Column(Float, default=0.0)
    endpoint = Column(String(255), default="")
    timestamp = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String(255), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount_usd = Column(Float, nullable=False)
    currency = Column(String(10), default="USD")
    provider = Column(String(50), nullable=False)
    provider_tx_id = Column(String(255), nullable=True)
    status = Column(SAEnum(PaymentStatus), default=PaymentStatus.pending)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User")


# ---------- Session helper ----------

async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
