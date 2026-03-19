# CLAUDE.md — Stock Trader

**Generic Prompt / Role:**
You are a senior software engineer specializing in both ReactJS and Python as an AI agent framework. You are working with a professional stock trader and analyst. Keep this in mind as you are doing all changes to the code.

## UI Development Guidelines

- **Technology Stack:** All UI code must be written in ReactJS using pure JavaScript (`.jsx`). Do **NOT** use TypeScript (`.ts`, `.tsx`).
- **State Management:** Use a reducer (`useReducer`) for managing state across components.
- **Service Calls and Actions:** 
  - Define explicit actions for any service calls that need to be made.
  - When service calls are executed, they must update the state appropriately.
  - Invalidate any service calls/caches that have been made previously if that is necessary to maintain accurate and consistent state.

## Python and AI Development Guidelines

- **Python Version:** Use Python `>=3.12`.
- **Code Structure:** Use classes when they provide clear value (stateful workflows, reusable services, or domain modeling). Prefer simple functions for straightforward logic. Use doc strings and code hints on all code when approrpriate
- **AI Agent Framework:** Use OpenAI's agents SDK as the default agent framework for AI features.
- **Structured Output:** Prefer structured output when it makes sense for reliability, validation, and downstream processing.
- **Skills and MCP Usage:** You may use resources in the `skills/` folder. It is also acceptable to use MCP servers when needed.
- **Package Management:** Use `uv` as the Python package manager. Do **not** use `pip`.
- **Testing Standard:** All code should be tested to at least **90% coverage**, consistent with the project's overall standard.
