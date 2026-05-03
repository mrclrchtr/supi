## Context

`code_intel pattern` is implemented as a thin wrapper around ripgrep. Today `executePatternAction()` forwards the user-supplied `pattern` directly to `runRipgrep()`, which in turn invokes `rg -e <pattern>`. That means the public tool surface behaves like raw regex search even though the action is positioned as a bounded, agent-friendly text search. Common agent queries are usually literal strings (`sendMessage({`, `theme.fg(`, config keys, command names), so regex metacharacters produce misleading empty results instead of useful matches.

The current renderer also emits each match with its own before/after context independently. When multiple matches are close together in one file, overlapping context lines are repeated, inflating tool output and reducing readability. The same search helper is shared by other actions, so this change should avoid risky parser-wide behavior changes unless necessary.

## Goals / Non-Goals

**Goals:**
- Make `action: "pattern"` succeed for normal literal search strings without requiring agents to understand ripgrep regex rules
- Preserve access to regex-powered searches through an explicit opt-in parameter
- Remove duplicated overlapping context lines from grouped pattern results in the same file
- Keep the change localized to the pattern action, tool schema, and tests

**Non-Goals:**
- Rework shared ripgrep parsing for all `code_intel` actions
- Add advanced search modes beyond literal-by-default plus `regex: true`
- Change ranking, scope filtering, or output budgets beyond the deduplication needed to remove obvious repetition

## Decisions

### 1. `pattern` will be literal by default and expose `regex: true` for raw regex
`executePatternAction()` will escape the public `pattern` value with `escapeRegex()` unless the caller sets `regex: true`. This matches the dominant agent use case and turns the current surprising failure mode into predictable behavior. Regex support remains available for power users and intentional advanced searches. When regex mode is selected, malformed patterns will return an explicit invalid-regex error rather than falling through to a misleading no-match response.

**Alternatives considered:**
- **Keep regex as the default and add `fixedStrings: true`**: closer to ripgrep's native model, but keeps the common case error-prone for agents.
- **Always literal, no regex escape hatch**: simpler, but removes a useful advanced capability from a tool explicitly meant to replace many ad hoc `rg` shell searches.

### 2. Deduplication will happen at render time, not in shared ripgrep parsing
`formatPatternResults()` will track rendered `file:line` pairs per file and skip already-emitted lines when rendering contexts and matches. This fixes the token waste where it is visible to the user without changing `parseRgJson()` behavior that other actions may rely on.

**Alternatives considered:**
- **Merge overlapping windows in `parseRgJson()`**: more centralized, but riskier because the helper is shared by callers, affected, and implementations fallbacks.
- **Cap lines per file instead of deduplicating**: reduces output size but still leaves repeated evidence and can hide unique lines while duplicates remain.

### 3. Tool help and examples will advertise the new mode explicitly
The `code_intel` schema/help surface will document that `pattern` is literal by default and that `regex: true` opts into raw regex semantics. Example calls should include one literal search and one regex search so agents can discover the escape hatch without trial and error.

**Alternatives considered:**
- **Rely on implementation only**: would fix behavior but leave the new parameter undiscoverable.

## Risks / Trade-offs

- **[Risk] Agents that intentionally relied on implicit regex mode may get broader literal matches instead** → Mitigation: add an explicit `regex` parameter and document it in examples/guidance.
- **[Risk] Explicit regex mode could still hide parse failures behind empty results** → Mitigation: route regex searches through a helper that preserves ripgrep execution errors and convert malformed-regex failures into explicit user-facing errors.
- **[Risk] Render-time dedup could accidentally hide a real match line if bookkeeping is wrong** → Mitigation: track only exact `file:line` pairs and add tests covering adjacent matches plus repeated context.
- **[Risk] Schema/help changes may drift from runtime behavior** → Mitigation: add tests for literal special-character searches and explicit regex mode in the pattern action.

## Migration Plan

- Update the `code_intel` tool schema/help to include `regex?: boolean`
- Implement literal-default escaping in the pattern action and preserve opt-in regex
- Add render-time deduplication for grouped output
- Extend tests to cover special-character literals, explicit regex mode, malformed-regex errors, and overlapping-context output
- No user data migration or rollout sequencing is required; the change is runtime-only and local to the tool behavior

## Open Questions

- None
