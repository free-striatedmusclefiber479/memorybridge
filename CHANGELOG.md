# Changelog

All notable changes to MemoryBridge are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] — 2026-05-28

Initial public release.

### Added

**Core MCP server**
- 3 MCP tools: `memory_load`, `memory_save`, `memory_search` (152-token total surface)
- Project-local `.ai-memory.md` file with section-indexed format (`@header`, `@preferences`, `@decisions`, `@issues`, `@resolved`, `@env`, `@map`, `@symbols`, `@notes`, `@pinned`)
- Global cross-project memory at `~/.memorybridge/global.md`
- Project-root detection (walks up to `.git`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc.)
- Atomic file writes (temp + rename) — no data loss on concurrent writes
- Token-budget enforcement: default `memory_load` ≤ 400 tokens, hard cap 1500

**Token-saving mechanisms**
- Tiered loading — header-first, sections on demand
- Write-time compression — drops filler, 120-char per-entry cap
- Auto-archive of stale entries (>90 days, file >200 lines)
- Deduplication on save via Jaccard similarity
- Recall-aware dedup — rejects saves that overlap with recently-loaded content
- Compressed instruction footer (~12 tokens)
- 5-level response-style toggle (`bigger`/`smaller`/`1-5`) — controls AI output length, biggest $-saver
- Custom style directives (`style add "<directive>"`)

**Cross-tool integration**
- Auto-detection of 9 AI tools: Claude Code, Cursor, Google Antigravity, Windsurf, Gemini CLI, Continue.dev, VS Code Copilot, Claude Desktop, OpenCode
- One-command `init` that patches MCP configs across all detected tools
- `uninstall` command for clean rollback (preserves your data, or `--purge` to delete)

**AGENTS.md ecosystem**
- `emit` command generates 7 formats from one `.ai-memory.md`: AGENTS.md, CLAUDE.md, .cursorrules, .windsurfrules, GEMINI.md, .continuerules, .github/copilot-instructions.md
- SHA-1 hash-tracked banners — refuses to overwrite hand-written files
- `--dry-run` flag for preview without writing
- `--force` flag for explicit overrides

**Memory operations**
- `add`, `list`, `search`, `load`, `open`, `compact` core commands
- Snapshot history per save (`undo`, `log`, `diff`)
- Section pin/lock (`pin`, `unpin`, `pins`) — Letta-style core memory
- Sensitive content blocker (passwords, API keys, secrets, bearer tokens, PEM keys)

**Discovery & quality**
- `scan` — show all installed AI tools and projects with existing memory
- Cross-project global index (`index`, `projects`)
- Cross-project global search (`global-search`)
- Quality scorer (`quality`) — grades A–F, detects time-sensitive content, system-prompt echoes, filler, near-duplicates
- Symbol extractor (`symbols [save]`) — regex-based JS/TS/Python/Go export extraction, writes to `@symbols` section

**Observability**
- Usage logging to `~/.memorybridge/usage.jsonl`
- `stats` / `savings` — token + dollar savings dashboard (input + output)
- `compare [--sessions N]` — side-by-side before/after with cost math
- `settings` — single-page dashboard for everything tunable
- `doctor` — install health check

**Safety**
- [SAFETY.md](SAFETY.md) — exhaustive contract of every file we touch
- Sandbox HOME support for testing (`MEMORYBRIDGE_PATH` env var)
- XDG Base Directory support

### Known limitations

- Symbol extraction is regex-based (no tree-sitter); good for JS/TS/Py/Go top-level exports, weaker for complex codebases
- Sensitive-content blocker is English-only and regex-based
- Browser-based AI tools (Claude.ai, ChatGPT, Gemini web) require manual paste — no browser extension yet
- "Savings" calculations are estimates based on a 3,000-token per-session re-paste baseline; actual savings vary by usage

### Coming next

See [BUILD_PLAN.md](BUILD_PLAN.md) and [WHY_AND_HOW.md](WHY_AND_HOW.md) for the roadmap.
