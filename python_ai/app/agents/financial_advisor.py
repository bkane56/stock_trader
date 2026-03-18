from dataclasses import dataclass

from app.agents.prompts import DEFAULT_FINANCIAL_ADVISOR_SYSTEM_PROMPT
from app.core.config import Settings


@dataclass(frozen=True)
class AgentIdentity:
    provider: str
    model: str


class FinancialAdvisorAgent:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @property
    def identity(self) -> AgentIdentity:
        provider = self._settings.resolved_ai_provider()
        model = self._settings.resolved_ai_model()
        return AgentIdentity(provider=provider, model=model)

    def system_prompt(self) -> str:
        return self._settings.resolved_ai_system_prompt(
            DEFAULT_FINANCIAL_ADVISOR_SYSTEM_PROMPT
        )

    def rationale_prefix(self) -> str:
        identity = self.identity
        return f"Agent={identity.provider}:{identity.model}"
