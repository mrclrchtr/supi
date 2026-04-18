## Context

The supi-lsp extension currently injects LSP guidance into agent conversations through five mechanisms:

1. **`promptSnippet` / `promptGuidelines`** — static tool description in system prompt (working well)
2. **`before_agent_start` user-role message** — hidden `customType: "lsp-guidance"` message injected per-prompt with activation hints, tracked-file context, and diagnostics summaries
3. **`context` event filter** — strips stale guidance messages, keeping only the current token
4. **Inline diagnostics on `tool_result`** — appended to `write`/`edit` output (working well)
5. **Bash nudge via `sendMessage`/steer** — TreeSitter-parsed bash commands trigger "consider lsp tool" messages

The core problem: pi's `convertToLlm()` maps all `CustomMessage` entries to `role: "user"`. The LLM cannot distinguish injected guidance from actual user instructions. This causes agents to treat "LSP ready for semantic navigation on foo.ts" as a task to perform, wasting turns and tokens.

The reactive tracking machinery (`runtimeActive`, `pendingActivation`, `trackedSourcePaths`, fingerprint dedup, `guidanceToken`/`guidanceCounter`) exists solely to decide _when_ to inject these problematic messages. Replacing the injection strategy makes this complexity unnecessary.

### Constraints

- **Prompt caching is the primary cost constraint.** The system prompt must be identical across all LLM calls within a session. Any per-prompt modification to `systemPrompt` risks invalidating provider prefix caching.
- `before_agent_start` can return `{ systemPrompt }` but this modifies `agent.state.systemPrompt` per-prompt. To guarantee caching, capabilities must be baked into `_baseSystemPrompt` via `promptGuidelines` at `session_start` and never modified thereafter.
- `before_agent_start` can return `{ message }` for per-prompt user-role messages. These don't affect system prompt caching but are always `role: "user"` to the LLM.
- `context` event fires before each LLM call and can reorder messages — this is the only way to prepend an extension message before the user's prompt (pi hardcodes extension messages after the user message).
- `pi.registerTool()` can be called at any time; it triggers `refreshTools()` → `_rebuildSystemPrompt()` → updates `_baseSystemPrompt`.

## Goals / Non-Goals

**Goals:**

- Eliminate agent confusion from user-role guidance messages
- Guarantee system prompt stability for prompt caching (zero per-prompt `systemPrompt` modifications)
- Reduce token cost: zero injected messages when no diagnostics exist
- Proactively detect and start LSP servers at session start (faster first tool call)
- Support multi-root projects with topmost-root deduplication
- Provide project-specific tool guidance including action parameter hints
- Notify the human (not the LLM) when diagnostic context is injected
- Simplify the codebase by removing the reactive tracking state machine

**Non-Goals:**

- Changing how inline diagnostics on `write`/`edit` tool results work (keep as-is)
- Modifying pi-agent-core's `convertToLlm()` to support non-user roles
- TreeSitter-based source analysis beyond what LSP servers provide
- Opening files proactively at session start (servers start warm but empty)
- Parsing `tsconfig.json` contents for root resolution (server handles this internally)

## Decisions

### Decision 1: Capabilities in `promptGuidelines` via tool re-registration at `session_start`

**Choice:** Re-register the `lsp` tool in `session_start` with project-specific `promptGuidelines` derived from a rootMarker + `commandExists` scan. This bakes capabilities into `_baseSystemPrompt`.

**Why not `before_agent_start` systemPrompt modification?** Modifying `systemPrompt` in `before_agent_start` works (it applies per-prompt, persists for all turns in the agent loop), but any change — even identical content — risks provider-level cache miss if the provider hashes the prompt. Re-registering the tool writes to `_baseSystemPrompt` once and never touches it again. The system prompt is byte-identical for every LLM call in the session.

**Why not keep static `promptGuidelines`?** Static guidelines say "LSP available" generically. Project-specific guidelines say "LSP active: typescript-language-server for .ts, .tsx, .js, .jsx" — the agent knows exactly which file types are supported without guessing.

