import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface AITool {
  id: string;
  name: string;
  detected: boolean;
  configPath?: string;
  notes?: string;
}

export interface DiscoveredProject {
  pathOnDisk: string;
  name: string;
  discoveredBy: string[];
  memoryFiles: { file: string; absPath: string; sizeBytes: number; preview: string }[];
}

export interface ScanResult {
  tools: AITool[];
  projects: DiscoveredProject[];
}

const HOME = os.homedir();
const APPDATA = process.env.APPDATA ?? path.join(HOME, "AppData", "Roaming");
const LOCALAPPDATA = process.env.LOCALAPPDATA ?? path.join(HOME, "AppData", "Local");

const MEMORY_FILE_NAMES = [
  "CLAUDE.md",
  "AGENTS.md",
  "GEMINI.md",
  ".cursorrules",
  ".cursor/rules",
  ".windsurfrules",
  ".continuerules",
  ".github/copilot-instructions.md",
  ".ai-memory.md",
  ".ai-memory.archive.md",
  "MEMORY.md",
];

const COMMON_PROJECT_ROOTS = [
  path.join(HOME, "projects"),
  path.join(HOME, "code"),
  path.join(HOME, "Code"),
  path.join(HOME, "Documents"),
  path.join(HOME, "Desktop"),
  path.join(HOME, "dev"),
  path.join(HOME, "src"),
  "d:\\calude",
  "d:\\projects",
  "c:\\projects",
];

function exists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function decodeClaudeProjectsPath(encoded: string): string | null {
  if (!encoded) return null;
  let p = encoded;
  if (/^[a-zA-Z]--/.test(p)) {
    const drive = p[0].toUpperCase();
    p = `${drive}:\\` + p.slice(3).replace(/-/g, "\\");
    return p;
  }
  if (p.startsWith("-")) {
    return "/" + p.slice(1).replace(/-/g, "/");
  }
  return p.replace(/-/g, "/");
}

export function detectTools(): AITool[] {
  const tools: AITool[] = [];

  const claudeHome = path.join(HOME, ".claude");
  const claudeJson = path.join(HOME, ".claude.json");
  tools.push({
    id: "claude-code",
    name: "Claude Code",
    detected: exists(claudeHome) || exists(claudeJson),
    configPath: exists(claudeJson) ? claudeJson : exists(claudeHome) ? claudeHome : undefined,
  });

  const cursorHome = path.join(HOME, ".cursor");
  const cursorAppData = path.join(APPDATA, "Cursor");
  tools.push({
    id: "cursor",
    name: "Cursor",
    detected: exists(cursorHome) || exists(cursorAppData),
    configPath: exists(path.join(cursorHome, "mcp.json"))
      ? path.join(cursorHome, "mcp.json")
      : exists(cursorHome)
      ? cursorHome
      : exists(cursorAppData)
      ? cursorAppData
      : undefined,
  });

  const antigravityCandidates = [
    path.join(HOME, ".antigravity"),
    path.join(APPDATA, "Antigravity"),
    path.join(LOCALAPPDATA, "Antigravity"),
    path.join(LOCALAPPDATA, "Google", "Antigravity"),
    path.join(APPDATA, "Google", "Antigravity"),
  ];
  const antigravityPath = antigravityCandidates.find(exists);
  tools.push({
    id: "antigravity",
    name: "Google Antigravity",
    detected: !!antigravityPath,
    configPath: antigravityPath,
  });

  const windsurfCandidates = [
    path.join(HOME, ".codeium", "windsurf"),
    path.join(APPDATA, "Windsurf"),
    path.join(LOCALAPPDATA, "Windsurf"),
  ];
  const windsurfPath = windsurfCandidates.find(exists);
  tools.push({
    id: "windsurf",
    name: "Windsurf",
    detected: !!windsurfPath,
    configPath: windsurfPath,
  });

  const geminiCandidates = [path.join(HOME, ".gemini"), path.join(APPDATA, "gemini-cli")];
  const geminiPath = geminiCandidates.find(exists);
  tools.push({
    id: "gemini-cli",
    name: "Gemini CLI",
    detected: !!geminiPath,
    configPath: geminiPath,
  });

  const continuePath = path.join(HOME, ".continue");
  tools.push({
    id: "continue",
    name: "Continue.dev",
    detected: exists(continuePath),
    configPath: exists(continuePath) ? continuePath : undefined,
  });

  const claudeDesktopCandidates = [
    path.join(APPDATA, "Claude"),
    path.join(HOME, "Library", "Application Support", "Claude"),
  ];
  const claudeDesktopPath = claudeDesktopCandidates.find(exists);
  tools.push({
    id: "claude-desktop",
    name: "Claude Desktop",
    detected: !!claudeDesktopPath,
    configPath: claudeDesktopPath,
  });

  const vscodeCandidates = [path.join(APPDATA, "Code", "User"), path.join(HOME, ".vscode")];
  const vscodePath = vscodeCandidates.find(exists);
  tools.push({
    id: "vscode",
    name: "VS Code (+ Copilot)",
    detected: !!vscodePath,
    configPath: vscodePath,
    notes: "Copilot/MCP detection requires per-workspace files",
  });

  const opencodePath = path.join(HOME, ".opencode");
  tools.push({
    id: "opencode",
    name: "OpenCode",
    detected: exists(opencodePath),
    configPath: exists(opencodePath) ? opencodePath : undefined,
  });

  return tools;
}

