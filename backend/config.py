"""Environment configuration for iKopilot."""

import os
import json
from dataclasses import dataclass, field


@dataclass
class Settings:
    # Database
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://ikopilot:ikopilot@postgres:5432/ikopilot",
    )

    # Redis
    redis_url: str = os.getenv("REDIS_URL", "redis://redis:6379/0")

    # JWT
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_access_token_expire_minutes: int = int(
        os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "1440")
    )

    # LLM API Keys
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    google_api_key: str = os.getenv("GOOGLE_API_KEY", "")
    deepseek_api_key: str = os.getenv("DEEPSEEK_API_KEY", "")

    # Admin
    admin_email: str = os.getenv("ADMIN_EMAIL", "admin@ikopilot.com")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "admin")

    # SMTP (for password reset emails)
    smtp_host: str = os.getenv("SMTP_HOST", "")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_user: str = os.getenv("SMTP_USER", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    smtp_from_email: str = os.getenv("SMTP_FROM_EMAIL", "noreply@ikopilot.com")
    smtp_from_name: str = os.getenv("SMTP_FROM_NAME", "iKopilot")

    # App
    app_name: str = os.getenv("APP_NAME", "iKopilot")
    app_url: str = os.getenv("APP_URL", "https://ikopilot.com")
    environment: str = os.getenv("ENVIRONMENT", "development")
    debug: bool = os.getenv("DEBUG", "true").lower() == "true"

    # CORS
    cors_origins: list[str] = field(default_factory=list)

    # Subscription tier limits
    tier_limits: dict = field(default_factory=lambda: {
        "free": {
            "tokens_per_day": 5_000,
            "providers": ["deepseek"],
            "max_projects": 1,
            "file_upload": False,
            "trial_days": 7,
            "price_usd": 0,
        },
        "starter": {
            "tokens_per_day": 50_000,
            "providers": ["claude", "deepseek"],
            "max_projects": 3,
            "file_upload": False,
            "price_usd": 9.99,
        },
        "pro": {
            "tokens_per_day": 200_000,
            "providers": ["claude", "gpt4o", "gemini", "deepseek"],
            "max_projects": -1,  # unlimited
            "file_upload": True,
            "price_usd": 24.99,
        },
        "lab_group": {
            "tokens_per_day": 500_000,
            "providers": ["claude", "gpt4o", "gemini", "deepseek"],
            "max_projects": -1,
            "file_upload": True,
            "max_seats": 5,
            "price_usd": 49.99,
        },
    })

    # Model pricing (per 1M tokens)
    model_pricing: dict = field(default_factory=lambda: {
        "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
        "gpt-4o": {"input": 2.50, "output": 10.0},
        "gemini-2.0-flash": {"input": 0.075, "output": 0.30},
        "deepseek-chat": {"input": 0.14, "output": 0.28},
    })

    def __post_init__(self):
        if not self.cors_origins:
            raw = os.getenv("CORS_ORIGINS", '["http://localhost:3001"]')
            self.cors_origins = json.loads(raw)


settings = Settings()