**Server capability introspection:** After the initialize handshake completes, each server reports its `ServerCapabilities` (which actions it supports: hover, definition, references, rename, codeActions, documentSymbol). The guidelines include only actually-supported actions per server. Project roots are included so the agent knows LSP coverage boundaries (e.g., "root: packages/frontend" tells the agent that files outside that subtree may not have LSP coverage from that server).

Example guideline output:
```
LSP active: typescript-language-server
  root: . | files: .ts, .tsx, .js, .jsx
  actions: hover(file,line,char), definition(file,line,char),
    references(file,line,char), diagnostics(file?),
    symbols(file), rename(file,line,char,newName),
    code_actions(file,line,char)
```

**Alternatives considered:**
- `before_agent_start` → `systemPrompt` append: works but breaks caching guarantee
- Keep current static guidelines: functional but generic; agent doesn't know which servers are available for this project
- Omit roots from guidelines: works but agent can't tell which subtrees have coverage

### Decision 2: Diagnostics as XML-framed user message, prepended via `context` event

**Choice:** When outstanding diagnostics exist, inject a `<extension-context source="supi-lsp">` message via `before_agent_start`, then reorder it before the user's prompt in the `context` event.

**Why XML framing?** LLMs are trained to treat `<tagged-content>` as structured metadata. The XML wrapper signals "this is machine-generated context" without needing explicit "do not act on this" instructions. Minimal framing — no verbose disclaimers.

**Why prepend (not append)?** Pi hardcodes extension messages after the user message. The user's actual request should be the _last_ thing the LLM sees — models weight the most recent message most heavily. The `context` event can reorder messages before each LLM call.

**Why not put diagnostics in `systemPrompt`?** Diagnostics change on every edit. Putting them in `systemPrompt` would break prompt caching. User-role messages don't affect system prompt caching.

**Why inject only when diagnostics exist?** Zero-diagnostic turns (the common case) pay zero extra tokens. The old system always injected tracking/activation hints even without diagnostics.

**Alternatives considered:**
- Diagnostics in `systemPrompt`: changes per-edit → breaks caching
- Keep current approach (hidden user message, no XML): agents confuse it with instructions
- Append after user message (current position): LLM treats it as the primary task

### Decision 3: Proactive scan with topmost-root deduplication

**Choice:** At `session_start`, scan cwd (depth 3, excluding `node_modules`/`.git`) for rootMarkers, check `commandExists` for each matched server, deduplicate by topmost directory, and start all matched servers eagerly in parallel.

**Root dedup algorithm:** Sort found roots by path length (shortest first). For each candidate, skip if it's a child of an already-accepted root. This handles monorepos correctly: `/project/tsconfig.json` absorbs `/project/packages/*/tsconfig.json`.

**Why topmost-root, not parse tsconfig?** The LSP server itself handles tsconfig resolution, `extends` chains, and project references. We only need to pick the right spawn directory. Adding a `tsconfig` parsing dependency for something the server already does would be unnecessary coupling.

**Why eager startup?** The scan is ~9ms (sync fs checks). Server startup is ~127ms per server (spawn + LSP handshake). Moving this from first-tool-call to session_start eliminates cold-start latency. No files are opened — the server is just "warm."

**Why start multiple servers for multi-root?** Independent sub-projects (no shared root marker) need separate servers. The dedup ensures shared-root monorepos get one server, while truly independent projects within a repo each get their own.

**Alternatives considered:**
- Parse `tsconfig.json` with `tsconfig` npm package: adds dependency, server handles resolution already
- Lazy startup only: works but adds ~127ms delay to first tool call
- Single server only: fails for repos with independent sub-projects

### Decision 4: Remove bash-guard and steer nudge entirely

**Choice:** Delete `bash-guard.ts`, `bash-guard-directory.ts`, and the `sendMessage`/steer nudge in `tool_result`. Remove `tree-sitter-bash` and `web-tree-sitter` dependencies.

**Why not keep as `ctx.ui.notify()` only?** The proactive `promptGuidelines` already tell the agent "prefer lsp for .ts files." A human-only notification adds UX noise for marginal value. The agent's behavior is steered by guidelines, not by per-command nudges.

