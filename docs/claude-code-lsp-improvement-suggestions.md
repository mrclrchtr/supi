# Claude Code LSP improvement suggestions

## Purpose

This note records ideas for improving `@mrclrchtr/supi-lsp` after a review of the public Claude Code LSP documentation, official Claude Code plugin definitions, and the current SuPi implementation.

No native Claude Code LSP client source is public. The public sources describe the configuration and user-facing behavior. The LSP protocol details come from the official LSP specification.

## Claude Code source locations

### Public Claude Code repository

- Repository: <https://github.com/anthropics/claude-code>
- Example plugins: <https://github.com/anthropics/claude-code/tree/main/plugins>
- Plugin documentation in the repository: `plugins/README.md`

The repository does not contain the native Claude Code LSP client implementation. Claude Code's core client is distributed as a product, not as an open-source TypeScript implementation.

### Official LSP plugin definitions

- Repository: <https://github.com/anthropics/claude-plugins-official>
- Marketplace manifest: <https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json>
- Plugin directories: <https://github.com/anthropics/claude-plugins-official/tree/main/plugins>

The marketplace manifest contains the concrete `lspServers` definitions. Current official entries include:

- `clangd-lsp`
- `csharp-lsp`
- `gopls-lsp`
- `jdtls-lsp`
- `kotlin-lsp`
- `lua-lsp`
- `php-lsp`
- `pyright-lsp`
- `ruby-lsp`
- `rust-analyzer-lsp`
- `swift-lsp`
- `typescript-lsp`

Example configuration lookup with GitHub CLI:

```bash
gh api repos/anthropics/claude-plugins-official/contents/.claude-plugin/marketplace.json \
  --jq '.content' | base64 --decode
```

### Official documentation

- Code intelligence overview: <https://code.claude.com/docs/en/discover-plugins#code-intelligence>
- Create LSP plugins: <https://code.claude.com/docs/en/plugins#add-lsp-servers-to-your-plugin>
- LSP plugin reference: <https://code.claude.com/docs/en/plugins-reference#lsp-servers>
- LSP 3.18 specification: <https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/>

## Verified Claude Code patterns

Claude Code LSP configuration supports these fields:

- `command`
- `args`
- `extensionToLanguage`
- `transport`
- `env`
- `initializationOptions`
- `settings`
- `workspaceFolder`
- `startupTimeout`
- `shutdownTimeout`
- `restartOnCrash`
- `maxRestarts`
- `diagnostics`

The documentation also states that:

- a server needs a command and an extension-to-language map;
- the first registered server handles an extension when several servers claim it;
- invalid server definitions are skipped while other servers continue to start;
- missing binaries are not installed by the plugin;
- server protocol output must stay on stdout, and logs must go to stderr;
- message headers and bodies have explicit size limits.

## Current SuPi strengths

The following areas should remain part of the design:

- `WorkspaceLspRuntime` hides clients and `LspManager`.
- Read-only operations preserve `completed`, `partial`, and `unavailable` results.
- Push diagnostics use tentative and confirmed evidence.
- Pull diagnostics use static and dynamic capability detection.
- Readiness uses work-done progress and bounded waits.
- Recovery uses bounded restart rules and diagnostic evidence checks.
- Refactor planning is separate from edit application. Do not move file mutation into `supi-lsp`; the existing planning/applier split is intentional.

Relevant local documents:

- `packages/supi-lsp/CLAUDE.md`
- `docs/adr/0002-refactor-planner-applier-split.md`
- `docs/adr/0016-workspace-lsp-runtime-interface.md`
- `docs/adr/0020-lsp-diagnostic-recovery-and-debug-identity.md`
- `docs/adr/0021-push-diagnostic-republication-confirmation.md`

## Selected improvement: process-crash recovery

