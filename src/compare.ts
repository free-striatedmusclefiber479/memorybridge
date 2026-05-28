import { countTokens } from "./budget.js";
import { loadMemory } from "./memory.js";
import { getCurrentStyle } from "./style.js";

const TYPICAL_REEXPLAIN = `I'm working on a Next.js 14 project called todo-app. It uses TypeScript with strict mode enabled, Tailwind CSS for styling utility-first (no CSS modules), Supabase for both auth (via Row-Level Security policies, not NextAuth) and PostgreSQL database access, and Vercel for deployment. The codebase has an /app directory with the App Router, /components for shared UI, /lib for utilities including the Supabase client at lib/supabase.ts, and /hooks for custom hooks.

Some context about our decisions: we chose Supabase over NextAuth because the RLS model fits our multi-tenant data structure better. We chose PostgreSQL over MongoDB because we need relational joins for todos with tags. We're using Zustand for state management, not Redux, because Redux's boilerplate is overkill for this scale.

There's a known bug I haven't fixed yet: the payment webhook handler in /api/webhook.ts fires twice intermittently — we suspect a race condition. Also the mobile nav menu doesn't close after route changes — needs a usePathname() listener.

Some preferences for how I want you to help: always use TypeScript strict mode, never use implicit any. Prefer tabs over spaces. Use pnpm not npm. Show diffs when modifying code, don't repaste entire files. Be concise — no "Sure, I'll help!" preambles.

Environment: Node 20, pnpm package manager, local dev at localhost:3000, staging at todo-app-git-staging.vercel.app, production at todo-app.vercel.app. Don't paste real API keys.

Recently resolved: the Vercel build was failing because env vars needed the NEXT_PUBLIC_ prefix — fixed.`;

const ESTIMATED_OUTPUT_BASELINE = 800;
const PRICING = {
  haiku: { input: 0.25, output: 1.25 },
  sonnet: { input: 3.0, output: 15.0 },
  opus: { input: 15.0, output: 75.0 },
};

export interface CompareResult {
  baselineInputTokens: number;
  mbInputTokens: number;
  inputSavedPerSession: number;
  inputSavedPercent: number;

  baselineOutputTokens: number;
  estimatedOutputSaved: number;
  outputStyleLevel: number;
  outputStyleName: string;

  totalSavedPerSession: number;
  totalSavedPercent: number;

  costPerSession: Record<string, { without: number; with: number; saved: number }>;
  costPerMonth: Record<string, { without: number; with: number; saved: number }>;
  costPerYear: Record<string, { without: number; with: number; saved: number }>;
}

export function compare(opts: { sessionsPerMonth?: number } = {}): CompareResult {
  const sessionsPerMonth = opts.sessionsPerMonth ?? 100;
  const baselineInputTokens = countTokens(TYPICAL_REEXPLAIN);
  const mbLoad = loadMemory();
  const mbInputTokens = mbLoad.tokens;
  const inputSavedPerSession = Math.max(0, baselineInputTokens - mbInputTokens);
  const inputSavedPercent = baselineInputTokens > 0
    ? Math.round((inputSavedPerSession / baselineInputTokens) * 100)
    : 0;

  const style = getCurrentStyle();
  const outputPct = style.on ? style.profile.estOutputSavingsPercent : 0;
  const estimatedOutputSaved = Math.round((ESTIMATED_OUTPUT_BASELINE * outputPct) / 100);

  const totalSavedPerSession = inputSavedPerSession + estimatedOutputSaved;
  const totalBaseline = baselineInputTokens + ESTIMATED_OUTPUT_BASELINE;
  const totalSavedPercent = totalBaseline > 0
    ? Math.round((totalSavedPerSession / totalBaseline) * 100)
    : 0;

  const costPerSession: CompareResult["costPerSession"] = {};
  const costPerMonth: CompareResult["costPerMonth"] = {};
  const costPerYear: CompareResult["costPerYear"] = {};

  for (const [tier, price] of Object.entries(PRICING)) {
    const withoutPerSession = (baselineInputTokens / 1_000_000) * price.input + (ESTIMATED_OUTPUT_BASELINE / 1_000_000) * price.output;
    const withPerSession = (mbInputTokens / 1_000_000) * price.input + ((ESTIMATED_OUTPUT_BASELINE - estimatedOutputSaved) / 1_000_000) * price.output;
    const savedPerSession = withoutPerSession - withPerSession;
    costPerSession[tier] = { without: withoutPerSession, with: withPerSession, saved: savedPerSession };
    costPerMonth[tier] = { without: withoutPerSession * sessionsPerMonth, with: withPerSession * sessionsPerMonth, saved: savedPerSession * sessionsPerMonth };
    costPerYear[tier] = { without: withoutPerSession * sessionsPerMonth * 12, with: withPerSession * sessionsPerMonth * 12, saved: savedPerSession * sessionsPerMonth * 12 };
  }

  return {
    baselineInputTokens,
    mbInputTokens,
    inputSavedPerSession,
    inputSavedPercent,
    baselineOutputTokens: ESTIMATED_OUTPUT_BASELINE,
    estimatedOutputSaved,
    outputStyleLevel: style.profile.level,
    outputStyleName: style.profile.name,
    totalSavedPerSession,
    totalSavedPercent,
    costPerSession,
    costPerMonth,
    costPerYear,
  };
}

