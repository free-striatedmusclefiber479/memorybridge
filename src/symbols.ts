import fs from "node:fs";
import path from "node:path";

export interface FileSymbols {
  file: string;
  language: string;
  symbols: string[];
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
};

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".turbo",
  "__pycache__", ".venv", "venv", "env", ".env",
  "vendor", "target", ".idea", ".vscode", "coverage",
]);

const TS_JS_PATTERNS: RegExp[] = [
  /^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
  /^export\s+(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/gm,
  /^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
  /^export\s+class\s+([A-Za-z_$][\w$]*)/gm,
  /^export\s+interface\s+([A-Za-z_$][\w$]*)/gm,
  /^export\s+type\s+([A-Za-z_$][\w$]*)/gm,
  /^export\s+enum\s+([A-Za-z_$][\w$]*)/gm,
  /^export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
  /^export\s+\{\s*([^}]+)\s*\}/gm,
  /^module\.exports\.([A-Za-z_$][\w$]*)\s*=/gm,
];

const PY_PATTERNS: RegExp[] = [
  /^def\s+([A-Za-z_][\w]*)/gm,
  /^class\s+([A-Za-z_][\w]*)/gm,
  /^async\s+def\s+([A-Za-z_][\w]*)/gm,
];

const GO_PATTERNS: RegExp[] = [
  /^func\s+(?:\([^)]*\)\s+)?([A-Z][\w]*)/gm,
  /^type\s+([A-Z][\w]*)\s+(?:struct|interface)/gm,
  /^var\s+([A-Z][\w]*)/gm,
  /^const\s+([A-Z][\w]*)/gm,
];

function patternsFor(language: string): RegExp[] {
  if (language === "typescript" || language === "javascript") return TS_JS_PATTERNS;
  if (language === "python") return PY_PATTERNS;
  if (language === "go") return GO_PATTERNS;
  return [];
}

function extractSymbols(content: string, language: string): string[] {
  const out = new Set<string>();
  for (const re of patternsFor(language)) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const raw = m[1];
      if (raw.includes(",")) {
        for (const piece of raw.split(",")) {
          const name = piece.trim().split(/\s+as\s+/i)[0].trim();
          if (name && /^[A-Za-z_$][\w$]*$/.test(name)) out.add(name);
        }
      } else if (/^[A-Za-z_$][\w$]*$/.test(raw)) {
        out.add(raw);
      }
    }
  }
  return Array.from(out).sort();
}

export function scanProjectSymbols(projectRoot: string, opts: { maxFiles?: number; maxSymbolsPerFile?: number } = {}): FileSymbols[] {
  const maxFiles = opts.maxFiles ?? 200;
  const maxPerFile = opts.maxSymbolsPerFile ?? 8;
  const out: FileSymbols[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > 5) return;
    if (out.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".")) continue;
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      const language = LANGUAGE_BY_EXT[ext];
      if (!language) continue;
      let content: string;
      try {
        content = fs.readFileSync(full, "utf8");
      } catch {
        continue;
      }
      if (content.length > 200_000) continue;
      const syms = extractSymbols(content, language).slice(0, maxPerFile);
      if (syms.length === 0) continue;
      out.push({
        file: path.relative(projectRoot, full).replace(/\\/g, "/"),
        language,
        symbols: syms,
      });
    }
  }

  walk(projectRoot, 0);
  return out;
}

export function formatSymbolsForMemory(symbols: FileSymbols[]): string[] {
  return symbols.map((s) => `- ${s.file} → ${s.symbols.join(", ")}`);
}

export function formatSymbolsReport(symbols: FileSymbols[]): string {
  const out: string[] = [];
  out.push("");
  out.push("=== Project Symbols Scan ===");
  out.push("");
  if (symbols.length === 0) {
    out.push("  (no exported symbols found in JS/TS/Py/Go files)");
    out.push("");
    return out.join("\n");
  }
  const byLang = new Map<string, FileSymbols[]>();
  for (const s of symbols) {
    if (!byLang.has(s.language)) byLang.set(s.language, []);
    byLang.get(s.language)!.push(s);
  }
  for (const [lang, list] of byLang.entries()) {
    out.push(`  ${lang}: ${list.length} file(s) with exports`);
  }
  out.push("");
  out.push(`  Total: ${symbols.length} files, ${symbols.reduce((a, b) => a + b.symbols.length, 0)} symbols`);
  out.push("");
  out.push("  Top files by symbol count:");
  const sorted = [...symbols].sort((a, b) => b.symbols.length - a.symbols.length).slice(0, 10);
  for (const s of sorted) {
    out.push(`    ${s.file.padEnd(40)}  ${s.symbols.length} symbols`);
  }
  out.push("");
  return out.join("\n");
}
