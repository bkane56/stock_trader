"""Tests for OpenAI Agents MCP runtime configuration."""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.agents.openai_agents_runtime import OpenAIAgentsRuntime
from app.core.config import Settings


def test_researcher_mcp_includes_fetch_and_playwright_headless() -> None:
    # Explicit empty Brave key so local .env does not add a third MCP server.
    runtime = OpenAIAgentsRuntime(Settings(BRAVE_API_KEY=""))
    groups = runtime.mcp_server_groups()

    assert len(groups.researcher_params) == 2

    fetch_params = groups.researcher_params[0]
    assert fetch_params["command"] == "uvx"
    assert fetch_params["args"] == ["mcp-server-fetch"]

    playwright_params = groups.researcher_params[1]
    assert playwright_params["command"] == "npx"
    assert playwright_params["args"] == ["-y", "@playwright/mcp@latest", "--headless"]
    env = playwright_params.get("env") or {}
    assert env.get("PLAYWRIGHT_MCP_HEADLESS") == "1"


def test_researcher_mcp_appends_brave_when_api_key_set() -> None:
    runtime = OpenAIAgentsRuntime(Settings(BRAVE_API_KEY="test-brave-key"))
    groups = runtime.mcp_server_groups()

    assert len(groups.researcher_params) == 3
    brave_params = groups.researcher_params[2]
    assert brave_params["command"] == "npx"
    assert brave_params["args"] == ["-y", "@modelcontextprotocol/server-brave-search"]
    env = brave_params.get("env") or {}
    assert env.get("BRAVE_API_KEY") == "test-brave-key"


def test_debug_snapshot_reports_playwright_and_brave_flags() -> None:
    runtime = OpenAIAgentsRuntime(Settings(BRAVE_API_KEY=""))
    snap = runtime.debug_snapshot()
    assert snap["playwright_mcp_headless"] is True
    assert snap["brave_api_key_configured"] is False

    runtime_with_brave = OpenAIAgentsRuntime(Settings(BRAVE_API_KEY="x"))
    assert runtime_with_brave.debug_snapshot()["brave_api_key_configured"] is True