function discoverClaudeProjects(): { pathOnDisk: string; name: string }[] {
  const out: { pathOnDisk: string; name: string }[] = [];
  const projectsDir = path.join(HOME, ".claude", "projects");
  if (!exists(projectsDir)) return out;

  let entries: string[];
  try {
    entries = fs.readdirSync(projectsDir);
  } catch {
    return out;
  }

  for (const entry of entries) {
    const decoded = decodeClaudeProjectsPath(entry);
    if (!decoded) continue;
    if (exists(decoded)) {
      out.push({ pathOnDisk: decoded, name: path.basename(decoded) });
    }
  }
  return out;
}

function discoverProjectsInRoot(root: string, maxDepth = 2): string[] {
  if (!exists(root)) return [];
  const out: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (!item.isDirectory()) continue;
      if (item.name.startsWith(".") || item.name === "node_modules") continue;
      const full = path.join(dir, item.name);
      const hasMarker =
        exists(path.join(full, ".git")) ||
        exists(path.join(full, "package.json")) ||
        exists(path.join(full, "pyproject.toml")) ||
        exists(path.join(full, "Cargo.toml")) ||
        exists(path.join(full, "go.mod"));
      if (hasMarker) {
        out.push(full);
      } else {
        visit(full, depth + 1);
      }
    }
  };
  visit(root, 0);
  return out;
}

function findMemoryFiles(projectPath: string): DiscoveredProject["memoryFiles"] {
  const found: DiscoveredProject["memoryFiles"] = [];
  for (const name of MEMORY_FILE_NAMES) {
    const abs = path.join(projectPath, name);
    if (!exists(abs)) continue;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    let preview = "";
    try {
      const buf = fs.readFileSync(abs, "utf8");
      preview = buf.split(/\r?\n/).slice(0, 6).join("\n");
      if (buf.length > preview.length) preview += "\n…";
    } catch {
      preview = "(unreadable)";
    }
    found.push({ file: name, absPath: abs, sizeBytes: stat.size, preview });
  }
  return found;
}

export function scan(opts: { extraRoots?: string[] } = {}): ScanResult {
  const tools = detectTools();

  const projectMap = new Map<string, DiscoveredProject>();

  const addProject = (projectPath: string, discoveredBy: string) => {
    const norm = path.resolve(projectPath);
    if (!exists(norm)) return;
    const existing = projectMap.get(norm);
    if (existing) {
      if (!existing.discoveredBy.includes(discoveredBy)) existing.discoveredBy.push(discoveredBy);
      return;
    }
    const memoryFiles = findMemoryFiles(norm);
    if (memoryFiles.length === 0) return;
    projectMap.set(norm, {
      pathOnDisk: norm,
      name: path.basename(norm),
      discoveredBy: [discoveredBy],
      memoryFiles,
    });
  };

  for (const proj of discoverClaudeProjects()) {
    addProject(proj.pathOnDisk, "Claude Code history");
  }

  const roots = [...COMMON_PROJECT_ROOTS, ...(opts.extraRoots ?? [])];
  for (const root of roots) {
    for (const projectPath of discoverProjectsInRoot(root, 2)) {
      addProject(projectPath, `filesystem (${path.basename(root)})`);
    }
  }

  const projects = Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  return { tools, projects };
}

export function formatScanReport(result: ScanResult): string {
  const out: string[] = [];

  out.push("");
  out.push("=== AI Tools Detected ===");
  out.push("");
  const detected = result.tools.filter((t) => t.detected);
  const missing = result.tools.filter((t) => !t.detected);

  if (detected.length === 0) {
    out.push("  (no supported AI tools detected on this machine)");
  } else {
    const nameWidth = Math.max(...detected.map((t) => t.name.length));
    for (const t of detected) {
      out.push(`  [✓] ${t.name.padEnd(nameWidth)}   ${t.configPath ?? ""}`);
    }
  }
  if (missing.length > 0) {
    out.push("");
    out.push("  Not detected: " + missing.map((t) => t.name).join(", "));
  }

  out.push("");
  out.push("=== Projects With Existing AI Memory ===");
  out.push("");

  if (result.projects.length === 0) {
    out.push("  (no projects with memory files found)");
    out.push("");
    out.push("  Memory files searched for: CLAUDE.md, AGENTS.md, GEMINI.md, .cursorrules, ");
    out.push("  .windsurfrules, .continuerules, .github/copilot-instructions.md, .ai-memory.md");
  } else {
    for (const p of result.projects) {
      out.push(`  ● ${p.name}`);
      out.push(`    path:        ${p.pathOnDisk}`);
      out.push(`    discovered:  ${p.discoveredBy.join(", ")}`);
      out.push(`    memory files (${p.memoryFiles.length}):`);
      for (const mf of p.memoryFiles) {
        out.push(`      - ${mf.file}  (${mf.sizeBytes} bytes)`);
        const previewLines = mf.preview.split("\n");
        for (const pl of previewLines.slice(0, 3)) {
          out.push(`          ${pl}`);
        }
        if (previewLines.length > 3) out.push(`          …`);
      }
      out.push("");
    }
  }

  out.push("=== Summary ===");
  out.push(`  Tools detected: ${detected.length} / ${result.tools.length}`);
  out.push(`  Projects with memory: ${result.projects.length}`);
  const totalMemoryFiles = result.projects.reduce((acc, p) => acc + p.memoryFiles.length, 0);
  out.push(`  Total memory files: ${totalMemoryFiles}`);
  out.push("");
  out.push("  Tip: run `memorybridge init` in any project to standardize on .ai-memory.md");
  out.push("");

  return out.join("\n");
}