function fmtUSD(n: number, places = 4): string {
  if (n === 0) return "$0.00";
  return "$" + n.toFixed(places);
}

export function formatCompare(r: CompareResult, sessionsPerMonth: number): string {
  const out: string[] = [];
  out.push("");
  out.push("===============================================================");
  out.push("        BEFORE vs AFTER  —  one session of AI work             ");
  out.push("===============================================================");
  out.push("");
  out.push("  Scenario: you start a new chat with your AI on a Next.js project.");
  out.push("  WITHOUT MemoryBridge, you have to re-paste project context.");
  out.push("  WITH MemoryBridge, the AI loads it automatically (header only).");
  out.push("");
  out.push("  ┌─────────────────────────────────┬─────────────┬─────────────┐");
  out.push("  │                                 │   WITHOUT   │    WITH     │");
  out.push("  ├─────────────────────────────────┼─────────────┼─────────────┤");
  out.push(`  │ INPUT tokens (context to AI)    │  ${r.baselineInputTokens.toString().padStart(7)}    │  ${r.mbInputTokens.toString().padStart(7)}    │`);
  out.push(`  │ OUTPUT tokens (AI's reply)      │      ~${r.baselineOutputTokens}    │      ~${(r.baselineOutputTokens - r.estimatedOutputSaved).toString().padStart(4)}    │`);
  out.push(`  │ Style level                     │       n/a   │    ${r.outputStyleLevel}/5 (${r.outputStyleName.slice(0, 6).padEnd(6)})│`);
  out.push("  └─────────────────────────────────┴─────────────┴─────────────┘");
  out.push("");
  out.push(`  Input tokens saved per session:    ${r.inputSavedPerSession.toLocaleString()} (${r.inputSavedPercent}%)`);
  out.push(`  Output tokens saved per session:   ~${r.estimatedOutputSaved.toLocaleString()} (style level ${r.outputStyleLevel})`);
  out.push(`  Total tokens saved per session:    ${r.totalSavedPerSession.toLocaleString()} (${r.totalSavedPercent}%)`);
  out.push("");
  out.push("===============================================================");
  out.push("                   COST IMPACT  (real numbers)                 ");
  out.push("===============================================================");
  out.push(`  Assuming ${sessionsPerMonth} AI sessions per month:`);
  out.push("");
  out.push("  ┌──────────┬───────────────┬───────────────┬───────────────┐");
  out.push("  │  Model   │  Without/mo   │   With/mo     │   Saved/mo    │");
  out.push("  ├──────────┼───────────────┼───────────────┼───────────────┤");
  for (const tier of ["haiku", "sonnet", "opus"] as const) {
    const m = r.costPerMonth[tier];
    out.push(`  │ ${tier.padEnd(8)} │ ${fmtUSD(m.without, 2).padStart(13)} │ ${fmtUSD(m.with, 2).padStart(13)} │ ${fmtUSD(m.saved, 2).padStart(13)} │`);
  }
  out.push("  └──────────┴───────────────┴───────────────┴───────────────┘");
  out.push("");
  out.push("  Per year (Sonnet, this usage level):");
  out.push(`    Without MemoryBridge:  ${fmtUSD(r.costPerYear.sonnet.without, 2)}`);
  out.push(`    With MemoryBridge:     ${fmtUSD(r.costPerYear.sonnet.with, 2)}`);
  out.push(`    Saved:                 ${fmtUSD(r.costPerYear.sonnet.saved, 2)}`);
  out.push("");
  out.push("===============================================================");
  out.push("                   WHAT THE AI ACTUALLY SEES                   ");
  out.push("===============================================================");
  out.push("");
  out.push("  WITHOUT MemoryBridge — you'd type/paste something like this:");
  out.push("  (truncated for display — full version is what gets re-typed every time)");
  out.push("");
  const baselinePreview = TYPICAL_REEXPLAIN.split("\n").slice(0, 6).join("\n").split(" ").slice(0, 80).join(" ") + "…";
  for (const line of baselinePreview.split("\n")) out.push(`    │ ${line}`);
  out.push("");
  out.push("  WITH MemoryBridge — the AI gets this automatically:");
  out.push("");
  const memText = loadMemory().text;
  if (!memText) {
    out.push("    (no memory file in current directory — try in a project that has one)");
  } else {
    for (const line of memText.split("\n").slice(0, 18)) out.push(`    │ ${line}`);
    if (memText.split("\n").length > 18) out.push("    │ …");
  }
  out.push("");
  out.push("  Notes:");
  out.push(`    - Numbers use ${sessionsPerMonth} sessions/month. Adjust: memorybridge compare --sessions <N>`);
  out.push("    - Output savings depend on style level. Smaller level → more savings:");
  out.push("        memorybridge style smaller    or    memorybridge style 1");
  out.push("    - Real-world savings will VARY with your project complexity.");
  out.push("");
  return out.join("\n");
}
