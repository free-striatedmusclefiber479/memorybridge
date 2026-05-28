import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ensureGlobalDir, GLOBAL_DIR, GLOBAL_FILE } from "./memory.js";
import { detectTools } from "./scan.js";

const HOME = os.homedir();

export interface InstallReport {
  globalDir: string;
  globalFile: string;
  patched: { tool: string; configFile: string; action: string }[];
  skipped: { tool: string; reason: string }[];
  serverEntry: { command: string; args: string[] };
}

function readJsonSafe(p: string): any {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(p: string, data: any): void {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function resolveServerCommand(): { command: string; args: string[] } {
  const cliPath = new URL(".", import.meta.url).pathname;
  const normalized = process.platform === "win32" ? cliPath.replace(/^\//, "").replace(/\//g, "\\") : cliPath;
  const serverScript = path.resolve(normalized, "server.js");
  return { command: "node", args: [serverScript] };
}

function patchMcpJson(configPath: string, server: { command: string; args: string[] }): string {
  const existing = readJsonSafe(configPath) ?? {};
  if (!existing.mcpServers) existing.mcpServers = {};
  const before = JSON.stringify(existing.mcpServers.memorybridge ?? null);
  existing.mcpServers.memorybridge = {
    command: server.command,
    args: server.args,
  };
  const after = JSON.stringify(existing.mcpServers.memorybridge);
  writeJson(configPath, existing);
  return before === after ? "unchanged" : before === "null" ? "added" : "updated";
}

export function installAll(): InstallReport {
  ensureGlobalDir();

  if (!fs.existsSync(GLOBAL_FILE)) {
    fs.writeFileSync(
      GLOBAL_FILE,
      `# .ai-memory.md | MemoryBridge | v1\n# Updated: ${new Date().toISOString().slice(0, 10)}\n# Global preferences live here — loaded into every AI session.\n\n## @header\nscope: global\n\n## @preferences\n`,
      "utf8"
    );
  }

  const server = resolveServerCommand();
  const tools = detectTools();
  const patched: InstallReport["patched"] = [];
  const skipped: InstallReport["skipped"] = [];

  const claudeCode = tools.find((t) => t.id === "claude-code");
  if (claudeCode?.detected) {
    const candidates = [path.join(HOME, ".claude.json"), path.join(HOME, ".claude", "settings.json")];
    let target = candidates.find((c) => fs.existsSync(c)) ?? path.join(HOME, ".claude.json");
    const action = patchMcpJson(target, server);
    patched.push({ tool: "Claude Code", configFile: target, action });
  } else {
    skipped.push({ tool: "Claude Code", reason: "not detected" });
  }

  const cursor = tools.find((t) => t.id === "cursor");
  if (cursor?.detected) {
    const target = path.join(HOME, ".cursor", "mcp.json");
    const action = patchMcpJson(target, server);
    patched.push({ tool: "Cursor", configFile: target, action });
  } else {
    skipped.push({ tool: "Cursor", reason: "not detected" });
  }

  return {
    globalDir: GLOBAL_DIR,
    globalFile: GLOBAL_FILE,
    patched,
    skipped,
    serverEntry: server,
  };
}

export function formatInstallReport(r: InstallReport): string {
  const out: string[] = [];
  out.push("");
  out.push("=== MemoryBridge Init ===");
  out.push("");
  out.push(`  Global memory dir:   ${r.globalDir}`);
  out.push(`  Global memory file:  ${r.globalFile}`);
  out.push("");
  out.push("  MCP server entry:");
  out.push(`    command: ${r.serverEntry.command}`);
  out.push(`    args:    ${r.serverEntry.args.join(" ")}`);
  out.push("");
  if (r.patched.length > 0) {
    out.push("  Configured:");
    for (const p of r.patched) {
      out.push(`    [✓] ${p.tool.padEnd(14)} ${p.action.padEnd(10)} ${p.configFile}`);
    }
  }
  if (r.skipped.length > 0) {
    out.push("");
    out.push("  Skipped:");
    for (const s of r.skipped) {
      out.push(`    [—] ${s.tool.padEnd(14)} ${s.reason}`);
    }
  }
  out.push("");
  out.push("  Next steps:");
  out.push("    1. Restart your AI tool(s) so they pick up the MCP config.");
  out.push("    2. cd into a project, then run: memorybridge add \"<your first memory>\"");
  out.push("    3. Run: memorybridge scan   to see all projects with existing memory.");
  out.push("");
  return out.join("\n");
}
