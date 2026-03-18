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
    PIPELINE_INTERVAL_MINUTES: int = 60

    AI_PROVIDER: str = "openai"
    AI_MODEL: str = "gpt-4.2"
    AI_SYSTEM_PROMPT: str = ""
    OPENAI_MODEL: str = ""
    ANTHROPIC_MODEL: str = ""

    POLYGON_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
