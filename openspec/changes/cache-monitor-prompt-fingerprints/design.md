## Context

The `supi-cache-monitor` extension already tracks per-turn cache metrics and detects regressions with three diagnosed causes: compaction, model change, and system prompt change. The prompt-change diagnosis is a blunt instrument: it hashes the entire system prompt string in `before_agent_start` and, when the hash differs, labels the next turn with “system prompt changed.” Users see this in a warning toast and in the `/supi-cache` history table, but they have no visibility into *which part* of the prompt changed — e.g. a newly activated tool, an updated `AGENTS.md`, a loaded skill, or an appended guideline.

Pi exposes `BuildSystemPromptOptions` on the `before_agent_start` event, giving us structured access to every component that feeds into the system prompt. We can fingerprint each component independently and attach those fingerprints to every `TurnRecord`.

## Goals / Non-Goals

**Goals:**
- Compute a stable, deterministic fingerprint for every structured system-prompt component on each turn.
- Persist fingerprints alongside turn records so they survive session restarts.
- Diff the fingerprints of the current and previous turns to produce a human-readable summary of what changed.
- Surface the diff in regression warnings (notification) and in the `/supi-cache` report.
- Keep the implementation self-contained inside `packages/supi-cache-monitor`.

**Non-Goals:**
- Hashing the raw provider payload (`before_provider_request`).
- Tracking user prompt text or conversation length as cache predictors.
- Cryptographic hashing — FNV-1a is sufficient for change detection.
- Backwards-compatible parsing of old turn records that lack `promptFingerprint`.

## Decisions

**1. Fingerprint structure — one hash per component, plus per-item arrays**

We define `PromptFingerprint` with scalar hashes for large text blobs (`customPrompt`, `appendSystemPrompt`, `promptGuidelines`, `toolSnippets`, `selectedTools`) and arrays of `{ path, hash }` / `{ name, hash }` for `contextFiles` and `skills`.

*Rationale:* Summarizing diffs is easiest when we can say “context files (+1, ~2)” or “tools changed”. A single monolithic hash would require re-parsing raw content to diff, defeating the purpose of structured options.

*Alternative considered:* Hashing the final provider payload. Rejected because payloads are provider-specific and harder to diff meaningfully.

**2. Fingerprint is attached to the turn record, not stored separately**

`TurnRecord` gets a new optional `promptFingerprint` field. It is populated from `state.lastPromptFingerprint` at `recordTurn` time and persisted via the existing `pi.appendEntry("supi-cache-turn", record)` call.

*Rationale:* Keeps restoration logic simple — `restoreFromEntries` already replays `TurnRecord` objects verbatim, so no extra entry type or parsing is needed.

**3. Diff output is a flat array of change descriptions**

`diffFingerprints(prev, curr)` returns `string[]` like `["contextFiles (+1)", "tools"]`. The report renderer and notification formatter consume this list directly.

*Rationale:* Minimal surface area, easy to test, and trivial to format as a comma-separated sentence or a bulleted list.

**4. Report layout — compact detail section below the history table**

After the existing per-turn table, `/supi-cache` renders a “Regression details” block that lists any turns whose `note` indicates a regression cause, followed by bullet points for the fingerprint diff.

*Rationale:* Users already look at `/supi-cache` for historical context; adding detail there is discoverable without changing the primary table format.

## Risks / Trade-offs

- **[Risk] Fingerprint size bloats session entries** → Each `TurnRecord` now carries ~6–10 hashes and arrays. With a long session this is a minor increase in JSONL size. Mitigation: hashes are 32-bit integers and arrays are bounded by the number of loaded context files/skills.
- **[Risk] `systemPromptOptions` shape changes in future pi versions** → The fingerprint builder reads known keys defensively; unknown keys are ignored. If pi adds new prompt components, the fingerprint will simply not capture them until the extension is updated.
- **[Risk] False precision** → A changed tool snippet may not actually invalidate the provider cache (e.g. if the provider only caches the system block). Mitigation: the diff is presented as a heuristic clue (“likely cause”), not a guaranteed root cause.

## Migration Plan

- No migration needed. The change is additive: new code paths only, no existing setting or entry format changes beyond the new field.
- Rollback: revert the commit; old turn records without `promptFingerprint` are ignored gracefully.

## Open Questions

- None.
