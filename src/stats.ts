import fs from "node:fs";
import path from "node:path";
import { getCurrentStyle } from "./style.js";
import { usageLog } from "./paths.js";

export const USAGE_LOG = usageLog();

const BASELINE_TOKENS_WITHOUT_MEMORY = 3000;
const BASELINE_OUTPUT_TOKENS_PER_LOAD = 800;

export interface UsageEvent {
  ts: string;
  tool: string;
  action: "load" | "save" | "search";
  tokens: number;
  project?: string;
}

export function logUsage(event: UsageEvent): void {
  try {
    const dir = path.dirname(USAGE_LOG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(USAGE_LOG, JSON.stringify(event) + "\n", "utf8");
  } catch {}
}

export interface UsageStats {
  totalEvents: number;
  loads: number;
  saves: number;
  searches: number;
  tokensServed: number;
  estimatedBaseline: number;
  estimatedSaved: number;
  savingsPercent: number;
  uniqueProjects: number;
  firstEvent?: string;
  lastEvent?: string;
  byTool: Record<string, { loads: number; tokensServed: number }>;
}

export function readUsage(): UsageEvent[] {
  if (!fs.existsSync(USAGE_LOG)) return [];
  const text = fs.readFileSync(USAGE_LOG, "utf8");
  const events: UsageEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {}
  }
  return events;
}

export function computeStats(events: UsageEvent[] = readUsage()): UsageStats {
  const stats: UsageStats = {
    totalEvents: events.length,
    loads: 0,
    saves: 0,
    searches: 0,
    tokensServed: 0,
    estimatedBaseline: 0,
    estimatedSaved: 0,
    savingsPercent: 0,
    uniqueProjects: 0,
    byTool: {},
  };

  const projects = new Set<string>();
  for (const e of events) {
    if (e.action === "load") stats.loads++;
    if (e.action === "save") stats.saves++;
    if (e.action === "search") stats.searches++;
    if (e.action === "load") stats.tokensServed += e.tokens;
    if (e.project) projects.add(e.project);
    if (!stats.byTool[e.tool]) stats.byTool[e.tool] = { loads: 0, tokensServed: 0 };
    if (e.action === "load") {
      stats.byTool[e.tool].loads++;
      stats.byTool[e.tool].tokensServed += e.tokens;
    }
  }

  stats.uniqueProjects = projects.size;
  stats.estimatedBaseline = stats.loads * BASELINE_TOKENS_WITHOUT_MEMORY;
  stats.estimatedSaved = Math.max(0, stats.estimatedBaseline - stats.tokensServed);
  stats.savingsPercent = stats.estimatedBaseline > 0
    ? Math.round((stats.estimatedSaved / stats.estimatedBaseline) * 100)
    : 0;

  if (events.length > 0) {
    stats.firstEvent = events[0].ts;
    stats.lastEvent = events[events.length - 1].ts;
  }

  return stats;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatStats(stats: UsageStats): string {
  const out: string[] = [];
  out.push("");
  out.push("=== MemoryBridge Usage & Savings ===");
  out.push("");

  if (stats.totalEvents === 0) {
    out.push("  No usage data yet.");
    out.push("");
    out.push("  Stats are collected as your AI tools call memory_load and memory_save.");
    out.push("  Run `memorybridge init`, restart your AI tool, then have a session.");
    out.push("");
    return out.join("\n");
  }

  out.push(`  Tracking since:  ${stats.firstEvent?.slice(0, 10) ?? "—"}`);
  out.push(`  Last activity:   ${stats.lastEvent?.slice(0, 10) ?? "—"}`);
  out.push(`  Unique projects: ${stats.uniqueProjects}`);
  out.push("");
  out.push("  Calls:");
  out.push(`    memory_load:    ${fmt(stats.loads)}`);
  out.push(`    memory_save:    ${fmt(stats.saves)}`);
  out.push(`    memory_search:  ${fmt(stats.searches)}`);
  out.push("");
  out.push("  Tokens served via memory_load: " + fmt(stats.tokensServed));
  out.push("");
  out.push("  INPUT token savings (vs. re-pasting ~3,000 tokens of context per session):");
  out.push(`    Baseline:        ${fmt(stats.estimatedBaseline)} tokens`);
  out.push(`    Actual served:   ${fmt(stats.tokensServed)} tokens`);
  out.push(`    Saved:           ${fmt(stats.estimatedSaved)} tokens (${stats.savingsPercent}%)`);
  out.push("");

  const style = getCurrentStyle();
  const outputPct = style.on ? style.profile.estOutputSavingsPercent : 0;
  const baselineOutput = stats.loads * BASELINE_OUTPUT_TOKENS_PER_LOAD;
  const savedOutput = Math.round((baselineOutput * outputPct) / 100);

  out.push(`  OUTPUT token savings (style level ${style.on ? style.profile.level + " — " + style.profile.name : "OFF"}):`);
  out.push(`    Baseline:        ${fmt(baselineOutput)} tokens (~${BASELINE_OUTPUT_TOKENS_PER_LOAD} per session)`);
  out.push(`    Estimated saved: ${fmt(savedOutput)} tokens (${outputPct}%)`);
  out.push("");

  const inputCheap = 0.25, inputMid = 3.0, outputCheap = 1.25, outputMid = 15.0;
  const savedInM = stats.estimatedSaved / 1_000_000;
  const savedOutM = savedOutput / 1_000_000;
  const totalHaiku = savedInM * inputCheap + savedOutM * outputCheap;
  const totalSonnet = savedInM * inputMid + savedOutM * outputMid;

  out.push("  Total $ saved (input + output, approximate):");
  out.push(`    Haiku-class  ($0.25/M in,  $1.25/M out): $${totalHaiku.toFixed(4)}`);
  out.push(`    Sonnet-class ($3.00/M in, $15.00/M out): $${totalSonnet.toFixed(4)}`);
  out.push("");

  if (Object.keys(stats.byTool).length > 0) {
    out.push("  By tool:");
    for (const [tool, data] of Object.entries(stats.byTool)) {
      out.push(`    ${tool.padEnd(20)} ${fmt(data.loads).padStart(6)} loads   ${fmt(data.tokensServed).padStart(8)} tokens served`);
    }
    out.push("");
  }

  out.push("  Note: \"Baseline\" assumes ~3,000 tokens of context re-pasted per session without");
  out.push("  MemoryBridge. Actual savings vary by project complexity. This is an estimate.");
  out.push("");

  return out.join("\n");
}