**Why not keep TreeSitter for future use?** The bash parser infrastructure is tightly coupled to the nudge use case. If TreeSitter is needed for future features, it can be re-added with a clean API. Dead code is maintenance burden.

**Alternatives considered:**
- Convert steer to `ctx.ui.notify()`: marginal value, adds UX noise
- Keep TreeSitter as dormant infrastructure: maintenance cost for speculative future use

### Decision 5: Human notification via `ctx.ui.notify()`

**Choice:** When diagnostic context is injected in `before_agent_start`, call `ctx.ui.notify("ℹ️ LSP: 2 errors in foo.ts", "info")` so the human knows context was added. No LLM cost.

**Why not display the message?** `display: true` would show it in the TUI but it's still `role: "user"` to the LLM. `display: false` + `ctx.ui.notify()` gives the human visibility without any LLM-side confusion.

### Decision 6: Remove recent-paths tracking and persistence

**Choice:** Delete `recent-paths.ts` entirely. No more path tracking, session persistence of recent files, or relevance-based filtering.

**Why?** Recent paths existed to power two features: (1) relevance matching for guidance injection, and (2) prompt path hint extraction. Both are replaced: capabilities are in `promptGuidelines` (static per session), diagnostics come from all open files (no relevance filter needed). The `overrides.ts` callbacks that fed recent paths can be simplified.

## Risks / Trade-offs

**[Eager startup memory cost]** → Starting servers that the session never uses wastes memory (~100-300MB per TS server). Mitigation: the scan only starts servers with matching rootMarkers AND available binaries, so it's already filtered to likely-needed servers. Shutdown on `session_shutdown` cleans up.

**[Scan depth may miss deeply nested roots]** → Depth-3 scan could miss rootMarkers in deep directory structures. Mitigation: depth 3 covers the vast majority of project layouts. Files in deeper directories still trigger lazy server startup via `getClientForFile` when the agent touches them.

**[XML framing relies on model training]** → The `<extension-context>` tag is effective because current models treat XML-tagged blocks as metadata. Future models could ignore this convention. Mitigation: the framing is minimal and the content is clearly not a task. If needed, explicit instructions can be added later.

**[Loss of steer nudge]** → Agents that ignore `promptGuidelines` and use grep instead of lsp for semantic queries will no longer receive per-command corrections. Mitigation: `promptGuidelines` are the standard mechanism for tool preference steering. If agents consistently ignore guidelines, that's a model-level issue, not fixable by steer messages.

**[Tool re-registration timing]** → `pi.registerTool()` in `session_start` triggers `refreshTools()` → `_rebuildSystemPrompt()`. This relies on the assumption that the tool registry rebuild is safe during session_start. Mitigation: pi's code shows `registerTool` is explicitly documented as callable at any time, and `refreshTools` is a no-op pre-bind.

### Decision 7: `/lsp-status` overlay benefits from proactive scan data

**Choice:** The `/lsp-status` overlay and status bar use scan results to show server information from session start, even before any files are opened. The overlay shows detected servers with their roots, supported file types, supported actions (from `ServerCapabilities`), and status — providing useful context from turn 1 instead of showing "no active servers."

**Why?** Currently the overlay is empty until files are opened. With eager startup, servers are running immediately. The overlay should reflect this. The scan data (server name, root, file types, capabilities) is already available after the initialize handshake.

## Resolved Questions

- **Scan refresh on `/reload`**: Yes. `/reload` triggers `session_start`, which re-scans and re-registers the tool. This handles mid-session binary installs without requiring `/new`.
- **Diagnostic dedup across turns**: Yes. Fingerprint the diagnostic summary and skip re-injection when unchanged. Keeps the lightweight dedup from the old system without the complex tracking machinery.
- **Server capability introspection**: Yes. After the initialize handshake, query `ServerCapabilities` to include only actually-supported actions in guidelines, and include project root paths so the agent knows LSP coverage boundaries.
