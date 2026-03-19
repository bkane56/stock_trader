from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    APP_NAME: str = "Stock Trader AI Service"
    APP_ENV: str = "development"
    APP_LOG_LEVEL: str = "INFO"
    CORS_ALLOW_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    PIPELINE_INTERVAL_MINUTES: int = 60
    MORNING_BRIEFING_MIN_CASH: float = 1000.0
    MORNING_BRIEFING_DEFAULT_HOLDINGS: str = "SPY,QQQ,AAPL"
    MORNING_BRIEFING_DEFAULT_CASH: float = 10000.0

    AI_PROVIDER: str = "openai"
    AI_MODEL: str = "gpt-4.2"
    AI_SYSTEM_PROMPT: str = ""
    AI_SKILLS_INDEX_PATH: str = "skills_index.json"
    AI_SKILLS_ROOT_PATH: str = "skills"
    AI_SKILLS_PROMPT_LIMIT: int = 15
    RESEARCH_MIN_BUY_CONFIDENCE: float = 0.6
    OPENAI_MODEL: str = ""
    ANTHROPIC_MODEL: str = ""

    POLYGON_API_KEY: str = ""
    POLYGON_PLAN: str = "free"
    POLYGON_REALTIME: bool = False
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    SERPER_API_KEY: str = ""
    BRAVE_API_KEY: str = ""

    PUSHOVER_USER: str = ""
    PUSHOVER_TOKEN: str = ""
    PUSHOVER_URL: str = "https://api.pushover.net/1/messages.json"

    def resolved_ai_provider(self) -> str:
        return (self.AI_PROVIDER or "openai").strip().lower()

    def resolved_ai_model(self) -> str:
        # Prefer AI_MODEL for all providers, keep provider-specific fallback support.
        if self.AI_MODEL.strip():
            return self.AI_MODEL.strip()

        provider = self.resolved_ai_provider()
        if provider == "openai" and self.OPENAI_MODEL.strip():
            return self.OPENAI_MODEL.strip()
        if provider == "anthropic" and self.ANTHROPIC_MODEL.strip():
            return self.ANTHROPIC_MODEL.strip()
        return "gpt-4.2"

    def resolved_ai_api_key(self) -> str:
        provider = self.resolved_ai_provider()
        if provider == "openai":
            return self.OPENAI_API_KEY.strip()
        if provider == "anthropic":
            return self.ANTHROPIC_API_KEY.strip()
        return ""

    def resolved_ai_system_prompt(self, default_prompt: str) -> str:
        if self.AI_SYSTEM_PROMPT.strip():
            return self.AI_SYSTEM_PROMPT.strip()
        return default_prompt

    def resolved_research_min_buy_confidence(self) -> float:
        # Clamp to [0.0, 1.0] to keep validation predictable.
        return max(0.0, min(1.0, float(self.RESEARCH_MIN_BUY_CONFIDENCE)))

    def resolved_cors_allow_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.CORS_ALLOW_ORIGINS.split(",")
            if origin.strip()
        ]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
