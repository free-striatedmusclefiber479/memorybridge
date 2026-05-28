import { MemoryFile } from "./format.js";

export interface QualityIssue {
  section: string;
  line: string;
  reasons: string[];
  severity: "low" | "medium" | "high";
}

export interface QualityReport {
  totalEntries: number;
  issues: QualityIssue[];
  grade: "A" | "B" | "C" | "D" | "F";
  score: number;
}

const STALE_DATE_KEYWORDS = ["today", "tomorrow", "yesterday", "this week", "last week", "next week", "today's", "this morning", "this afternoon", "tonight"];
const SYSTEM_PROMPT_ECHO = [
  /you are (a|an) /i,
  /assistant should/i,
  /your task is to/i,
  /^I (will|am going to|should) /i,
];
const FILLER_HEADS = [/^(sure|of course|certainly|absolutely|definitely)/i, /let me /i, /^I'?ll /i];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function nearDupes(lines: string[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  const sets = lines.map((l) => new Set(tokenize(l)));
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = sets[i];
      const b = sets[j];
      if (a.size === 0 || b.size === 0) continue;
      let inter = 0;
      for (const t of a) if (b.has(t)) inter++;
      const denom = Math.min(a.size, b.size);
      const sim = inter / denom;
      if (sim >= 0.85) {
        if (!map.has(i)) map.set(i, []);
        map.get(i)!.push(j);
      }
    }
  }
  return map;
}

export function scoreFile(file: MemoryFile): QualityReport {
  const issues: QualityIssue[] = [];
  let totalEntries = 0;

  for (const [section, lines] of file.sections.entries()) {
    if (section === "@header" || section === "@pinned") continue;
    if (lines.length === 0) continue;

    const dupes = nearDupes(lines);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith("-")) continue;
      totalEntries++;
      const content = line.replace(/^-\s*(\[\d{4}-\d{2}-\d{2}\]\s*)?/, "");
      const reasons: string[] = [];

      if (content.length > 200) reasons.push("over 200 chars (compress)");
      if (content.length > 350) reasons.push("over 350 chars (likely waste)");
      if (dupes.has(i)) reasons.push(`near-duplicate of line ${dupes.get(i)![0] + 1} in same section`);

      const lc = content.toLowerCase();
      for (const kw of STALE_DATE_KEYWORDS) {
        if (lc.includes(` ${kw} `) || lc.startsWith(`${kw} `) || lc.endsWith(` ${kw}`)) {
          reasons.push(`time-sensitive ("${kw}") — will go stale`);
          break;
        }
      }

      for (const re of SYSTEM_PROMPT_ECHO) {
        if (re.test(content)) {
          reasons.push("looks like a system-prompt echo");
          break;
        }
      }

      for (const re of FILLER_HEADS) {
        if (re.test(content)) {
          reasons.push("filler-style opening");
          break;
        }
      }

      if (reasons.length > 0) {
        let severity: QualityIssue["severity"] = "low";
        if (reasons.some((r) => r.includes("waste") || r.includes("system-prompt"))) severity = "high";
        else if (reasons.some((r) => r.includes("duplicate") || r.includes("stale"))) severity = "medium";
        issues.push({ section, line: content, reasons, severity });
      }
    }
  }

  const highCount = issues.filter((i) => i.severity === "high").length;
  const medCount = issues.filter((i) => i.severity === "medium").length;
  const lowCount = issues.filter((i) => i.severity === "low").length;
  const penalty = highCount * 10 + medCount * 5 + lowCount * 2;
  const max = Math.max(totalEntries * 2, 10);
  const score = Math.max(0, 100 - Math.round((penalty / max) * 100));
  let grade: QualityReport["grade"] = "A";
  if (score < 90) grade = "B";
  if (score < 75) grade = "C";
  if (score < 60) grade = "D";
  if (score < 40) grade = "F";

  return { totalEntries, issues, grade, score };
}

export function formatQualityReport(report: QualityReport, memoryFile: string): string {
  const out: string[] = [];
  out.push("");
  out.push("=== Memory Quality Report ===");
  out.push("");
  out.push(`  File:     ${memoryFile}`);
  out.push(`  Entries:  ${report.totalEntries}`);
  out.push(`  Grade:    ${report.grade}  (score: ${report.score}/100)`);
  out.push(`  Issues:   ${report.issues.length}`);
  out.push("");

  if (report.issues.length === 0) {
    out.push("  ✅ No quality issues detected. Memory looks clean.");
    out.push("");
    return out.join("\n");
  }

  const bySev = { high: [] as QualityIssue[], medium: [] as QualityIssue[], low: [] as QualityIssue[] };
  for (const issue of report.issues) bySev[issue.severity].push(issue);

  if (bySev.high.length > 0) {
    out.push("  [HIGH severity — fix soon]");
    for (const i of bySev.high) {
      out.push(`    ${i.section}: ${i.line.slice(0, 80)}${i.line.length > 80 ? "…" : ""}`);
      out.push(`      reasons: ${i.reasons.join("; ")}`);
    }
    out.push("");
  }
  if (bySev.medium.length > 0) {
    out.push("  [MEDIUM severity]");
    for (const i of bySev.medium) {
      out.push(`    ${i.section}: ${i.line.slice(0, 80)}${i.line.length > 80 ? "…" : ""}`);
      out.push(`      reasons: ${i.reasons.join("; ")}`);
    }
    out.push("");
  }
  if (bySev.low.length > 0) {
    out.push(`  [LOW severity — ${bySev.low.length} items]`);
    for (const i of bySev.low.slice(0, 5)) {
      out.push(`    ${i.section}: ${i.line.slice(0, 80)}${i.line.length > 80 ? "…" : ""}`);
      out.push(`      reasons: ${i.reasons.join("; ")}`);
    }
    if (bySev.low.length > 5) out.push(`    … and ${bySev.low.length - 5} more`);
    out.push("");
  }

  out.push("  Fix suggestions:");
  out.push("    - Edit the file directly: memorybridge open");
  out.push("    - Or rewrite entries via: memorybridge add \"...\" --category <c>  (dedup will replace)");
  out.push("    - Compact stale entries: memorybridge compact");
  out.push("");

  return out.join("\n");
}
