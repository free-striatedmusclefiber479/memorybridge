# Security Policy

## Supported versions

Only the latest released version of MemoryBridge is supported with security fixes.

| Version | Supported |
|---|---|
| 0.1.x | ✅ |
| < 0.1.0 | ❌ |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities. Instead, use one of:

- **GitHub Security Advisories** (preferred): [Open a private advisory](https://github.com/IamRamgarhia/memorybridge/security/advisories/new)
- Email the maintainer (see commit history for the address)

You should receive an acknowledgement within 7 days. We will work with you on a coordinated disclosure timeline.

## What counts as a security issue in MemoryBridge

MemoryBridge is local-first and has a small attack surface, but here are real concerns:

| Issue type | Severity |
|---|---|
| `memory_save` writing to files outside the SAFETY.md contract | **High** |
| Sensitive-content blocker bypass (passwords / API keys saved despite the regex blocker) | **High** |
| Path traversal via crafted project paths or section names | **High** |
| MCP config patching corrupting a user's `.claude.json` / `.cursor/mcp.json` | **High** |
| Emit overwriting hand-written files without banner+hash protection | **High** |
| Memory undo losing data | **Medium** |
| Quality scorer or symbol extractor causing crashes on adversarial inputs | **Low–Medium** |
| Unbounded resource consumption (memory exhaustion via huge `.ai-memory.md`) | **Low** |

## What is NOT a security issue here

- MemoryBridge does not run code from the memory file. There is no script execution path. So content of `.ai-memory.md` cannot be a code-injection vector against MemoryBridge itself.
- MemoryBridge has no network code. There are no requests to send, no API keys to leak, no servers to compromise.
- The AI tools (Claude Code, Cursor, etc.) that consume the memory file have their own security model — issues with how those tools handle MCP server output should be reported to those projects, not here.

## Bug bounty

There is currently no monetary bounty. Acknowledgement in the changelog is provided for verified reports.
