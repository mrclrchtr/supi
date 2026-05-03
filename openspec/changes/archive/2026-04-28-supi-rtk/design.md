## Context

SuPi extensions intercept pi tool events to enhance agent behavior. The existing `supi-bash-timeout` extension already demonstrates the `tool_call` mutation pattern. Three third-party pi-rtk extensions exist (mcowger, sherif-fanous, MasuRii), each taking a different approach. sherif-fanous's implementation using `createBashTool` + `spawnHook` is the cleanest and aligns with pi's officially documented pattern.

RTK's `rtk rewrite` subcommand is the single source of truth for which commands can be rewritten. It handles compound commands (`&&`, `||`), pipes (rewrites only the rewritable side), `cd` prefixes, idempotency, and unknown-command fallback — eliminating the need for a custom allowlist or shell parser.

## Goals / Non-Goals

**Goals:**
- Transparently rewrite bash commands through `rtk rewrite` for 60–90% token savings on shell output
- Hook both agent bash tool calls and user `!cmd` commands
- Track per-session rewrite count and estimated token savings
- Provide a shared supi-core context-provider registry for cross-extension data exposure
- Surface RTK savings in `/supi-context` without coupling the two packages
- Integrate with supi-core config system for settings

**Non-Goals:**
- No output compaction pipeline (source code filtering breaks `edit` tool matching)
- No custom allowlist or shell parser (delegate to `rtk rewrite`)
- No TypeScript-based compression fallback when rtk is missing
- No interception of `read`, `edit`, `write`, or other non-bash tools
- No `!!cmd` interception (context-excluded by user intent)

## Decisions

### 1. Use `createBashTool` + `spawnHook` instead of `tool_call` mutation

**Choice**: Register a replacement bash tool via `createBashTool(cwd, { spawnHook })`.

**Why over `tool_call` mutation**: The spawnHook runs inside the tool's own execution pipeline, inheriting timeout handling, output rendering, truncation, and details tracking for free. Mutating `event.input.command` in `tool_call` works but bypasses the tool's internal pipeline and is less idiomatic.

**Why over custom tool**: A fully custom bash tool would require reimplementing all bash tool behavior. `createBashTool` with `spawnHook` gets the rewrite with zero reimplementation.

**Reference**: pi docs `extensions.md` → "Remote Execution" section, `examples/extensions/bash-spawn-hook.ts`.

### 2. Delegate to `rtk rewrite` as single source of truth

**Choice**: Call `execFileSync("rtk", ["rewrite", command])` and use the output if exit code is 0.

**Why over custom allowlist**: `rtk rewrite` already handles compound commands, pipes, cd-prefixes, idempotency, and unsupported commands. Maintaining a parallel allowlist would drift and miss RTK updates. sherif-fanous's implementation proved this works cleanly.

**Why over `rtk rewrite --json`**: Plain text output is sufficient — the rewritten command string is all we need.

### 3. Hard-require rtk binary

**Choice**: Error on extension load if `rtk` is not found in PATH.

**Why over graceful degradation**: The user chose this explicitly. The extension's only purpose is RTK integration — if rtk is missing, there's nothing useful to do. A clear error is better than silent no-op.

### 4. Context-provider registry in supi-core

**Choice**: New `context-provider-registry.ts` using the same `globalThis` + `Symbol.for` pattern as `settings-registry.ts`.

**Why over direct import**: Avoids coupling supi-rtk → supi-context or vice versa. Any extension can register a provider; supi-context reads all providers. Works across jiti module resolution boundaries (same fix as the settings registry).

**Why in supi-core**: supi-core is the shared infrastructure package. Both supi-rtk and supi-context already depend on it.

### 5. No output compaction pipeline

**Choice**: Only rewrite commands, do not post-process tool results.

**Why**: MasuRii's pi-rtk-optimizer documented that source code filtering causes `edit` tool failures because the filtered text won't match the original file content. RTK's own output filtering (applied by the rtk binary during execution) is sufficient for v1.

## Risks / Trade-offs

- **[Risk: rtk rewrite latency]** → `execFileSync` with configurable timeout (default 5000ms). If timeout or failure, fall back to original command silently.
- **[Risk: rtk rewrite changes behavior]** → RTK is designed to produce semantically equivalent output. Verified: `rtk rewrite` is used by Claude Code, Gemini CLI, and other production tools.
- **[Risk: duplicate bash tool registration]** → pi handles duplicate tool names with numeric suffixes. Since we register a replacement bash tool, it overrides the built-in. If another extension also replaces bash, load order determines which wins.
- **[Trade-off: hard rtk requirement]** → Users without rtk get a clear error instead of degraded functionality. Acceptable for an opt-in extension.
