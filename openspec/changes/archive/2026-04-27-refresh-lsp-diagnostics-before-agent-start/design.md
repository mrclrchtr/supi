## Context

`supi-lsp` stores diagnostics from LSP `textDocument/publishDiagnostics` notifications and injects a compact diagnostic summary in `before_agent_start`. The write/edit overrides already sync the edited file and wait for that file's diagnostics, but the pre-turn diagnostic context reads the cached store directly. LSP servers can publish dependent-file diagnostics asynchronously, and LSP 3.17 explicitly describes both push diagnostics and an optional pull diagnostic model for clients that need more control.

The implementation must keep pi responsive and resilient when language servers are unavailable or slow, while improving the trustworthiness of diagnostics that are injected into model context.

## Goals / Non-Goals

**Goals:**
- Refresh active LSP diagnostic state before `before_agent_start` builds diagnostic context.
- Prefer bounded blocking over stale context: wait for servers to publish fresh diagnostics or settle, up to a timeout.
- Prevent older diagnostic notifications from overwriting newer state when document versions are available.
- Add the internal type/model hooks needed for LSP 3.17 pull diagnostics without making pull support mandatory for all servers.
- Preserve existing behavior when no LSP server is running or a server is slow/unavailable.

**Non-Goals:**
- Guarantee complete whole-workspace diagnostics for every language server; push-only servers do not expose a universal global completion signal.
- Add new external dependencies.
- Change the public `lsp` tool schema unless needed for tests or status/debugging.
- Make pre-turn diagnostic refresh unbounded or capable of hanging the agent.

## Decisions

1. **Run a bounded pre-turn refresh before diagnostic context generation.**
   - Add a manager method such as `refreshOpenDiagnostics({ maxWaitMs, quietMs })`.
   - `before_agent_start` calls it after pruning missing files and before `getOutstandingDiagnosticSummary()` / `getOutstandingDiagnostics()`.
   - The method re-reads all open documents from disk, resyncs them with their active clients, and waits until diagnostics are quiet or the timeout expires.
   - Alternative considered: TTL-only cache invalidation. Rejected because it can hide valid diagnostics after a pause and does not actively improve freshness.

2. **Use a settle window for push diagnostics.**
   - For push-only servers, the client cannot know when all diagnostics are globally complete. A quiet window after the last diagnostic publication is the best generic approximation.
   - Suggested defaults: `maxWaitMs` around 3000ms and `quietMs` around 200ms, matching the existing single-file diagnostic wait budget while catching common cross-file updates.
   - Alternative considered: wait for every open file to publish once. Insufficient because cross-file diagnostics can arrive for files that were not just resynced, and some servers may not republish unchanged diagnostics.

3. **Store diagnostic metadata with each cache entry.**
   - Replace raw `Map<string, Diagnostic[]>` entries with metadata containing diagnostics, `receivedAt`, and optional `version` / result IDs.
   - `getAllDiagnostics()` can continue returning the current external shape, preserving manager call sites.
   - When `PublishDiagnosticsParams.version` exists and the client has a newer synced document version for that URI, ignore the older publication.
   - Alternative considered: only timestamp diagnostics. Rejected as incomplete because version ordering is a stronger signal than wall-clock freshness.

4. **Advertise version-aware diagnostics and prepare optional LSP 3.17 pull diagnostics.**
   - Add `publishDiagnostics.versionSupport: true` to client capabilities.
   - Add `textDocument.diagnostic` / `workspace.diagnostics` capabilities and type definitions only as needed to support servers advertising `diagnosticProvider`.
   - If pull diagnostics are implemented in this change, use them opportunistically for clients whose `serverCapabilities.diagnosticProvider` exists; otherwise fall back to push settle.
   - Alternative considered: implement only pull diagnostics. Rejected because many language servers remain push-only.

5. **Keep failures soft.**
   - Refresh errors, unreadable files, request failures, server cancellations, and timeouts must not prevent agent startup.
   - The diagnostic summary should reflect the freshest available cache after the bounded refresh attempt.

## Risks / Trade-offs

- **Added latency before each agent turn** → Bound the wait and use a quiet-window exit so fast servers add little overhead.
- **Push-only servers still cannot guarantee global freshness** → Document the limitation and improve the common case with resync + settle.
- **Some servers may omit diagnostic versions** → Fall back to received-order cache updates when no version is present.
- **Pull diagnostics can be long-running or unsupported** → Gate by `diagnosticProvider`, use timeouts, and keep push fallback.
- **More diagnostic metadata increases complexity** → Preserve existing manager-facing return shapes and isolate metadata inside `LspClient`.
