from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    APP_NAME: str = "Stock Trader AI Service"
    APP_ENV: str = "development"
    PIPELINE_INTERVAL_MINUTES: int = 60

    POLYGON_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    PUSHOVER_USER: str = ""
    PUSHOVER_TOKEN: str = ""
    PUSHOVER_URL: str = "https://api.pushover.net/1/messages.json"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
