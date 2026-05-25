"""Shared dataclasses for the agents package."""

from dataclasses import dataclass


@dataclass(frozen=True)
class AgentIdentity:
    """Identifies which AI provider and model an agent is running on."""

    provider: str
    model: str
