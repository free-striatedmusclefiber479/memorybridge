import fs from "node:fs";
import path from "node:path";
import { globalDir } from "./paths.js";
import { scan } from "./scan.js";

export const INDEX_FILE = path.join(globalDir(), "index.json");

export interface IndexedProject {
  name: string;
  path: string;
  memoryFile: string;
  lastSeen: string;
  entries: number;
  bytes: number;
}

export interface ProjectIndex {
  updated: string;
  projects: IndexedProject[];
}

function ensureGlobalDir(): void {
  const dir = globalDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readIndex(): ProjectIndex {
  if (!fs.existsSync(INDEX_FILE)) {
    return { updated: new Date().toISOString(), projects: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  } catch {
    return { updated: new Date().toISOString(), projects: [] };
  }
}

function writeIndex(index: ProjectIndex): void {
  ensureGlobalDir();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + "\n", "utf8");
}

function describeMemoryFile(memoryFile: string): { entries: number; bytes: number } {
  try {
    const text = fs.readFileSync(memoryFile, "utf8");
    const entries = text.split("\n").filter((l) => l.match(/^-\s*\[\d{4}-\d{2}-\d{2}\]/)).length;
    return { entries, bytes: Buffer.byteLength(text, "utf8") };
  } catch {
    return { entries: 0, bytes: 0 };
  }
}

export function rebuildIndex(opts: { extraRoots?: string[] } = {}): ProjectIndex {
  const result = scan({ extraRoots: opts.extraRoots });
  const projects: IndexedProject[] = [];
  const now = new Date().toISOString();

  for (const p of result.projects) {
    const aiMem = p.memoryFiles.find((f) => f.file === ".ai-memory.md");
    if (!aiMem) continue;
    const desc = describeMemoryFile(aiMem.absPath);
    projects.push({
      name: p.name,
      path: p.pathOnDisk,
      memoryFile: aiMem.absPath,
      lastSeen: now,
      entries: desc.entries,
      bytes: desc.bytes,
    });
  }

  projects.sort((a, b) => a.name.localeCompare(b.name));
  const index: ProjectIndex = { updated: now, projects };
  writeIndex(index);
  return index;
}

export function listProjects(): IndexedProject[] {
  const index = readIndex();
  return index.projects;
}

export interface GlobalSearchHit {
  project: string;
  path: string;
  memoryFile: string;
  line: string;
}

export function globalSearch(query: string, max = 20): GlobalSearchHit[] {
  const index = readIndex();
  const q = query.toLowerCase();
  const hits: GlobalSearchHit[] = [];

  for (const p of index.projects) {
    if (!fs.existsSync(p.memoryFile)) continue;
    try {
      const text = fs.readFileSync(p.memoryFile, "utf8");
      for (const line of text.split("\n")) {
        if (line.toLowerCase().includes(q)) {
          hits.push({ project: p.name, path: p.path, memoryFile: p.memoryFile, line: line.trim() });
          if (hits.length >= max) return hits;
        }
      }
    } catch {}
  }
  return hits;
}

export function formatProjectsList(projects: IndexedProject[]): string {
  const out: string[] = [];
  out.push("");
  out.push("=== Indexed Projects ===");
  out.push("");
  if (projects.length === 0) {
    out.push("  (no indexed projects yet)");
    out.push("");
    out.push("  Run `memorybridge index` to scan your filesystem and build the index.");
    out.push("");
    return out.join("\n");
  }
  const nameWidth = Math.max(8, ...projects.map((p) => p.name.length));
  for (const p of projects) {
    out.push(`  ${p.name.padEnd(nameWidth)}  ${p.entries.toString().padStart(4)} entries  ${p.bytes.toString().padStart(6)} bytes  ${p.path}`);
  }
  out.push("");
  out.push(`  Total: ${projects.length} project(s)`);
  out.push("");
  return out.join("\n");
}

export function formatGlobalSearch(query: string, hits: GlobalSearchHit[]): string {
  const out: string[] = [];
  out.push("");
  out.push(`=== Global search for "${query}" ===`);
  out.push("");
  if (hits.length === 0) {
    out.push(`  No matches across indexed projects.`);
    out.push("");
    out.push("  If you haven't built the index yet: memorybridge index");
    out.push("");
    return out.join("\n");
  }
  const byProject = new Map<string, GlobalSearchHit[]>();
  for (const h of hits) {
    if (!byProject.has(h.project)) byProject.set(h.project, []);
    byProject.get(h.project)!.push(h);
  }
  for (const [project, projectHits] of byProject.entries()) {
    out.push(`  ● ${project}  (${projectHits[0].path})`);
    for (const h of projectHits) {
      out.push(`      ${h.line}`);
    }
    out.push("");
  }
  out.push(`  ${hits.length} match(es) across ${byProject.size} project(s)`);
  out.push("");
  return out.join("\n");
}
