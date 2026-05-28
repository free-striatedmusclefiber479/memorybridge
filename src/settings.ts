import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { TOKEN_BUDGET } from "./budget.js";
import { getCurrentStyle, PROFILES } from "./style.js";
import { globalDir, globalFile, styleFile, usageLog, historyDir } from "./paths.js";
import { detectTools } from "./scan.js";
import { computeStats } from "./stats.js";
import { findProjectFile, lineCount } from "./memory.js";

interface SettingRow {
  name: string;
  value: string;
  howToChange: string;
}

function fileSize(p: string): string {
  try {
    return `${fs.statSync(p).size} bytes`;
  } catch {
    return "(missing)";
  }
}

export function formatSettings(): string {
  const out: string[] = [];
  const style = getCurrentStyle();
  const stats = computeStats();
  const projectPath = findProjectFile();
  const lines = projectPath ? lineCount(projectPath) : 0;
  const tools = detectTools().filter((t) => t.detected);

  out.push("");
  out.push("===============================================================");
  out.push("                MemoryBridge — Settings Dashboard              ");
  out.push("===============================================================");
  out.push("");

  // SECTION 1: RESPONSE LENGTH
  out.push("┌─ RESPONSE LENGTH (controls AI reply size — biggest $ saver) ─┐");
  out.push("");
  for (let i = 1; i <= 5; i++) {
    const p = PROFILES[i as 1|2|3|4|5];
    const marker = style.on && p.level === style.profile.level ? "▶ " : "  ";
    const limit = p.maxWords === "no-limit" ? "no limit" : `≤${p.maxWords} words`;
    const savings = p.estOutputSavingsPercent > 0 ? `~${p.estOutputSavingsPercent}% saved` : "no savings";
    out.push(`  ${marker}${i}  ${p.name.padEnd(12)}  ${limit.padEnd(12)}  ${savings}`);
  }
  out.push("");
  out.push("  How to change:");
  out.push("    memorybridge shorter        ← one step shorter (more $ saved)");
  out.push("    memorybridge longer         ← one step longer (more detail)");
  out.push("    memorybridge style 1        ← jump to ultra-terse (max savings)");
  out.push("    memorybridge style 5        ← jump to verbose (no limits)");
  out.push("    memorybridge style off      ← disable style injection entirely");
  out.push("");

  // SECTION 2: SAVINGS
  out.push("┌─ SAVINGS (how much you've saved so far) ─────────────────────┐");
  out.push("");
  if (stats.totalEvents === 0) {
    out.push("  No data yet. Start using AI tools with MemoryBridge and");
    out.push("  numbers will fill in. View any time with: memorybridge savings");
  } else {
    out.push(`  Memory loaded ${stats.loads} time(s)`);
    out.push(`  Tokens served: ${stats.tokensServed.toLocaleString()}`);
    out.push(`  Estimated saved (input):  ${stats.estimatedSaved.toLocaleString()} tokens (${stats.savingsPercent}%)`);
    out.push(`  Unique projects tracked:  ${stats.uniqueProjects}`);
    out.push("");
    out.push("  See full breakdown:  memorybridge savings");
    out.push("  See before vs after: memorybridge compare");
  }
  out.push("");

  // SECTION 3: STORAGE LOCATIONS
  out.push("┌─ WHERE YOUR DATA LIVES ──────────────────────────────────────┐");
  out.push("");
  out.push(`  Global folder:        ${globalDir()}`);
  out.push(`    - global memory:    ${globalFile().padEnd(50)} ${fileSize(globalFile())}`);
  out.push(`    - style config:     ${styleFile().padEnd(50)} ${fileSize(styleFile())}`);
  out.push(`    - usage log:        ${usageLog().padEnd(50)} ${fileSize(usageLog())}`);
  out.push(`    - history:          ${historyDir()}`);
  out.push("");
  out.push(`  This project's memory:`);
  if (projectPath) {
    out.push(`    ${projectPath}  (${lines} lines)`);
  } else {
    out.push(`    (none — will be created at first save in: ${process.cwd()})`);
  }
  out.push("");
  out.push("  How to change global path:");
  out.push("    set env var MEMORYBRIDGE_PATH=<path>  (e.g. in shell profile)");
  out.push("");

  // SECTION 4: TOKEN BUDGETS
  out.push("┌─ TOKEN BUDGETS ──────────────────────────────────────────────┐");
  out.push("");
  out.push(`  Default load (memory_load with no section): ${TOKEN_BUDGET.DEFAULT_LOAD} tokens`);
  out.push(`  Hard cap (any single section load):         ${TOKEN_BUDGET.HARD_CAP} tokens`);
  out.push(`  Entry char cap (per saved entry):           ${TOKEN_BUDGET.ENTRY_CHAR_CAP} chars`);
  out.push(`  Search result cap:                          ${TOKEN_BUDGET.SEARCH_RESULT_CAP} tokens`);
  out.push("");
  out.push("  (these are compile-time constants in src/budget.ts — edit to change)");
  out.push("");

  // SECTION 5: AI TOOLS CONNECTED
  out.push("┌─ AI TOOLS CONNECTED ─────────────────────────────────────────┐");
  out.push("");
  if (tools.length === 0) {
    out.push("  (no AI tools detected)");
  } else {
    for (const t of tools) {
      out.push(`  [✓] ${t.name.padEnd(20)} ${t.configPath ?? ""}`);
    }
  }
  out.push("");
  out.push("  How to change:");
  out.push("    memorybridge init           ← re-detect and wire up new tools");
  out.push("    memorybridge uninstall      ← remove MemoryBridge from all configs");
  out.push("    memorybridge scan           ← show all installed AI tools");
  out.push("");

  // SECTION 6: QUICK ACTIONS
  out.push("┌─ QUICK ACTIONS (most common commands) ───────────────────────┐");
  out.push("");
  out.push("  memorybridge shorter            shorter AI responses (save more)");
  out.push("  memorybridge longer             longer AI responses (more detail)");
  out.push("  memorybridge savings            see token + $ savings");
  out.push("  memorybridge show               preview what AI will see this session");
  out.push("  memorybridge compare            side-by-side before/after");
  out.push("  memorybridge add \"<text>\"      manually add a memory");
  out.push("  memorybridge open               open memory file in your editor");
  out.push("  memorybridge undo               roll back last save");
  out.push("  memorybridge doctor             health check");
  out.push("  memorybridge help               full command list");
  out.push("");

  return out.join("\n");
}
