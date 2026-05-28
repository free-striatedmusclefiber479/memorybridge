import fs from "node:fs";
import path from "node:path";
import { historyDir, snapshotFile } from "./paths.js";

export interface Snapshot {
  ts: string;
  projectRoot: string;
  filePath: string;
  content: string;
}

function ensureDir(): void {
  const dir = historyDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function recordSnapshot(filePath: string, content: string): void {
  try {
    ensureDir();
    const projectRoot = path.dirname(filePath);
    const snap: Snapshot = {
      ts: new Date().toISOString(),
      projectRoot,
      filePath,
      content,
    };
    fs.appendFileSync(snapshotFile(projectRoot), JSON.stringify(snap) + "\n", "utf8");
  } catch {}
}

export function readSnapshots(projectRoot: string): Snapshot[] {
  const f = snapshotFile(projectRoot);
  if (!fs.existsSync(f)) return [];
  const text = fs.readFileSync(f, "utf8");
  const out: Snapshot[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {}
  }
  return out;
}

export function undoLast(projectRoot: string): { restored: boolean; ts?: string; filePath?: string } {
  const snaps = readSnapshots(projectRoot);
  if (snaps.length < 2) return { restored: false };

  const previous = snaps[snaps.length - 2];
  fs.writeFileSync(previous.filePath, previous.content, "utf8");
  // Trim the most recent snapshot off so undo doesn't loop on the same state.
  const trimmed = snaps.slice(0, -1).map((s) => JSON.stringify(s)).join("\n") + "\n";
  fs.writeFileSync(snapshotFile(projectRoot), trimmed, "utf8");
  return { restored: true, ts: previous.ts, filePath: previous.filePath };
}

export function diffSnapshot(projectRoot: string, n: number): { current: string; previous: string; ts?: string } | null {
  const snaps = readSnapshots(projectRoot);
  if (snaps.length === 0) return null;
  const idx = snaps.length - 1 - n;
  if (idx < 0) return null;
  const current = snaps[snaps.length - 1];
  const previous = snaps[idx];
  return { current: current.content, previous: previous.content, ts: previous.ts };
}

export function formatLog(projectRoot: string, limit = 20): string {
  const snaps = readSnapshots(projectRoot);
  if (snaps.length === 0) return "(no history yet)";
  const recent = snaps.slice(-limit).reverse();
  const out: string[] = [];
  for (let i = 0; i < recent.length; i++) {
    const s = recent[i];
    const lines = s.content.split("\n").length;
    const bytes = Buffer.byteLength(s.content, "utf8");
    out.push(`  ${i.toString().padStart(3)}  ${s.ts}  ${lines.toString().padStart(4)} lines  ${bytes.toString().padStart(6)} bytes`);
  }
  return out.join("\n");
}

export function formatDiff(current: string, previous: string): string {
  const a = previous.split("\n");
  const b = current.split("\n");
  const out: string[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const la = a[i] ?? "";
    const lb = b[i] ?? "";
    if (la === lb) continue;
    if (la && !b.includes(la)) out.push(`- ${la}`);
    if (lb && !a.includes(lb)) out.push(`+ ${lb}`);
  }
  return out.length === 0 ? "(no differences)" : out.join("\n");
}
