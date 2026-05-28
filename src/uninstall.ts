import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { globalDir } from "./paths.js";

const HOME = os.homedir();

export interface UninstallReport {
  removedFromConfigs: { tool: string; configFile: string; action: string }[];
  globalDirPath: string;
  globalDirRemoved: boolean;
  notes: string[];
}

function readJsonSafe(p: string): any {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(p: string, data: any): void {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function unpatchMcpConfig(configPath: string, tool: string): { action: string } {
  if (!fs.existsSync(configPath)) return { action: "no-config-found" };
  const cfg = readJsonSafe(configPath);
  if (!cfg || !cfg.mcpServers || !cfg.mcpServers.memorybridge) {
    return { action: "not-installed-in-this-config" };
  }
  delete cfg.mcpServers.memorybridge;

  // If mcpServers is now empty AND this is a Cursor-style file that we created
  // (i.e. only has mcpServers key), remove the whole file to keep things tidy.
  if (Object.keys(cfg.mcpServers).length === 0 && Object.keys(cfg).length === 1) {
    fs.unlinkSync(configPath);
    return { action: "removed-empty-config-file" };
  }

  // Otherwise: just remove our entry, keep the rest.
  if (Object.keys(cfg.mcpServers).length === 0) {
    delete cfg.mcpServers;
  }
  writeJson(configPath, cfg);
  return { action: "removed-entry" };
}

function rmrf(dir: string): boolean {
  try {
    if (!fs.existsSync(dir)) return false;
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export function uninstall(opts: { purge?: boolean } = {}): UninstallReport {
  const report: UninstallReport = {
    removedFromConfigs: [],
    globalDirPath: globalDir(),
    globalDirRemoved: false,
    notes: [],
  };

  // Claude Code candidates
  const claudeCandidates = [path.join(HOME, ".claude.json"), path.join(HOME, ".claude", "settings.json")];
  for (const c of claudeCandidates) {
    if (!fs.existsSync(c)) continue;
    const r = unpatchMcpConfig(c, "Claude Code");
    report.removedFromConfigs.push({ tool: "Claude Code", configFile: c, action: r.action });
  }

  // Cursor
  const cursor = path.join(HOME, ".cursor", "mcp.json");
  if (fs.existsSync(cursor)) {
    const r = unpatchMcpConfig(cursor, "Cursor");
    report.removedFromConfigs.push({ tool: "Cursor", configFile: cursor, action: r.action });
  }

  if (opts.purge) {
    report.globalDirRemoved = rmrf(report.globalDirPath);
  } else {
    report.notes.push(`Global memory dir was kept at ${report.globalDirPath}. Use \`memorybridge uninstall --purge\` to delete it as well.`);
  }

  report.notes.push("Project-local .ai-memory.md files were NOT touched — they live in your projects and are your data.");
  report.notes.push("Emitted files (AGENTS.md, CLAUDE.md, .cursorrules, etc.) were NOT touched — delete them manually if you no longer want them.");

  return report;
}

export function formatUninstallReport(r: UninstallReport): string {
  const out: string[] = [];
  out.push("");
  out.push("=== MemoryBridge Uninstall ===");
  out.push("");
  if (r.removedFromConfigs.length === 0) {
    out.push("  (no AI tool configs found to clean up)");
  } else {
    out.push("  Removed memorybridge entry from these MCP configs:");
    for (const c of r.removedFromConfigs) {
      out.push(`    [${c.action === "not-installed-in-this-config" || c.action === "no-config-found" ? "-" : "✓"}] ${c.tool.padEnd(14)} ${c.action.padEnd(28)} ${c.configFile}`);
    }
  }
  out.push("");
  if (r.globalDirRemoved) {
    out.push(`  ✓ Global memory directory removed: ${r.globalDirPath}`);
  } else {
    out.push(`  Global memory directory kept: ${r.globalDirPath}`);
  }
  out.push("");
  for (const note of r.notes) out.push(`  • ${note}`);
  out.push("");
  out.push("  Restart your AI tool(s) so they stop trying to load the (now-removed) MCP server.");
  out.push("");
  return out.join("\n");
}
