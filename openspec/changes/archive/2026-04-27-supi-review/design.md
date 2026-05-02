## Context

SuPi is a pi extension monorepo. pi exposes an `ExtensionAPI` that supports commands, tools, event handlers, custom TUI components, and custom message renderers. SuPi already has a settings registry (`supi-core`), TUI selectors (`supi-ask-user`), and LSP integration (`supi-lsp`). The goal is to add a `/supi-review` command that mimics OpenAI Codex's review feature: preset selection, dedicated reviewer, structured findings, and custom transcript rendering.

The local Codex checkout at `/Users/mrclrchtr/Development/public/codex` serves as the reference implementation for review semantics, prompt construction, and JSON output schema.

The pi documentation for version `0.70.2` confirms the subprocess CLI contract used by this design:
- `README.md` documents `--mode json` for JSONL events, `--model <pattern>`, session files, and `--tools <list>` / `-t <list>`.
- `docs/json.md` documents `pi --mode json "Your prompt"` and the JSONL event stream (`message_end`, `turn_end`, `agent_end`, tool execution events).
- `-p` / `--print` is a separate print mode and is not part of the JSON subprocess invocation.

## Goals / Non-Goals

**Goals:**
- `/supi-review` command with interactive preset and depth selectors.
- Extension resolves git targets (diff, merge-base, commits) and constructs a rich review prompt.
- Dedicated subprocess reviewer with isolated context and read-only built-in tools.
- Structured `ReviewOutputEvent` JSON parsing with plain-text fallback.
- Custom `supi-review` transcript message with a tailored renderer.
- Settings registry integration for review model overrides and timeout configuration.
- Non-interactive fallback for print/RPC modes with a documented argument grammar.
- Graceful error handling for subprocess spawn failures, non-zero exits, aborts, timeouts, and malformed output.

**Non-Goals:**
- Core pi changes (no `Op::Review`, no review-mode events, no sub-agent protocol).
- Inline/current-session review mode.
- Auto-apply fixes from review findings.
- Persistent review history or database.
- Integration with external PR tools (GitHub, GitLab).
- LSP diagnostics injection into review prompt (v2 idea).
- `bash` access in the reviewer subprocess. SuPi security policies may add controlled shell access in a later change.

## Decisions

### 1. Dedicated subprocess reviewer (not inline)
**Decision:** Run the reviewer as a separate `pi --mode json -p` subprocess and keep its session file.
**Rationale:** Isolates the reviewer's context window from the main session, prevents accidental file mutations by omitting mutation-capable tools, and allows a different model without changing the session model. The `-p` flag ensures non-interactive exit after the single prompt completes, matching the official pi subagent example. Keeping the child session file makes timeout and failure debugging much easier because users can inspect the saved subprocess transcript after the run. The default reviewer timeout is 900000ms (15 minutes), giving slower models and larger review prompts enough time to finish without making timeouts indefinite. This matches Codex's dedicated reviewer behavior while staying within documented pi CLI flags.
**Alternatives considered:**
- *Inline review* (same session, inject system prompt): faster, no process spawn, but shares context and risks working-tree mutation. Rejected for safety.
- *Custom tool in same session*: simpler but same context-sharing issues. Rejected.
- *Omitting `-p`*: possible but unverified; the official subagent example includes `-p` and it is harmless. Kept for alignment.

### 2. Extension pre-computes git targets
**Decision:** The extension runs `git merge-base`, `git diff`, `git log`, `git show`, etc., and feeds the results into the review prompt.
**Rationale:** The reviewer subprocess does not need `bash`; the extension already has full shell access via `pi.exec` and can perform deterministic git plumbing before launching the isolated reviewer.
**Alternatives considered:**
- *Reviewer runs git via `bash`*: more flexible, but requires granting shell access to the subprocess. Rejected for v1; controlled shell access can be revisited with a future SuPi security layer.

### 3. Read-only subprocess tool allowlist
**Decision:** Launch the reviewer with `--tools read,grep,find,ls` and do not include `bash`, `write`, or `edit` in v1.
**Rationale:** Parent-session `tool_call` handlers do not intercept tool calls made inside an independently spawned `pi` process. A CLI-level tool allowlist is simpler and matches the read-only reviewer goal.
**Alternatives considered:**
- *String-match dangerous `bash` commands*: brittle and unenforceable from the parent process. Rejected.
- *Allow unrestricted `bash` temporarily*: useful for tests and history inspection, but too broad without a security policy. Rejected for v1.

