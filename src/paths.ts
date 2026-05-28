import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const HOME = os.homedir();
const XDG_DATA = process.env.XDG_DATA_HOME ?? path.join(HOME, ".local", "share");

export function globalDir(): string {
  const envOverride = process.env.MEMORYBRIDGE_PATH;
  if (envOverride && envOverride.trim()) return path.resolve(envOverride);
  if (process.env.XDG_DATA_HOME) return path.join(XDG_DATA, "memorybridge");
  return path.join(HOME, ".memorybridge");
}

export function globalFile(): string {
  return path.join(globalDir(), "global.md");
}

export function styleFile(): string {
  return path.join(globalDir(), "style.json");
}

export function usageLog(): string {
  return path.join(globalDir(), "usage.jsonl");
}

export function historyDir(): string {
  return path.join(globalDir(), "history");
}

export function projectHash(projectRoot: string): string {
  return crypto.createHash("sha1").update(path.resolve(projectRoot)).digest("hex").slice(0, 12);
}

export function snapshotFile(projectRoot: string): string {
  return path.join(historyDir(), `${projectHash(projectRoot)}.jsonl`);
}
