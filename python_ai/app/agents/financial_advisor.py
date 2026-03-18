from dataclasses import dataclass

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

    def rationale_prefix(self) -> str:
        identity = self.identity
        return f"Agent={identity.provider}:{identity.model}"