### 4. Codex-style `ReviewOutputEvent` JSON schema
**Decision:** Adopt Codex's structured output schema exactly enough for compatibility:
```ts
interface ReviewOutputEvent {
  findings: ReviewFinding[];
  overall_correctness: "patch is correct" | "patch is incorrect" | string;
  overall_explanation: string;
  overall_confidence_score: number;
}

interface ReviewFinding {
  title: string;
  body: string;
  confidence_score: number;
  priority?: 0 | 1 | 2 | 3 | null;
  code_location: ReviewCodeLocation;
}

interface ReviewCodeLocation {
  absolute_file_path: string;
  line_range: { start: number; end: number };
}
```
**Rationale:** Codex defines this shape in `codex-rs/protocol/src/protocol.rs` and documents the exact prompt schema in `codex-rs/core/review_prompt.md`. Reusing it makes the output predictable and lets SuPi render findings consistently.
**Alternatives considered:**
- *Free-form markdown output*: simpler to implement, but harder to render consistently and impossible to sort/prioritize. Rejected.
- *Custom XML schema*: possible, but JSON is natively supported by models and easier to parse. Rejected.

### 5. Custom `supi-review` message renderer
**Decision:** Inject the review result as a custom message (`customType: "supi-review"`) and register a `registerMessageRenderer` for it.
**Rationale:** Custom renderers give full control over the TUI appearance (banner, findings list, verdict, colors). A normal assistant message would be plain markdown and lose the structured visual hierarchy.
**Alternatives considered:**
- *Normal assistant message with markdown*: easiest, but looks like any other response. Rejected for polish.
- *Custom tool (`review_runner`) with renderCall/renderResult*: would show a tool execution row, but findings deserve their own transcript entry, not a tool result. Rejected.

### 6. Two-step selector flow
**Decision:** First picker selects the target (base branch, uncommitted, commit, custom). Second picker selects the depth (Inherit, Fast, Deep).
**Rationale:** Separates target selection from model choice, reducing cognitive load. The depth picker can show the actual configured model names inline (e.g., "Fast (claude-haiku)").
**Alternatives considered:**
- *Single picker with combined options*: "Review uncommitted (fast)", "Review uncommitted (deep)". Rejected because it multiplies options and hides model names.
- *Settings-driven default with no picker*: always use the configured default depth. Rejected because users will want to switch per review.

### 7. Model resolution for reviewer subprocess
**Decision:** Depth maps to model string via settings:
- `Inherit` -> current session model (`<provider>/<id>` when available, or no `--model` flag if unavailable).
- `Fast` -> `settings.reviewFastModel`.
- `Deep` -> `settings.reviewDeepModel`.
- Timeout -> `settings.reviewTimeoutMinutes`, converted from minutes to milliseconds for the subprocess runner.
If a Fast/Deep setting is missing, fall back to the session model. If the timeout setting is unset or invalid, fall back to the 15-minute default.
**Rationale:** Simple, predictable, and matches Codex's `review_model` override without introducing a redundant default review model setting. Using string model IDs lets pi resolve them in the subprocess via its own model registry. Storing the timeout in minutes matches the user-facing `/supi-settings` UX and keeps project- or user-specific review budgets configurable without touching code.
**Alternatives considered:**
- *Provider/model object in settings*: more structured, but harder for users to edit in JSON. Rejected in favor of simple strings like `"anthropic/claude-sonnet-4-5"`.
- *Separate `reviewModel` default*: overlaps with `Inherit` and creates ambiguous precedence. Rejected.

### 8. Package structure
**Decision:** Create `packages/supi-review/` with:
```
packages/supi-review/
  index.ts          # Extension entrypoint: command registration, UI flow
  git.ts            # Git target resolution (diff, merge-base, commits)
  runner.ts         # Subprocess reviewer invocation and output parsing
  prompts.ts        # Review prompt construction (target -> prompt text)
  renderer.ts       # Custom message renderer for TUI
  settings.ts       # Settings registry registration
  review-prompt.md  # Reviewer rubric / JSON schema reference
```
Then a thin wrapper in `packages/supi/review.ts`.
**Rationale:** Matches existing SuPi package conventions (`packages/supi-<name>/`). Keeps the meta-package clean. No build step needed since pi loads TypeScript directly. The `review-prompt.md` is passed to the subprocess via `--append-system-prompt review-prompt.md`; pi reads the file contents automatically.