**Decision status:** selected for implementation in [GitHub issue #354](https://github.com/mrclrchtr/supi/issues/354); implementation has not started.

Select one focused runtime-reliability change. The current manager keeps a crashed client in the error state. A later file route removes that client, records a runtime error, and returns no client. Automatic diagnostic recovery cannot help because it selects only running push-only clients. Lifecycle reliability also has the strongest related evidence in the repository. The other suggestions have weak or no recorded demand.

Process-crash recovery is separate from diagnostic recovery and startup retry. It applies only when a server process exits or emits a process error after successful initialization. Initialize failures, readiness stalls, and protocol errors keep their current paths.

Required behavior:

- Trigger recovery on the next file-routed semantic or explicit diagnostic operation. Do not trigger it from workspace-wide operations or passive status reads.
- Let the triggering operation await the replacement and continue when startup succeeds.
- Allow one automatic attempt for each server-and-root route in one workspace runtime. Consume the attempt when replacement startup begins, whether startup succeeds or fails.
- Reset the attempt budget only when the workspace runtime reloads or restarts. Explicit diagnostic refresh cannot bypass the budget.
- Do not add `restartOnCrash`, `maxRestarts`, or another crash-policy setting for this change.
- Share one in-progress replacement between concurrent callers.
- If one caller is cancelled or reaches its deadline, stop that caller's wait. Let the shared replacement continue.
- Use the existing 30-second transport request bound for the replacement initialize request. Do not add a separate startup bound.
- After startup, reopen all previously tracked route documents from disk. Keep failed-document evidence for missing files and for files that cannot reopen.
- Keep the project-server status as `error` while the route is not running. Add a small optional reason enum with `process-crashed`, `process-crash-recovery-pending`, and `process-crash-recovery-exhausted`.
- Use `process-crashed` before the route consumes its attempt. Use `process-crash-recovery-pending` while replacement startup runs. Use `process-crash-recovery-exhausted` after replacement startup fails or after a later crash. Clear the reason after successful recovery.
- Record each attempt and result in bounded LSP debug telemetry. Preserve the existing identity rules.
- Preserve the existing diagnostic evidence and planner/applier rules.

Acceptance evidence:

- Unit tests cover the one-attempt budget, concurrent callers, caller cancellation, status-reason transitions, startup failure, a later crash, and tracked-document restoration.
- A real child-process integration test proves this sequence: a running server crashes, the next file-routed operation starts one replacement, and the same operation continues successfully.
- Tests prove that a crash without a later file-routed operation does not start a replacement.
- Package TypeScript tests and repository verification pass.

No ADR is required. The policy is easy to revise and does not meet the repository ADR threshold.

## Other improvement suggestions

**Status for all items in this section: maybe later.**

These items are not an approved roadmap. Reconsider an item only when there is a verified defect, a user report, or an explicit strategic decision. The priority numbers record technical grouping only. The selected process-crash recovery above does not approve the broader lifecycle-configuration work.

### Priority 1: richer server configuration

Add Claude-like configuration concepts to `ServerConfig`:

- `extensionToLanguage`
- `env`
- `settings`
- `startupTimeoutMs`
- `shutdownTimeoutMs`
- `restartOnCrash`
- `maxRestarts`
- `diagnostics`

Local areas:

- `packages/supi-lsp/src/config/server-config.ts`
- `packages/supi-lsp/src/config/config.ts`
- `packages/supi-lsp/src/client/client.ts`
- `packages/supi-lsp/src/manager/manager.ts`

Keep SuPi's `*Ms` naming style even though Claude's JSON uses names without `Ms`.

### Priority 1: per-server language IDs

`src/utils.ts` currently uses one global extension map. Allow each server to define its own mapping. Pass the mapping through `ClientDiagnostics` and the reopen and refresh paths.

This supports servers that require different IDs for TypeScript React, shell dialects, ERB, Go module files, and custom languages.

Local areas:

- `packages/supi-lsp/src/utils.ts`
- `packages/supi-lsp/src/client/client-diagnostics.ts`
- `packages/supi-lsp/src/client/client-diagnostic-refresh.ts`
- `packages/supi-lsp/src/client/client-document-sync.ts`

### Priority 1: extension-only custom servers

A custom server should not need a root marker. Claude's documented minimum is a command and an extension map. SuPi already has built-in servers with empty root-marker lists, but custom server validation should also allow this.

Local area:

- `packages/supi-lsp/src/config/config.ts`

### Priority 1: lifecycle limits and crash policy

Add a startup timeout. The current initial startup path can wait for `initialize` without a server-specific bound. Also make shutdown timeout configurable.

Add bounded crash restart settings. Preserve these SuPi rules:

- no unlimited restart loop;
- no restart from unconfirmed diagnostic evidence alone;
- preserve failed-document evidence;
- record restart outcomes in debug telemetry.

Local areas:

- `packages/supi-lsp/src/client/client.ts`
- `packages/supi-lsp/src/manager/manager.ts`
- `packages/supi-lsp/src/session/runtime-controller.ts`

### Priority 2: workspace initialization and settings

The client currently advertises `workspaceFolders: false` but handles `workspace/workspaceFolders`. Make this consistent by sending one workspace folder during initialization and advertising the capability.

Implement configured responses for `workspace/configuration` and send `workspace/didChangeConfiguration` when settings exist.

This does not require full multi-root support. SuPi can continue to own one runtime per workspace root.

Local areas:

- `packages/supi-lsp/src/config/capabilities.ts`
- `packages/supi-lsp/src/client/client.ts`

### Priority 2: protocol hardening

Add explicit transport protections that match the documented Claude behavior:

- maximum header size;
- maximum message body size;
- clear errors for non-protocol stdout output;
- bounded stderr capture for diagnostics.

Also handle common server requests with safe default responses. For example, reject `workspace/applyEdit` unless the caller has an approved mutation path. Do not silently apply server edits from the LSP client.

Local area:

- `packages/supi-lsp/src/client/transport.ts`
- `packages/supi-lsp/src/client/client.ts`

### Priority 2: deterministic server routing

Claude uses the first registered server for an extension. SuPi routes by object order but can still start several servers that claim the same extension.

Add one of these policies:

1. explicit server priority;
2. deterministic configuration order with shadowed-server status;
3. a configuration error for extension collisions.

Do not hide a collision from users. Report which server owns the route.

Local areas:

- `packages/supi-lsp/src/config/config.ts`
- `packages/supi-lsp/src/session/scanner.ts`
- `packages/supi-lsp/src/manager/manager.ts`

### Priority 2: invalid configuration inventory

The current loader can reject an incomplete custom server without a visible reason. Keep invalid servers out of runtime startup, but retain a bounded invalid-configuration record for status and debug output.

This follows Claude's model of skipping invalid servers while showing the reason in its errors view.

Local areas:

- `packages/supi-lsp/src/config/config.ts`
- `packages/supi-lsp/src/session/runtime-controller.ts`
- `packages/supi-lsp/src/session/scanner.ts`

### Priority 3: rename validation

SuPi advertises `rename.prepareSupport` but does not call `textDocument/prepareRename` before rename. Add the request when the server supports it. Return an honest unavailable result when the position cannot be renamed.

Local areas:

- `packages/supi-lsp/src/client/client.ts`
- `packages/supi-lsp/src/provider/refactor-planning.ts`

### Priority 3: unsaved document symbol anchors

`mapDocumentSymbols()` reads file content from disk to recover a symbol name anchor. This can be wrong when an open document contains unsaved changes. Use the tracked open content, or use the server's selection range without disk reconstruction.

Local area:

- `packages/supi-lsp/src/provider/semantic-symbol-mapper.ts`

### Priority 3: position encoding support

SuPi advertises and accepts only UTF-16. Consider supporting UTF-8 and UTF-32 server selections. This requires conversion for outbound request positions and careful handling of returned ranges.

Local areas:

- `packages/supi-lsp/src/config/capabilities.ts`
- `packages/supi-lsp/src/client/client.ts`
- `packages/supi-lsp/src/coordinates.ts`

### Priority 3: more official language coverage

Consider adding built-in configurations for the languages present in the official Claude marketplace:

- C# with `csharp-ls`
- Lua with `lua-language-server`
- PHP with `intelephense`
- Swift with `sourcekit-lsp`

Also compare the supported extension lists for Ruby, C/C++, TypeScript, Kotlin, and Java before adding defaults.

Local area:

- `packages/supi-lsp/src/config/defaults.json`

### Priority 4: broader semantic operations

LSP can provide more than the current hover, definition, references, implementation, symbols, rename, and code-action requests. Candidate operations include:

- call hierarchy;
- type hierarchy;
- document highlights;
- folding ranges;
- formatting;
- document links.

These require changes in `supi-code-runtime` before they can become public code-intelligence operations. Add only operations with a clear model-facing use case.

Local areas:

- `packages/supi-lsp/src/client/client.ts`
- `packages/supi-lsp/src/session/workspace-lsp-runtime.ts`
- `packages/supi-code-runtime/src/capability/types.ts`
- `packages/supi-code-intelligence/`

## Configuration boundary

Claude uses `.lsp.json` inside a plugin. SuPi uses `lsp.servers` in:

- project: `.pi/supi/config.json`
- global: `~/.pi/agent/supi/config.json`

Do not read `.lsp.json` automatically. If compatibility is useful, add an explicit import or conversion command. Keep SuPi configuration ownership clear.

## Maybe-later dependency order

If evidence approves more work, use this dependency order. It is not an implementation commitment.

1. Per-server language IDs and extension-only custom servers.
2. Environment, settings, and startup/shutdown configuration.
3. Workspace initialization and standard server requests.
4. Deterministic routing and invalid-configuration reporting.
5. `prepareRename` and unsaved-buffer symbol anchors.
6. Protocol size limits and additional language definitions.
7. Further semantic operations and position encoding support.
