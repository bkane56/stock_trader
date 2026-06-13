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
    # Optional regex for origins not listed above (e.g. all Vercel preview URLs).
    # Example: https://.*\.vercel\.app — use only if you accept that tradeoff.
    CORS_ALLOW_ORIGIN_REGEX: str = ""
    PIPELINE_INTERVAL_MINUTES: int = 60
    MORNING_BRIEFING_MIN_CASH: float = 1000.0
    MORNING_BRIEFING_CASH_RESERVE_RATIO: float = 0.10
    MORNING_BRIEFING_DEFAULT_HOLDINGS: str = "SPY,QQQ,AAPL"
    MORNING_BRIEFING_DEFAULT_CASH: float = 100000.0

    AI_PROVIDER: str = "openai"
    AI_MODEL: str = "gpt-4.2"
    AI_SYSTEM_PROMPT: str = ""
    AI_SKILLS_INDEX_PATH: str = "skills_index.json"
    AI_SKILLS_ROOT_PATH: str = ".cursor/skills"
    AI_SKILLS_PROMPT_LIMIT: int = 15
    RESEARCH_MIN_BUY_CONFIDENCE: float = 0.51
    OPENAI_MODEL: str = ""
    # Reserved: Anthropic provider not yet implemented — field kept for future integration.
    ANTHROPIC_MODEL: str = ""

    POLYGON_API_KEY: str = ""
    POLYGON_PLAN: str = "free"
    POLYGON_REALTIME: bool = False
    POLYGON_DATA_MODE: str = "previous_close"

    MARKET_DATA_PROVIDER: str = "polygon"
    MARKET_DATA_MODE: str = "free_iex"
    MARKET_DATA_CACHE_MINUTES: int = 15
    ENABLE_MARKET_DATA_FALLBACK: bool = True

    ALPACA_API_KEY_ID: str = ""
    ALPACA_API_SECRET_KEY: str = ""
    ALPACA_DATA_FEED: str = "iex"
    OPENAI_API_KEY: str = ""
    # Reserved: Anthropic provider not yet implemented — field kept for future integration.
    ANTHROPIC_API_KEY: str = ""
    SERPER_API_KEY: str = ""
    BRAVE_API_KEY: str = ""

    PUSHOVER_USER: str = ""
    PUSHOVER_TOKEN: str = ""
    PUSHOVER_URL: str = "https://api.pushover.net/1/messages.json"

    # Deterministic pipeline feature flag
    USE_DETERMINISTIC_PIPELINE: bool = True

    # Candidate universe extras (comma-separated tickers)
    CANDIDATE_UNIVERSE_EXTRA: str = ""

    # Risk rule thresholds
    MAX_POSITION_WEIGHT_PCT: float = 30.0
    TRIM_POSITION_WEIGHT_PCT: float = 25.0
    TAKE_PROFIT_GAIN_PCT: float = 12.0
    STOP_LOSS_PCT: float = -7.0
    MIN_CASH_RESERVE_PCT: float = 5.0
    MAX_TRADES_PER_DAY: int = 5
    MAX_BUY_RECOMMENDATIONS_PER_RUN: int = 3

    # Agent turn limits
    RECOMMENDATION_MAX_TURNS: int = 6
    RESEARCH_MAX_TURNS: int = 8

    # AI budget policy
    MAX_RESEARCH_RUNS_PER_DAY: int = 6
    MIN_MINUTES_BETWEEN_RESEARCH_RUNS: int = 60
    MAX_SYMBOLS_PER_RESEARCH_RUN: int = 12
    MAX_LLM_CALLS_PER_RUN: int = 2
    USE_CACHED_RESEARCH_IF_FRESH: bool = True

    # Cache TTLs (seconds)
    CANDIDATE_SCORE_CACHE_TTL_SEC: int = 1800
    RESEARCH_SUMMARY_CACHE_TTL_SEC: int = 5400
    RECOMMENDATION_CACHE_TTL_SEC: int = 1800

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

    def resolved_morning_briefing_cash_reserve_ratio(self) -> float:
        # Clamp to [0.0, 1.0] to keep allocation math safe.
        return max(0.0, min(1.0, float(self.MORNING_BRIEFING_CASH_RESERVE_RATIO)))

    def resolved_cors_allow_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.CORS_ALLOW_ORIGINS.split(",")
            if origin.strip()
        ]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
