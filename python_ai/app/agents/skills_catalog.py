import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SkillRecord:
    id: str
    name: str
    description: str
    path: str
    category: str
    risk: str
    source: str


class SkillsCatalog:
    def __init__(
        self,
        repo_root: Path,
        index_path: str = "skills_index.json",
        skills_root: str = "skills",
    ) -> None:
        self._repo_root = repo_root
        self._index_path = self._repo_root / index_path
        self._skills_root = self._repo_root / skills_root
        self._skills_by_id: dict[str, SkillRecord] = {}
        self._load_index()

    def _load_index(self) -> None:
        if not self._index_path.exists():
            self._skills_by_id = {}
            return

        try:
            raw_index = json.loads(self._index_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            self._skills_by_id = {}
            return

        if not isinstance(raw_index, list):
            self._skills_by_id = {}
            return

        parsed: dict[str, SkillRecord] = {}
        for item in raw_index:
            if not isinstance(item, dict):
                continue
            skill_id = str(item.get("id", "")).strip()
            path = str(item.get("path", "")).strip()
            if not skill_id or not path:
                continue
            parsed[skill_id] = SkillRecord(
                id=skill_id,
                name=str(item.get("name", skill_id)).strip() or skill_id,
                description=str(item.get("description", "")).strip(),
                path=path,
                category=str(item.get("category", "uncategorized")).strip()
                or "uncategorized",
                risk=str(item.get("risk", "unknown")).strip() or "unknown",
                source=str(item.get("source", "unknown")).strip() or "unknown",
            )

        self._skills_by_id = parsed

    def is_enabled(self) -> bool:
        return bool(self._skills_by_id)

    def total_skills(self) -> int:
        return len(self._skills_by_id)

    def search(self, query: str = "", limit: int = 10) -> list[SkillRecord]:
        safe_limit = max(1, min(limit, 50))
        normalized_query = query.strip().lower()

        all_skills = list(self._skills_by_id.values())
        if not normalized_query:
            return all_skills[:safe_limit]

        matches = [
            skill
            for skill in all_skills
            if normalized_query in skill.id.lower()
            or normalized_query in skill.name.lower()
            or normalized_query in skill.description.lower()
            or normalized_query in skill.category.lower()
        ]
        return matches[:safe_limit]

    def get(self, skill_id: str) -> SkillRecord | None:
        return self._skills_by_id.get(skill_id.strip())

    def read_skill_markdown(self, skill_id: str) -> str:
        skill = self.get(skill_id)
        if not skill:
            return f"Skill not found: {skill_id}"

        skill_dir = (self._repo_root / skill.path).resolve()
        allowed_root = self._skills_root.resolve()
        if allowed_root not in skill_dir.parents and skill_dir != allowed_root:
            return f"Skill path is outside allowed skills root: {skill.id}"
        markdown_path = skill_dir / "SKILL.md"

        if not markdown_path.exists():
            return (
                f"Skill metadata exists for '{skill.id}' but no SKILL.md was found "
                f"at {markdown_path}."
            )

        try:
            content = markdown_path.read_text(encoding="utf-8")
        except OSError as exc:
            return f"Failed to read SKILL.md for '{skill.id}': {exc}"

        if len(content) > 12000:
            return (
                "SKILL.md is long; returning first 12000 characters.\n\n"
                + content[:12000]
            )
        return content

    def prompt_context(self, max_visible_skills: int = 15) -> str:
        if not self.is_enabled():
            return (
                "No local skills catalog is loaded. Proceed with financial analysis "
                "without skill tools."
            )

        safe_max = max(1, min(max_visible_skills, 30))
        preview_skills = self.search(limit=safe_max)
        lines = [
            "You can use local repository skills as optional tools.",
            f"A total of {self.total_skills()} skills are available in skills_index.json.",
            "When a specialized workflow is needed, first call `search_skills`, then call",
            "`read_skill` with the selected `skill_id`, and follow the retrieved guidance.",
            "Skill preview (id - description):",
        ]
        for skill in preview_skills:
            description = skill.description or "No description provided."
            lines.append(f"- {skill.id} - {description}")
        return "\n".join(lines)

    def tool_schemas(self) -> list[dict[str, Any]]:
        return [
            {
                "type": "function",
                "name": "search_skills",
                "description": (
                    "Search available local skills from skills_index.json by query."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": (
                                "Keyword query to match skill id, name, description, "
                                "or category."
                            ),
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of skill matches to return.",
                            "minimum": 1,
                            "maximum": 50,
                            "default": 10,
                        },
                    },
                    "required": [],
                    "additionalProperties": False,
                },
            },
            {
                "type": "function",
                "name": "read_skill",
                "description": "Read the SKILL.md content for a given skill_id.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "skill_id": {
                            "type": "string",
                            "description": "Exact skill id from search_skills results.",
                        }
                    },
                    "required": ["skill_id"],
                    "additionalProperties": False,
                },
            },
        ]

    def execute_tool(self, tool_name: str, arguments: dict[str, Any]) -> str:
        if tool_name == "search_skills":
            query = str(arguments.get("query", "")).strip()
            raw_limit = arguments.get("limit", 10)
            limit = raw_limit if isinstance(raw_limit, int) else 10
            results = [
                {
                    "id": item.id,
                    "name": item.name,
                    "description": item.description,
                    "category": item.category,
                    "risk": item.risk,
                    "source": item.source,
                }
                for item in self.search(query=query, limit=limit)
            ]
            return json.dumps(
                {
                    "query": query,
                    "returned": len(results),
                    "total_skills": self.total_skills(),
                    "skills": results,
                }
            )

        if tool_name == "read_skill":
            skill_id = str(arguments.get("skill_id", "")).strip()
            return self.read_skill_markdown(skill_id)

        return f"Unsupported tool: {tool_name}"
