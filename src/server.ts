#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadMemory, saveMemory, searchMemory } from "./memory.js";
import { Category } from "./format.js";
import { TOKEN_BUDGET } from "./budget.js";
import { logUsage } from "./stats.js";
import path from "node:path";

function clientTool(): string {
  return process.env.MCP_CLIENT_NAME ?? process.env.CLAUDE_CODE_SESSION_ID ? "claude-code" : "mcp-client";
}

function currentProject(): string | undefined {
  try {
    return path.basename(process.cwd());
  } catch {
    return undefined;
  }
}

const server = new Server(
  { name: "memorybridge", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "memory_load",
      description: "Load session memory. Header by default; pass section for more.",
      inputSchema: {
        type: "object",
        properties: {
          section: { type: "string" },
        },
      },
    },
    {
      name: "memory_save",
      description: "Save a durable preference, decision, or recurring issue.",
      inputSchema: {
        type: "object",
        required: ["content", "category"],
        properties: {
          content: { type: "string" },
          category: {
            type: "string",
            enum: ["preference", "decision", "issue", "resolved", "env", "note", "map"],
          },
          scope: { type: "string", enum: ["project", "global"] },
        },
      },
    },
    {
      name: "memory_search",
      description: "Search memory. Returns up to 10 matches.",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: { query: { type: "string" } },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    if (name === "memory_load") {
      const section = (args?.section as string | undefined)?.trim() || undefined;
      const res = loadMemory({ section, budget: section ? TOKEN_BUDGET.HARD_CAP : TOKEN_BUDGET.DEFAULT_LOAD });
      logUsage({ ts: new Date().toISOString(), tool: clientTool(), action: "load", tokens: res.tokens, project: currentProject() });
      if (!res.text) {
        return { content: [{ type: "text", text: "(no memory found for this project)" }] };
      }
      return { content: [{ type: "text", text: res.text }] };
    }

    if (name === "memory_save") {
      const content = String(args?.content ?? "").trim();
      const category = String(args?.category ?? "note") as Category;
      const scope = (args?.scope as "project" | "global" | undefined) ?? "project";
      if (!content) {
        return { content: [{ type: "text", text: "error: content is required" }], isError: true };
      }
      const res = saveMemory(content, category, { scope });
      if (!res.saved && res.reason === "blocked-sensitive-content") {
        return { content: [{ type: "text", text: "blocked: content looks sensitive (password/key/secret pattern). Not saved." }] };
      }
      if (!res.saved && res.reason === "duplicates-recently-loaded-memory") {
        return { content: [{ type: "text", text: "skipped: this content was already loaded into context this session. No need to re-save it." }] };
      }
      logUsage({ ts: new Date().toISOString(), tool: clientTool(), action: "save", tokens: 0, project: currentProject() });
      const verb = res.saved ? "saved" : "updated existing";
      return { content: [{ type: "text", text: `${verb} → ${res.file}\n${res.entry}` }] };
    }

    if (name === "memory_search") {
      const query = String(args?.query ?? "").trim();
      if (!query) {
        return { content: [{ type: "text", text: "error: query is required" }], isError: true };
      }
      const res = searchMemory(query, { max: 10 });
      logUsage({ ts: new Date().toISOString(), tool: clientTool(), action: "search", tokens: res.tokens, project: currentProject() });
      if (res.results.length === 0) {
        return { content: [{ type: "text", text: `no matches for "${query}"` }] };
      }
      const text = res.results.map((r) => `[${r.source}] ${r.line}`).join("\n");
      return { content: [{ type: "text", text }] };
    }

    return { content: [{ type: "text", text: `unknown tool: ${name}` }], isError: true };
  } catch (err: any) {
    return { content: [{ type: "text", text: `error: ${err?.message ?? String(err)}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`MemoryBridge server failed to start: ${err}\n`);
  process.exit(1);
});
