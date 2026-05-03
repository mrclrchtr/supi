## Context

SuPi already has shared registries in `supi-core` for settings and context providers. Extensions such as `supi-rtk` currently expose only aggregate counters through `/supi-context`, which is useful for noticing problems but insufficient for diagnosing individual failures. The first concrete gap is RTK fallback debugging: the user can see fallback counts but cannot inspect which commands fell back or why.

The debug facility must work across independently loaded SuPi extensions, survive jiti module resolution boundaries, respect session boundaries, and avoid automatically leaking raw commands or other sensitive data into the model context. Pi supports both user-facing commands and agent-callable tools, so the design can provide both a TUI/user command and a controlled tool for collaborative debugging with the agent.

## Goals / Non-Goals

**Goals:**

- Provide one shared debug event registry that any SuPi extension can use.
- Allow users to enable/disable debugging through `/supi-settings`.
- Allow the agent to fetch debug events through a dedicated tool when settings permit it.
- Expose sanitized debug data by default and require explicit opt-in before raw event data is returned to the agent.
- Keep debug data session-local and memory-only.
- Integrate RTK fallback diagnostics as the first producer.
- Surface a lightweight debug summary through `/supi-context` without dumping raw events into context.

**Non-Goals:**

- Persist debug logs to disk.
- Replace existing extension-specific status commands such as `/lsp-status`.
- Provide a full observability pipeline, tracing backend, or metrics store.
- Automatically inject detailed debug events into every agent turn.
- Guarantee perfect secret redaction for arbitrary shell commands or payloads.

## Decisions

### Shared registry lives in `supi-core`

Add a `debug-registry.ts` module to `supi-core` using the same `globalThis` + `Symbol.for` pattern as the settings and context-provider registries. This keeps producers lightweight and avoids requiring each extension to depend on `supi-debug` directly.

Alternatives considered:
- **Per-extension debug commands:** simpler for RTK but duplicates settings, privacy controls, and agent access in every extension.
- **Debug registry inside `supi-debug`:** centralizes implementation but creates awkward producer dependencies and load-order coupling.

### `supi-debug` owns configuration and user/agent surfaces

Create `packages/supi-debug` as the user-facing extension. It registers settings, configures the core debug registry from merged SuPi config, registers a context provider summary, registers `/supi-debug`, and registers the `supi_debug` tool.

The core registry provides storage and query primitives; the extension provides policy and Pi integration. This mirrors existing SuPi separation between shared infrastructure and installable extension behavior.

### Session-local in-memory ring buffer

Debug events are stored in memory only and reset on `session_start`. The registry retains at most `maxEvents` events, dropping the oldest events first.

Alternatives considered:
- **Session file entries:** durable but risks persisting secrets and increasing session size.
- **Plain console logging:** easy but inaccessible to the user/agent inside Pi.

### Sanitized-by-default exposure with explicit raw access

Each event stores normalized metadata plus sanitized `data` and optional `rawData`. Query APIs default to sanitized output. The `supi_debug` tool returns raw data only when both the tool call requests it and the debug config allows raw agent access.

Redaction is best-effort and should mask common secret-bearing keys and command fragments such as tokens, passwords, API keys, authorization headers, and environment assignments. Extensions may also provide already-sanitized fields when they know domain-specific risks.

### Context provider reports only summaries

`supi-debug` registers a context provider that returns aggregate counts, such as total events and counts by severity/source. Detailed event lists stay behind `/supi-debug` and the `supi_debug` tool so raw or noisy diagnostics are not automatically injected into `/supi-context` reports.

### RTK records reasons, not just counts

RTK should keep its existing rewrite/fallback stats, but additionally emit debug events for rewrite failures and other relevant outcomes. The rewrite helper should return a structured result that distinguishes success, non-zero exit with usable stdout, timeout, empty output, missing binary, and other errors. RTK can then record a precise fallback reason and timing.

## Risks / Trade-offs

- **Sensitive data exposure** → Keep data memory-only, sanitize by default, gate raw agent access behind settings and explicit tool parameters.
- **Redaction misses secrets** → Document redaction as best-effort and encourage extension producers to avoid putting secrets in raw data unless needed.
- **Registry load-order issues** → Put producer APIs in `supi-core` and make registry configuration global and mutable so `supi-debug` can configure policy whenever it loads or sessions reset.
- **Too much debug noise** → Use a bounded ring buffer, source/category filters, limits on tool results, and summary-only context-provider output.
- **Debug disabled surprises** → `/supi-debug` and `supi_debug` should clearly report when debugging is disabled and how to enable it in `/supi-settings`.

## Migration Plan

1. Add the core debug registry and tests without changing extension behavior.
2. Add the `supi-debug` package, settings, command, tool, context-provider summary, and meta-package wiring.
3. Integrate RTK as the first producer and update tests for rewrite result details.
4. Run package-scoped typecheck/tests, then broader verification.
5. Rollback is low-risk: remove the new package wiring and RTK debug calls; existing RTK rewrite/fallback behavior remains unchanged.

## Open Questions

None for the initial implementation. Future work may add richer TUI filtering, export-to-file, or debug producers for LSP/code-intelligence after the RTK path proves useful.
