import os
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator

from app.core.config import Settings


@dataclass(frozen=True)
class MCPServerGroups:
    trader_params: list[dict[str, Any]]
    researcher_params: list[dict[str, Any]]


class OpenAIAgentsRuntime:
    """Build MCP-backed OpenAI Agents SDK runtime configuration."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._repo_root = Path(__file__).resolve().parents[3]
        self._python_ai_root = self._repo_root / "python_ai"

    def _local_server_params(self, script_name: str) -> dict[str, Any] | None:
        script_path = self._python_ai_root / script_name
        if not script_path.exists():
            return None
        return {"command": "uv", "args": ["run", script_name]}

    def _local_server_exists(self, script_name: str) -> bool:
        return (self._python_ai_root / script_name).exists()

    def _market_server_params(self) -> dict[str, Any]:
        polygon_env = {"POLYGON_API_KEY": self._settings.POLYGON_API_KEY.strip()}
        polygon_executable = "mcp_massive"
        is_paid_polygon = self._settings.POLYGON_PLAN.strip().lower() in {
            "paid",
            "pro",
            "advanced",
        }
        is_realtime_polygon = self._settings.POLYGON_REALTIME

        if is_paid_polygon or is_realtime_polygon:
            return {
                "command": "uvx",
                "args": [
                    "--from",
                    "git+https://github.com/polygon-io/mcp_polygon@master",
                    polygon_executable,
                ],
                "env": polygon_env,
            }

        local_market_server = self._local_server_params("market_server.py")
        if local_market_server is not None:
            return local_market_server

        return {
            "command": "uvx",
            "args": [
                "--from",
                "git+https://github.com/polygon-io/mcp_polygon@master",
                polygon_executable,
            ],
            "env": polygon_env,
        }

    def mcp_server_groups(self) -> MCPServerGroups:
        trader_params: list[dict[str, Any]] = []
        for script_name in ("accounts_server.py", "push_server.py"):
            server = self._local_server_params(script_name)
            if server is not None:
                trader_params.append(server)
        trader_params.append(self._market_server_params())

        researcher_params: list[dict[str, Any]] = [
            {"command": "uvx", "args": ["mcp-server-fetch"]}
        ]
        brave_api_key = self._settings.BRAVE_API_KEY.strip()
        if brave_api_key:
            researcher_params.append(
                {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-brave-search"],
                    "env": {"BRAVE_API_KEY": brave_api_key},
                }
            )
        return MCPServerGroups(
            trader_params=trader_params,
            researcher_params=researcher_params,
        )

    @staticmethod
    def _summarize_server_params(params: dict[str, Any]) -> dict[str, Any]:
        return {
            "command": str(params.get("command", "")),
            "args": list(params.get("args", [])),
            "has_env": bool(params.get("env")),
        }

    def debug_snapshot(self) -> dict[str, Any]:
        groups = self.mcp_server_groups()
        return {
            "polygon_plan": self._settings.POLYGON_PLAN.strip().lower() or "free",
            "polygon_realtime": bool(self._settings.POLYGON_REALTIME),
            "polygon_api_key_configured": bool(self._settings.POLYGON_API_KEY.strip()),
            "brave_api_key_configured": bool(self._settings.BRAVE_API_KEY.strip()),
            "local_servers_present": {
                "accounts_server.py": self._local_server_exists("accounts_server.py"),
                "push_server.py": self._local_server_exists("push_server.py"),
                "market_server.py": self._local_server_exists("market_server.py"),
            },
            "configured_trader_servers": [
                self._summarize_server_params(params) for params in groups.trader_params
            ],
            "configured_researcher_servers": [
                self._summarize_server_params(params)
                for params in groups.researcher_params
            ],
        }

    def ensure_openai_api_key(self) -> None:
        api_key = self._settings.resolved_ai_api_key()
        if api_key and os.environ.get("OPENAI_API_KEY", "").strip() != api_key:
            os.environ["OPENAI_API_KEY"] = api_key

    @asynccontextmanager
    async def connected_servers(
        self, server_params: list[dict[str, Any]]
    ) -> AsyncIterator[list[Any]]:
        from agents.mcp import MCPServerStdio

        servers = [
            MCPServerStdio(params, client_session_timeout_seconds=30)
            for params in server_params
        ]
        try:
            for server in servers:
                await server.connect()
            yield servers
        finally:
            for server in servers:
                try:
                    await server.cleanup()
                except BaseException:
                    # Do not mask the original runtime error with cleanup failures.
                    continue
