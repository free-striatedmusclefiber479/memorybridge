import { TOKEN_BUDGET } from "./budget.js";

export type Category = "preference" | "decision" | "issue" | "resolved" | "env" | "header" | "note" | "map";

const SECTION_BY_CATEGORY: Record<Category, string> = {
  header: "@header",
  preference: "@preferences",
  decision: "@decisions",
  issue: "@issues",
  resolved: "@resolved",
  env: "@env",
  note: "@notes",
  map: "@map",
};

const SECTION_ORDER = ["@header", "@map", "@preferences", "@decisions", "@issues", "@resolved", "@env", "@notes"];

export interface MemoryFile {
  meta: { project?: string; updated?: string; version: string };
  sections: Map<string, string[]>;
}

const FILLER = [
  /^the user said (they|that) ?/i,
  /^(i think|i believe|maybe|perhaps) /i,
  /^(also|and|so|well|basically|actually|honestly) /i,
  /^they (said|told me|mentioned|stated) /i,
];

export function compress(content: string): string {
  let c = content.trim().replace(/\s+/g, " ");
  for (const f of FILLER) c = c.replace(f, "");
  c = c.trim();
  if (c.length > TOKEN_BUDGET.ENTRY_CHAR_CAP) {
    c = c.slice(0, TOKEN_BUDGET.ENTRY_CHAR_CAP - 1) + "…";
  }
  return c;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatEntry(content: string, category: Category): string {
  const compressed = compress(content);
  if (category === "header" || category === "env") return compressed;
  return `- [${today()}] ${compressed}`;
}

export function emptyFile(projectName?: string): MemoryFile {
  const sections = new Map<string, string[]>();
  for (const s of SECTION_ORDER) sections.set(s, []);
  if (projectName) {
    sections.set("@header", [`project: ${projectName}`, `created: ${today()}`]);
  }
  return {
    meta: { project: projectName, updated: today(), version: "1" },
    sections,
  };
}

export function parse(text: string): MemoryFile {
  const file = emptyFile();
  if (!text || !text.trim()) return file;

  const lines = text.split(/\r?\n/);
  let currentSection: string | null = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;

    if (line.startsWith("# ")) {
      const m = line.match(/Updated:\s*([\d-]+)/i);
      if (m) file.meta.updated = m[1];
      const p = line.match(/project:\s*([^\s|]+)/i);
      if (p) file.meta.project = p[1];
      continue;
    }

    const sectionMatch = line.match(/^##\s+(@\w+)/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!file.sections.has(currentSection)) file.sections.set(currentSection, []);
      continue;
    }

    if (currentSection) {
      const arr = file.sections.get(currentSection)!;
      arr.push(line);
    }
  }

  return file;
}

export function serialize(file: MemoryFile): string {
  const out: string[] = [];
  out.push(`# .ai-memory.md | MemoryBridge | v${file.meta.version}`);
  out.push(`# Updated: ${today()}`);
  out.push("");

  for (const section of SECTION_ORDER) {
    const lines = file.sections.get(section);
    if (!lines || lines.length === 0) continue;
    out.push(`## ${section}`);
    for (const l of lines) out.push(l);
    out.push("");
  }

  for (const [section, lines] of file.sections.entries()) {
    if (SECTION_ORDER.includes(section)) continue;
    if (!lines || lines.length === 0) continue;
    out.push(`## ${section}`);
    for (const l of lines) out.push(l);
    out.push("");
  }

  return out.join("\n");
}

export function sectionForCategory(category: Category): string {
  return SECTION_BY_CATEGORY[category] ?? "@notes";
}

