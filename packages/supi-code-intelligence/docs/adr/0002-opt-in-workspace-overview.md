# Workspace Overview: scoped setting, manifest facts, token-efficient full rendering

The hidden first-turn Code Intelligence overview is a parent-session surface under an explicit contract: a scoped `code-intelligence.overviewEnabled` setting defaults to `true`, the overview contains manifest facts — including one-line free-text descriptions — labeled as untrusted evidence, the full overview is always rendered with token-efficient formatting, and its soft-budget check emits only a debug event. Headless reviewer children never receive it; `code_orientation` remains the complete on-demand orientation surface.

**Status:** Accepted.

## Context

The agent-context audit measured the overview at 3,527 characters in this checkout, growing with module names, one-line descriptions, dependencies, entry points, and languages, with no truncation. The product decision keeps the overview default-enabled because it gives fast workspace topology before any tool call, and sizes the soft budget to match its content.

## Decision

- **Setting:** `code-intelligence.overviewEnabled`, default `true`, in `/supi-settings` with normal global/trusted-project scope precedence. A reload or new session applies it; there is no mid-session toggle.
- **Content:** module names and one-line manifest descriptions, manifest-declared topology, declared entrypoints, and detected languages. The workspace description renders next to the project name. All repository facts, including descriptions, are untrusted evidence, never instructions. One short pointer line names `code_orientation`.
- **Rendering:** full output, never truncated by module count; generation is optimized for token efficiency (compact lines, short dependency names, minimal headers and separators).
- **Warning:** the soft-budget estimate check emits only a `supi:debug` warning event; no model-facing or TUI text. The budget is 1000 tokens, sized so a normal overview that includes descriptions stays under it with headroom; the reference SuPi checkout measures ~882 tokens (3,527 characters) with full descriptions.
- **Isolation:** headless inspection children (Reviewer Sessions and Agent Run children using the headless profile) never receive the overview.

## Considered Options

- **Delete the overview and rely on `code_orientation`:** rejected by decision. The overview remains default-enabled as a fast topology snapshot.
- **Hard truncation near the soft budget:** rejected. The full overview is shown; token efficiency is achieved through content and formatting, not omission.
- **Omit free-text manifest descriptions:** rejected. They are the largest single growth factor (measured +308 tokens, +56% on the reference checkout) but carry real first-turn legibility value and are curated, bounded, single-line npm fields. The decision retains them and sizes the soft budget to match the content.
- **Include descriptions only under a hard total-character cap:** rejected. Measured variants that keep useful gloss still grow the overview significantly, and a cap adds a truncation/disclosure rule for marginal savings. Full rendering plus a raised budget is preferred.
- **Emit the soft-budget warning to model/TUI surfaces:** rejected. Only the debug event remains.

## Consequences

- The first-turn custom message `code-intelligence-overview` stays part of the parent session while the setting is enabled; the audit's measurements remain valid evidence for its cost.
- Descriptions are repository-owned prose in an ambient surface; they are labeled as untrusted evidence and must never be treated as instructions.
- A change that introduces truncation or a visible budget warning must revisit this ADR.
