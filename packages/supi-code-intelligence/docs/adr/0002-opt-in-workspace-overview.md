# Workspace Overview: scoped setting, structural facts, token-efficient full rendering

The hidden first-turn Code Intelligence overview remains a parent-session surface under an explicit contract: a scoped `code-intelligence.overviewEnabled` setting defaults to `true`, the overview contains only structural repository facts labeled as untrusted evidence, the full overview is always rendered with token-efficient formatting, and its 600-token soft-budget check emits only a debug event. Headless reviewer children never receive it; `code_orientation` remains the complete on-demand orientation surface.

**Status:** Accepted (2026-08-14).

## Context

The agent-context audit measured the current overview at 3,452 characters in this checkout, growing with module names, free-text descriptions, dependencies, entry points, and languages, with no truncation. The product decision keeps the overview default-enabled because it gives fast workspace topology before any tool call, but narrows its content and makes its cost predictable.

## Decision

- **Setting:** `code-intelligence.overviewEnabled`, default `true`, in `/supi-settings` with normal global/trusted-project scope precedence. A reload or new session applies it; there is no mid-session toggle.
- **Content:** module names, manifest-declared topology, declared entrypoints, and detected languages only. Free-text manifest descriptions are omitted. Repository facts are untrusted evidence, never instructions. One short pointer line names `code_orientation`.
- **Rendering:** full output, never truncated by module count; generation is optimized for token efficiency (compact lines, short dependency names, minimal headers and separators).
- **Warning:** the 600-token estimate check remains but emits only a `supi:debug` warning event; no model-facing or TUI text.
- **Isolation:** headless inspection children (Reviewer Sessions and Agent Run children using the headless profile) never receive the overview.

## Considered Options

- **Delete the overview and rely on `code_orientation`:** rejected by decision. The overview remains default-enabled as a fast topology snapshot.
- **Hard truncation near 600 tokens:** rejected. The full overview is shown; token efficiency is achieved through content and formatting, not omission.
- **Retain free-text manifest descriptions:** rejected. They are the largest growth factor and add prompt-injection surface without structural value.
- **Emit the soft-budget warning to model/TUI surfaces:** rejected. Only the debug event remains.

## Consequences

- The first-turn custom message `code-intelligence-overview` stays part of the parent session while the setting is enabled; the audit's measurements remain valid evidence for its cost.
- Any later change that reintroduces free-text descriptions, truncation, or a visible budget warning must revisit this ADR.
- The overview's omission of free-text descriptions is intentional; do not "fix" it without revisiting this ADR.