export function appendEntry(file: MemoryFile, entry: string, category: Category): { added: boolean; reason: string } {
  const section = sectionForCategory(category);
  if (!file.sections.has(section)) file.sections.set(section, []);
  const lines = file.sections.get(section)!;

  const normalized = normalize(entry);
  for (let i = 0; i < lines.length; i++) {
    if (normalize(lines[i]) === normalized) {
      lines[i] = entry;
      return { added: false, reason: "duplicate-updated" };
    }
    if (similarity(normalize(lines[i]), normalized) >= 0.88) {
      lines[i] = entry;
      return { added: false, reason: "near-duplicate-updated" };
    }
  }
  lines.push(entry);
  return { added: true, reason: "appended" };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\[\d{4}-\d{2}-\d{2}\]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const wa = new Set(a.split(" ").filter(Boolean));
  const wb = new Set(b.split(" ").filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.max(wa.size, wb.size);
}

export function getSection(file: MemoryFile, section: string): string {
  const lines = file.sections.get(section);
  if (!lines || lines.length === 0) return "";
  return `## ${section}\n${lines.join("\n")}`;
}

export function getPinnedSections(file: MemoryFile): string[] {
  const pinned = file.sections.get("@pinned") ?? [];
  const names: string[] = [];
  for (const line of pinned) {
    const m = line.match(/^-\s*(@\w+)/);
    if (m) names.push(m[1]);
  }
  return names;
}

export function getHeader(file: MemoryFile): string {
  const header = file.sections.get("@header") ?? [];
  const map = (file.sections.get("@map") ?? []).slice(-5);
  const prefs = (file.sections.get("@preferences") ?? []).slice(-3);
  const issues = (file.sections.get("@issues") ?? []).slice(-3);
  const pinned = getPinnedSections(file);

  const out: string[] = ["## @header"];
  for (const l of header) out.push(l);
  if (map.length) {
    out.push("file-map:");
    for (const m of map) out.push("  " + m.replace(/^-\s*/, "- "));
  }
  if (prefs.length) {
    out.push("top-prefs:");
    for (const p of prefs) out.push("  " + p.replace(/^-\s*/, "- "));
  }
  if (issues.length) {
    out.push("top-issues:");
    for (const i of issues) out.push("  " + i.replace(/^-\s*/, "- "));
  }

  for (const pin of pinned) {
    const lines = file.sections.get(pin);
    if (!lines || lines.length === 0) continue;
    out.push("");
    out.push(`## ${pin} (pinned)`);
    for (const l of lines) out.push(l);
  }

  return out.join("\n");
}

export function pinSection(file: MemoryFile, sectionName: string): boolean {
  const name = sectionName.startsWith("@") ? sectionName : `@${sectionName}`;
  if (!file.sections.has(name)) return false;
  if (!file.sections.has("@pinned")) file.sections.set("@pinned", []);
  const pinned = file.sections.get("@pinned")!;
  const entry = `- ${name}`;
  if (pinned.includes(entry)) return false;
  pinned.push(entry);
  return true;
}

export function unpinSection(file: MemoryFile, sectionName: string): boolean {
  const name = sectionName.startsWith("@") ? sectionName : `@${sectionName}`;
  const pinned = file.sections.get("@pinned") ?? [];
  const before = pinned.length;
  const after = pinned.filter((l) => !l.includes(name));
  file.sections.set("@pinned", after);
  return before !== after.length;
}

export function searchEntries(file: MemoryFile, query: string, maxResults = 10): string[] {
  const q = query.toLowerCase();
  const matches: string[] = [];
  for (const [section, lines] of file.sections.entries()) {
    for (const l of lines) {
      if (l.toLowerCase().includes(q)) {
        matches.push(`${section}: ${l}`);
        if (matches.length >= maxResults) return matches;
      }
    }
  }
  return matches;
}

export function compact(file: MemoryFile, staleDays = 90): { archived: string[]; kept: MemoryFile } {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleDays);
  const archived: string[] = [];

  for (const [section, lines] of file.sections.entries()) {
    if (section === "@header" || section === "@env") continue;
    const kept: string[] = [];
    for (const l of lines) {
      const m = l.match(/\[(\d{4}-\d{2}-\d{2})\]/);
      if (m) {
        const date = new Date(m[1]);
        if (date < cutoff) {
          archived.push(`${section}: ${l}`);
          continue;
        }
      }
      kept.push(l);
    }
    file.sections.set(section, kept);
  }

  return { archived, kept: file };
}

export const INSTRUCTION_FOOTER = `\n---\n[Save prefs/decisions/issues via memory_save. Cache file paths via memory_save category=map. Be concise.]`;
