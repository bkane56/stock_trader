import json
from pathlib import Path

from app.agents.financial_advisor import FinancialAdvisorAgent
from app.agents.skills_catalog import SkillsCatalog
from app.core.config import Settings


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_skills_catalog_search_and_read(tmp_path: Path) -> None:
    _write_text(
        tmp_path / ".agents" / "skills" / "financial-risk-analysis" / "SKILL.md",
        "# Financial Risk Analysis\nUse strict stop-loss planning.",
    )
    _write_text(
        tmp_path / ".agents" / "skills" / "generic-research" / "SKILL.md",
        "# Generic Research\nGeneral research workflow.",
    )

    catalog = SkillsCatalog(repo_root=tmp_path)
    search_results = catalog.search(query="risk", limit=5)
    assert len(search_results) == 1
    assert search_results[0]["id"] == "financial-risk-analysis"

    markdown = catalog.read_skill_markdown("financial-risk-analysis")
    assert "stop-loss" in markdown

    tool_output = json.loads(
        catalog.execute_tool("search_skills", {"query": "research", "limit": 2})
    )
    assert tool_output["returned"] == 1
    assert tool_output["skills"][0]["id"] == "generic-research"


def test_financial_advisor_prompt_includes_skills_preview(tmp_path: Path) -> None:
    _write_text(
        tmp_path / ".agents" / "skills" / "volatility-planning" / "SKILL.md",
        "# Volatility Planning\nAdjust position size during volatility spikes.",
    )

    settings = Settings(
        AI_SKILLS_INDEX_PATH=str(tmp_path / ".agents" / "skills" / "skills_index.json"),
        AI_SKILLS_ROOT_PATH=str(tmp_path / ".agents" / "skills"),
        AI_SKILLS_PROMPT_LIMIT=5,
    )
    agent = FinancialAdvisorAgent(settings=settings)
    prompt = agent.system_prompt()

    assert "search_skills" in prompt
    assert "read_skill" in prompt
    assert "volatility-planning" in prompt
    assert "A total of 1 local skills are available" in prompt
