import fs from "node:fs";
import { globalDir, styleFile } from "./paths.js";

export const STYLE_FILE = styleFile();
const GLOBAL_DIR = globalDir();

export type StyleLevel = 1 | 2 | 3 | 4 | 5;
export type StyleAction = "bigger" | "smaller" | "off" | "on" | "1" | "2" | "3" | "4" | "5";

export interface StyleProfile {
  level: StyleLevel;
  name: string;
  description: string;
  maxWords: number | "no-limit";
  estOutputSavingsPercent: number;
  directives: string[];
}

export const PROFILES: Record<StyleLevel, StyleProfile> = {
  1: {
    level: 1,
    name: "ultra-terse",
    description: "One-line answers. Maximum token savings.",
    maxWords: 15,
    estOutputSavingsPercent: 75,
    directives: [
      "Maximum 1-2 lines per answer. Hard cap: 15 words.",
      "No preambles, no postambles, no explanations.",
      "For code: show only the changed lines, nothing else.",
      "For yes/no: just say yes or no, optionally with file:line reference.",
      "Never restate the question.",
      "Never explain what code does.",
    ],
  },
  2: {
    level: 2,
    name: "concise",
    description: "Short, code-focused. Default for token-conscious users.",
    maxWords: 60,
    estOutputSavingsPercent: 55,
    directives: [
      "Default answer length: under 60 words.",
      "No preambles (no 'Sure', 'Of course', 'I'll help').",
      "No postambles (no 'Let me know', 'Hope this helps').",
      "Skip explanations of obvious code.",
      "For code changes: show diffs or only changed lines.",
      "Reference files as path:line, don't re-paste large blocks.",
      "Don't restate what the user just said.",
    ],
  },
  3: {
    level: 3,
    name: "balanced",
    description: "Brief explanations with code. Default mode.",
    maxWords: 150,
    estOutputSavingsPercent: 25,
    directives: [
      "Skip preambles like 'Sure' or 'I'll help'.",
      "Explain only what's non-obvious about the code.",
      "Prefer diffs over full-file rewrites.",
      "Default answer length: under 150 words.",
    ],
  },
  4: {
    level: 4,
    name: "detailed",
    description: "Full explanations. Good for learning new concepts.",
    maxWords: 300,
    estOutputSavingsPercent: 10,
    directives: [
      "Explain reasoning and tradeoffs.",
      "Default answer length: under 300 words.",
      "Show context around code changes.",
    ],
  },
  5: {
    level: 5,
    name: "verbose",
    description: "No length limits. AI uses its full defaults.",
    maxWords: "no-limit",
    estOutputSavingsPercent: 0,
    directives: [],
  },
};

interface StyleConfig {
  level: StyleLevel;
  on: boolean;
  custom?: string[];
}

function readConfig(): StyleConfig {
  if (!fs.existsSync(STYLE_FILE)) {
    return { level: 3, on: true };
  }
  try {
    const text = fs.readFileSync(STYLE_FILE, "utf8");
    const cfg = JSON.parse(text);
    const level = (cfg.level >= 1 && cfg.level <= 5 ? cfg.level : 3) as StyleLevel;
    return { level, on: cfg.on !== false, custom: cfg.custom };
  } catch {}
  return { level: 3, on: true };
}

function writeConfig(cfg: StyleConfig): void {
  if (!fs.existsSync(GLOBAL_DIR)) fs.mkdirSync(GLOBAL_DIR, { recursive: true });
  fs.writeFileSync(STYLE_FILE, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

export function getCurrentStyle(): { profile: StyleProfile; on: boolean; custom: string[] } {
  const cfg = readConfig();
  return { profile: PROFILES[cfg.level], on: cfg.on, custom: cfg.custom ?? [] };
}

export function applyAction(action: StyleAction): { profile: StyleProfile; on: boolean; changed: boolean } {
  const cfg = readConfig();
  const before = JSON.stringify(cfg);

  if (action === "bigger") {
    cfg.level = Math.min(5, cfg.level + 1) as StyleLevel;
    cfg.on = true;
  } else if (action === "smaller") {
    cfg.level = Math.max(1, cfg.level - 1) as StyleLevel;
    cfg.on = true;
  } else if (action === "off") {
    cfg.on = false;
  } else if (action === "on") {
    cfg.on = true;
  } else {
    const n = Number(action);
    if (n >= 1 && n <= 5) {
      cfg.level = n as StyleLevel;
      cfg.on = true;
    } else {
      throw new Error(`unknown style action: ${action}. Use 1-5, bigger, smaller, on, off.`);
    }
  }

  writeConfig(cfg);
  return { profile: PROFILES[cfg.level], on: cfg.on, changed: JSON.stringify(cfg) !== before };
}

export function addCustomDirective(text: string): void {
  const cfg = readConfig();
  if (!cfg.custom) cfg.custom = [];
  cfg.custom.push(text);
  writeConfig(cfg);
}

export function clearCustomDirectives(): void {
  const cfg = readConfig();
  cfg.custom = [];
  writeConfig(cfg);
}

export function styleBlock(): string {
  const { profile, on, custom } = getCurrentStyle();
  if (!on) return "";
  if (profile.level === 5 && custom.length === 0) return "";

  const lines: string[] = [];
  lines.push(`[Response style: level ${profile.level} of 5 — ${profile.name}${profile.maxWords !== "no-limit" ? ` (≤ ${profile.maxWords} words)` : ""}]`);
  for (const d of profile.directives) lines.push(`- ${d}`);
  for (const c of custom) lines.push(`- ${c}`);
  return lines.join("\n");
}

export function formatStyleStatus(): string {
  const { profile, on, custom } = getCurrentStyle();
  const out: string[] = [];
  out.push("");
  out.push("=== MemoryBridge Response Style ===");
  out.push("");

  out.push("  Levels (smaller = fewer tokens spent on AI responses):");
  out.push("");
  for (let i = 1; i <= 5; i++) {
    const p = PROFILES[i as StyleLevel];
    const marker = on && p.level === profile.level ? "▶" : " ";
    const len = p.maxWords === "no-limit" ? "no limit" : `≤${p.maxWords} words`;
    const savings = p.estOutputSavingsPercent > 0 ? `~${p.estOutputSavingsPercent}% saved` : "no savings";
    out.push(`  ${marker} ${i}  ${p.name.padEnd(12)}  ${len.padEnd(12)}  ${savings}`);
  }
  out.push("");
  out.push(`  Currently: ${on ? `level ${profile.level} (${profile.name})` : "OFF — no style injected"}`);
  if (custom.length > 0) {
    out.push("");
    out.push("  Custom directives:");
    for (const c of custom) out.push(`    - ${c}`);
  }
  out.push("");
  out.push("  Toggle:");
  out.push("    memorybridge style bigger      one step longer responses (more tokens)");
  out.push("    memorybridge style smaller     one step shorter responses (fewer tokens)");
  out.push("    memorybridge style 1           jump to ultra-terse (max savings)");
  out.push("    memorybridge style 5           jump to verbose (no limits)");
  out.push("    memorybridge style off         disable style injection entirely");
  out.push("    memorybridge style on          re-enable (uses last level)");
  out.push("    memorybridge style add \"<directive>\"   add your own rule");
  out.push("    memorybridge style clear       remove custom directives");
  out.push("");
  return out.join("\n");
}
