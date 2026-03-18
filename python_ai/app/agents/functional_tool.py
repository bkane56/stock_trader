from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class FunctionalToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]
    method_name: str


def functional_tool(
    *,
    name: str,
    description: str,
    parameters: dict[str, Any],
) -> Callable[[Callable[..., str]], Callable[..., str]]:
    """Annotate an instance method as a tool callable by other agents."""

    def _decorator(func: Callable[..., str]) -> Callable[..., str]:
        setattr(
            func,
            "_functional_tool_spec",
            FunctionalToolSpec(
                name=name,
                description=description,
                parameters=parameters,
                method_name=func.__name__,
            ),
        )
        return func

    return _decorator


class FunctionalToolProvider:
    def _functional_tool_specs(self) -> list[FunctionalToolSpec]:
        specs: list[FunctionalToolSpec] = []
        for attr_name in dir(self.__class__):
            attr = getattr(self.__class__, attr_name, None)
            spec = getattr(attr, "_functional_tool_spec", None)
            if isinstance(spec, FunctionalToolSpec):
                specs.append(spec)
        return specs

    def functional_tool_schemas(self) -> list[dict[str, Any]]:
        schemas: list[dict[str, Any]] = []
        for spec in self._functional_tool_specs():
            schemas.append(
                {
                    "type": "function",
                    "name": spec.name,
                    "description": spec.description,
                    "parameters": spec.parameters,
                }
            )
        return schemas

    def execute_functional_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> str | None:
        for spec in self._functional_tool_specs():
            if spec.name != tool_name:
                continue
            handler = getattr(self, spec.method_name)
            return handler(**arguments)
        return None