### 9. Diff truncation strategy
**Decision:** Truncate diffs to `maxDiffBytes` (default 100KB) using middle truncation: keep the beginning and end, replace the omitted center with a clear `[... truncated N bytes ...]` marker, and append a prompt note indicating truncation.
**Rationale:** The beginning preserves file headers, new-file context, and early hunks; the end preserves later hunks and recent commit content in large base-branch diffs. The marker makes the loss explicit to the reviewer.
**Alternatives considered:**
- *Head-only truncation*: simple, but can consistently drop later hunks. Rejected.
- *Tail-only truncation*: preserves the end but loses diff headers and early context. Rejected.
- *Smart truncation (keep modified function signatures)*: complex, fragile. Rejected for v1.

### 10. Non-interactive argument grammar
**Decision:** When `ctx.hasUI` is false, `/supi-review` accepts this grammar:
```
/supi-review base-branch <branch> [--depth inherit|fast|deep]
/supi-review uncommitted [--depth inherit|fast|deep]
/supi-review commit <sha> [--depth inherit|fast|deep]
/supi-review custom [--depth inherit|fast|deep] -- <instructions...>
```
`--depth` defaults to `inherit`. Custom instructions may also be provided as all remaining arguments after `custom` when `--` is omitted.
**Rationale:** This keeps print/RPC mode deterministic and scriptable while matching the interactive preset choices.
**Alternatives considered:**
- *Free-form parsing*: easier initially, but hard to document and test. Rejected.
- *Only support base branch in non-interactive mode*: too limited for automation. Rejected.

## Risks / Trade-offs

**[Risk] Reviewer subprocess spawns a second model call, doubling cost.**
-> Mitigation: Fast model preset uses a cheap model. Users can skip review if cost is a concern. The extension does not auto-run reviews.

**[Risk] Large diffs truncated to 100KB may miss critical changes in the omitted middle.**
-> Mitigation: Use middle truncation with an explicit marker and prompt note. Future v2 could support chunking or multi-pass review for large diffs.

**[Risk] Read-only subprocess tools limit reviewer capability.**
-> Mitigation: The parent extension pre-computes git targets and the reviewer still has `read`, `grep`, `find`, and `ls` for follow-up inspection. Future SuPi security work can add controlled `bash` access.

**[Risk] Custom message renderer may conflict with other extensions that handle all custom types.**
-> Mitigation: Use a specific `customType: "supi-review"`. Other extensions can ignore unknown custom types. No breaking change to pi core.

**[Risk] Reviewer returns invalid JSON and fallback plain-text loses structured findings.**
-> Mitigation: The system prompt is explicit about JSON output. The fallback renders the full text so the user still sees the review. Codex uses the same fallback strategy.

**[Risk] `pi` subprocess may not be available in all environments (e.g., custom pi builds, nix wrappers).**
-> Mitigation: Use `getPiInvocation()` logic similar to the subagent example — detect if running from a script or generic runtime, and fall back to `pi` command. Surface spawn failures as user-facing review errors.

## Migration Plan

No migration needed. This is a new capability:
1. Merge the new `packages/supi-review/` package.
2. Update `packages/supi/` wrapper and root `package.json`.
3. Users get `/supi-review` automatically on next `/reload` or pi restart.
4. Settings are optional; defaults work out of the box.

Rollback: remove the extension entry from `package.json` `pi.extensions` and `/reload`.

## Open Questions

1. **Should the review prompt include LSP diagnostics if `supi-lsp` is active?** This would enrich the review with type errors but couples the packages. Deferred to v2.
2. **Should we support a `--review` CLI flag to start pi in review mode directly?** Could be useful for CI, but out of scope for v1.
3. **Should findings support click-to-jump-to-file in the TUI?** pi does not currently support hyperlinks in custom renderers. Deferred until TUI APIs support it.
