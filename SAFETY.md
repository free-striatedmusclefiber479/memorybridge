# MemoryBridge — Safety Contract

> **The promise:** MemoryBridge will not modify any file in your project that it did not create. We do not touch your source code. Ever.

This document is the exhaustive list of every file MemoryBridge can read, write, or modify. If you find a behavior not documented here, that's a bug — file an issue.

---

## Files we WRITE TO

### In your project folder (one per project)

| File | When written | What it contains | Safety |
|---|---|---|---|
| `.ai-memory.md` | When you or your AI calls `memory_save`, or `memorybridge add` | Plain Markdown with your project's preferences, decisions, issues, file map, etc. | Atomic write (temp file + rename). Snapshot recorded before every write so `memorybridge undo` works. |
| `.ai-memory.archive.md` | Only when `compact` runs (manual or auto) and finds stale entries | Old (>90 day) entries moved here. Never deleted, just out of context. | Append-only. Never overwrites. |

### Optional emitted files (only created when you run `memorybridge emit`)

These are **never** created automatically. They only exist if you explicitly ask for them.

| File | Tool it's for | Safety |
|---|---|---|
| `AGENTS.md` | OpenAI Codex / Aider / cross-tool standard | Has banner with content hash. Refuses overwrite if you edited the file. |
| `CLAUDE.md` | Claude Code | Same banner protection. |
| `.cursorrules` | Cursor | Same. |
| `.windsurfrules` | Windsurf | Same. |
| `GEMINI.md` | Gemini CLI | Same. |
| `.continuerules` | Continue.dev | Same. |
| `.github/copilot-instructions.md` | VS Code Copilot | Same. |

**Emit safety guarantees:**

1. If the target file does NOT exist → created with banner.
2. If the target file exists but **was not created by MemoryBridge** (no banner) → **refused**. Error: *"Move or delete it first, or pass `--force`."*
3. If the target file exists, banner is present, but **you edited it** (hash mismatch) → **refused**. Error: *"File has been edited since MemoryBridge last wrote it. Copy your edits into .ai-memory.md, delete the file, or pass `--force`."*
4. If the target file exists and matches what MemoryBridge would write → **no-op** (reported as `unchanged`).
5. `--dry-run` flag shows what *would* happen without writing anything.

### Inside our own folder (`~/.memorybridge/` or `$MEMORYBRIDGE_PATH` or `$XDG_DATA_HOME/memorybridge`)

| File | Purpose |
|---|---|
| `global.md` | Your cross-project preferences (created by `init`, edited by `add --global`) |
| `style.json` | Current response-style setting (1–5) |
| `usage.jsonl` | Per-call log (timestamps, tokens served). Powers `stats`. |
| `index.json` | Cross-project index (powers `projects` and `global-search`) |
| `history/<project-hash>.jsonl` | Snapshot history per project (powers `undo`, `log`, `diff`) |

These are entirely ours. They never sit inside your projects.

### Your AI-tool MCP configs

| File | Modified by | What we touch |
|---|---|---|
| `~/.claude.json` | `init` | Adds **only** `mcpServers.memorybridge`. Preserves every other key. |
| `~/.cursor/mcp.json` | `init` | Adds **only** `mcpServers.memorybridge`. Preserves every other entry. Created if it didn't exist. |

`uninstall` cleanly removes only the `memorybridge` entry (preserving any other MCP servers you've configured). If the file existed before init and we created it from scratch (Cursor case where the file didn't exist), `uninstall` deletes the file only if it has zero other content.

---

## Files we ONLY READ (never write)

| File | When read | Why |
|---|---|---|
| Your source code (`*.ts`, `*.js`, `*.py`, `*.go`, etc.) | Only when you run `memorybridge symbols` | Extract exported function/class/type names for the `@map` cache. No writing. No execution. |
| `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / etc. | When detecting project root | Only `existsSync` checks. We never read or modify their contents. |
| `.git/`, `.gitignore` | Never directly. We pass over them in directory walks for project-root detection. | n/a |

We also do read-only `Stat` checks during `scan` to find which AI tools you have installed (checking for `~/.claude/`, `~/.cursor/`, etc.).

---

## Files we NEVER touch

| Type | Examples |
|---|---|
| Source code | `*.ts`, `*.js`, `*.py`, `*.go`, `*.rs`, `*.java`, `*.cpp`, `*.html`, `*.css`, etc. |
| Build outputs | `dist/`, `build/`, `out/`, `.next/`, `target/` |
| Dependency directories | `node_modules/`, `.venv/`, `vendor/` |
| VCS internals | `.git/`, `.hg/`, `.svn/` |
| Package configs | `package.json`, `tsconfig.json`, `pyproject.toml`, etc. — except via `existsSync` for root detection |
| Lockfiles | `package-lock.json`, `yarn.lock`, `Cargo.lock`, etc. |
| Environment | `.env`, `.env.local`, etc. |

If MemoryBridge ever writes to one of these, that's a bug. File an issue immediately.

---

## What happens if you uninstall

```bash
memorybridge uninstall          # removes from MCP configs, keeps your data
memorybridge uninstall --purge  # also deletes ~/.memorybridge/ folder
```

After `uninstall`:
- `memorybridge` entry is gone from `~/.claude.json` and `~/.cursor/mcp.json` (other entries preserved)
- Your project's `.ai-memory.md` files are **untouched** — your data, your call whether to keep them
- Emitted `AGENTS.md` / `CLAUDE.md` / etc. files are **untouched** — delete manually if you don't want them
- With `--purge`: `~/.memorybridge/` (global memory, style config, usage log, snapshots, index) is fully deleted

After uninstall, restart your AI tools so they stop trying to spawn the MCP server.

---

## Sensitive content protection

When something is being saved, we **block** before writing if it matches any of:

- `password`, `api_key`, `secret`, `token`, `bearer` (case-insensitive, with `:` or `=`)
- Strings that look like 32+ char API tokens
- PEM-encoded private keys
- The blocker is regex-based and English-only. It is a safety net, not a guarantee. **Do not paste real secrets to your AI even with MemoryBridge installed.**

---

## Silent vs visible operations

Operations that print to stderr when they happen (so you can never be surprised):

- **Auto-compact** at >200 lines: `[memorybridge] auto-compact: archived N stale entries`
- **Sensitive content blocked**: returned in the response, not silent
- **Recall-aware dedup**: returns *"skipped: this content was already loaded into context this session"*

Operations that are silent because they're explicit user actions:

- `add`, `save` — you asked for it
- `emit` — you asked for it
- `init` / `uninstall` — you asked for it

---

## Reporting safety issues

If you find that MemoryBridge:
- Wrote to a file not listed above
- Lost data without recording a snapshot
- Modified your `.claude.json` / `.cursor/mcp.json` in ways other than adding/removing `mcpServers.memorybridge`
- Saved sensitive content despite the blocker

…it is a critical bug. File an issue with reproduction steps.

---

*Safety contract version 1.0 — 2026-05-28*
