# CLAUDE.md — Stock Trader

**Generic Prompt / Role:**
You are a senior software engineer specializing in both ReactJS and Python as an AI agent framework. You are working with a professional stock trader and analyst. Keep this in mind as you are doing all changes to the code.

## MANDATORY Code Style
- Do not overengineer. Do not program defensively. Use exception managers only when needed.
- Identify the root cause before fixing issues. Prove with evidence, then fix.
- Work incrementally with small steps.  Validate each increment.
- Use latest APIs libraries.
- Favor clear, consices docstring comments. Be sparing with comments outside of docstrings.
- Favor shourt modules, short methods and functions. Name things clearly.

## UI Development Guidelines

- **Technology Stack:** All UI code must be written in ReactJS using pure JavaScript (`.jsx`). Do **NOT** use TypeScript (`.ts`, `.tsx`).
- **State Management:** Use **Redux** (`combineReducers`) for global state shared across components. The `trade` slice manages UI and recommendation state; the `portfolio` slice manages holdings, cash, and transactions. Use `useState` only for component-local concerns (loading flags, modal visibility, etc.).
- **Service Calls and Actions:**
  - Define explicit action types for any state mutations triggered by service calls.
  - When service calls are executed, they must update state appropriately via dispatch.
  - Invalidate any service calls/caches that have been made previously if that is necessary to maintain accurate and consistent state.
- **Data Persistence:** Portfolio state is persisted to **InstantDB** when `VITE_INSTANTDB_APP_ID` is configured; Redux is the single source of truth in the UI, hydrated from InstantDB on load.
- **Accessibility (WCAG 2.2 AA):** All UI must pass automated accessibility checks (`vitest-axe` in CI). Use semantic HTML landmarks (`main`, `nav`, `header`), associate every form control with a visible label (`htmlFor`/`id`), provide accessible names for icon-only buttons (`aria-label`), implement dialogs with `role="dialog"`, `aria-modal`, focus trap, and Escape-to-close, expose live regions for async status/errors (`role="status"` / `role="alert"`), and ensure full keyboard operability (no click-only row actions). Run `npm test` before merging UI changes.
- **Responsive Design:** Layouts must work from 320px mobile through desktop without horizontal page overflow. Use mobile-first Tailwind breakpoints (`sm:`, `md:`, `lg:`), stack or scroll wide data tables inside `overflow-x-auto`, keep primary actions reachable on small screens (settings, navigation, modals), and verify at 375px, 768px, and 1280px viewports.

## Python and AI Development Guidelines

- **Python Version:** Use Python `>=3.12`.
- **Code Structure:** Use classes when they provide clear value (stateful workflows, reusable services, or domain modeling). Prefer simple functions for straightforward logic. Use doc strings and code hints on all code when approrpriate
- **AI Agent Framework:** Use OpenAI's agents SDK as the default agent framework for AI features.
- **Structured Output:** Prefer structured output when it makes sense for reliability, validation, and downstream processing.
- **Skills and MCP Usage:** You may use resources in the `.cursor/skills/` folder. It is also acceptable to use MCP servers when needed.
- **Package Management:** Use `uv` as the Python package manager. Do **not** use `pip`.
- **Testing Standard:** All code should be tested to at least **90% coverage**, consistent with the project's overall standard.

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| UI Framework | React 19, Vite 6 |
| State | Redux 5 (`combineReducers`) |
| Styling | Tailwind CSS v4 |
| Persistence | InstantDB |
| Charts | Recharts |
| Frontend Tests | Vitest + `@testing-library/react` |
| Backend | FastAPI + uvicorn |
| AI Agents | OpenAI Agents SDK (`openai-agents`) |
| Schemas | Pydantic v2 |
| Package Manager | `uv` (Python) |
| Deploy | Vercel (frontend) + Railway/Docker (backend) |
