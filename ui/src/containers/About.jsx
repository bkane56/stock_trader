import React from "react";
import {
  ArrowRight,
  Bot,
  Cloud,
  Database,
  GitBranch,
  Layers,
  Shield,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { GlassCard } from "../components/GlassCard";

const GITHUB_URL = "https://github.com/bkane56/stock_trader";

const TECH_STACK = [
  {
    title: "Frontend",
    items: ["React 19", "Vite 6", "Redux 5", "React Router 7", "Tailwind CSS v4", "Recharts"],
  },
  {
    title: "Backend",
    items: ["Python 3.12+", "FastAPI", "Pydantic v2", "OpenAI Agents SDK", "uv", "pytest"],
  },
  {
    title: "Data & infra",
    items: ["InstantDB", "Polygon.io", "Vercel", "Railway / Docker", "OpenAPI /docs"],
  },
];

const FLOW_STEPS = [
  { label: "Sign in", detail: "InstantDB magic-code auth" },
  { label: "Sync portfolio", detail: "Redux hydrated from InstantDB" },
  { label: "Refresh prices", detail: "POST /quotes/holdings/intraday" },
  { label: "Generate briefing", detail: "Research → Advisor agents" },
  { label: "Execute trades", detail: "Manual, assisted, or autonomous" },
];

const TRADING_MODES = [
  {
    name: "Manual",
    description: "You control every trade. The AI briefing is informational.",
  },
  {
    name: "Assisted",
    description: "AI ranks recommendations; you accept or decline each one.",
  },
  {
    name: "Autonomous",
    description:
      "AI executes within guardrails during US market hours (cash reserve, position limits, confidence floor).",
  },
];

const HIGHLIGHTS = [
  {
    icon: Bot,
    title: "Multi-agent AI",
    text: "Research agent gathers market context; Financial Advisor synthesizes structured briefings via Pydantic schemas.",
  },
  {
    icon: Shield,
    title: "Execution guardrails",
    text: "Reserve floor, min/max positions, fee ratio caps, and confidence thresholds before any autonomous trade.",
  },
  {
    icon: GitBranch,
    title: "Full-stack separation",
    text: "React SPA on Vercel, FastAPI on Railway, InstantDB for persistence — CORS-aware, env-driven configuration.",
  },
  {
    icon: Layers,
    title: "Accessible UI",
    text: "WCAG-oriented patterns with vitest-axe automated checks, semantic landmarks, and keyboard-operable dialogs.",
  },
];

function FlowArrow() {
  return (
    <ArrowRight
      className="hidden sm:block w-4 h-4 text-teal-500 shrink-0"
      aria-hidden="true"
    />
  );
}

export function About() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10 pb-8"
    >
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
          <Zap className="w-3 h-3" aria-hidden="true" />
          Portfolio project
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight dark:text-white">
          How InvestAI works
        </h1>
        <p className="max-w-3xl text-sm sm:text-base text-slate-600 leading-relaxed dark:text-slate-300">
          InvestAI is a full-stack AI portfolio assistant built to demonstrate senior-level
          engineering: multi-agent orchestration, structured API contracts, real-time persistence,
          and production deployment patterns. It is decision-support tooling — not financial advice.
        </p>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400"
        >
          View source &amp; architecture diagrams on GitHub
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </a>
      </header>

      <GlassCard className="p-6 sm:p-8">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">
          System flow
        </h2>
        <ol className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-2">
          {FLOW_STEPS.map((step, index) => (
            <li key={step.label} className="flex items-center gap-2 sm:gap-2">
              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 min-w-[140px] dark:border-slate-700 dark:bg-slate-900/60">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[11px] font-black text-white">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{step.label}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{step.detail}</p>
                </div>
              </div>
              {index < FLOW_STEPS.length - 1 ? <FlowArrow /> : null}
            </li>
          ))}
        </ol>
        <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
          Mermaid sequence and architecture diagrams live in{" "}
          <a
            href={`${GITHUB_URL}/blob/main/ARCHITECTURE.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-teal-600 hover:underline dark:text-teal-400"
          >
            ARCHITECTURE.md
          </a>{" "}
          on GitHub.
        </p>
      </GlassCard>

      <div className="grid gap-6 md:grid-cols-3">
        {TECH_STACK.map((group) => (
          <GlassCard key={group.title} className="p-6">
            <div className="flex items-center gap-2 mb-4">
              {group.title === "Frontend" ? (
                <Layers className="w-4 h-4 text-teal-600" aria-hidden="true" />
              ) : group.title === "Backend" ? (
                <Cloud className="w-4 h-4 text-teal-600" aria-hidden="true" />
              ) : (
                <Database className="w-4 h-4 text-teal-600" aria-hidden="true" />
              )}
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
                {group.title}
              </h2>
            </div>
            <ul className="flex flex-wrap gap-2">
              {group.items.map((item) => (
                <li
                  key={item}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {item}
                </li>
              ))}
            </ul>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="p-6 sm:p-8">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">
          Trading modes
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {TRADING_MODES.map((mode) => (
            <div
              key={mode.name}
              className="rounded-xl border border-slate-200 bg-white/60 p-4 dark:border-slate-700 dark:bg-slate-900/40"
            >
              <p className="text-sm font-black text-slate-900 dark:text-white">{mode.name}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {mode.description}
              </p>
            </div>
          ))}
        </div>
      </GlassCard>

      <div className="grid gap-4 sm:grid-cols-2">
        {HIGHLIGHTS.map((item) => (
          <GlassCard key={item.title} className="p-5 flex gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 dark:bg-teal-900/40">
              <item.icon className="w-5 h-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">{item.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {item.text}
              </p>
            </div>
          </GlassCard>
        ))}
      </div>

      <p className="text-[11px] font-medium text-slate-400 text-center">
        © {new Date().getFullYear()} InvestAI — portfolio demonstration project. Not investment advice.
      </p>
    </motion.div>
  );
}
