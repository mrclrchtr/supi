# code_orientation is the Orientation surface

`code_orientation` is the first-pass Orientation surface for code intelligence. It orients around a workspace, discovered module, directory, file, or resolved symbol. Relationship evidence belongs to `code_graph`; point facts belong to `code_inspect`; full diagnostic status, refresh, and maintenance evidence belong to `code_health`. Orientation may include bounded, focus-relevant diagnostic Priority Signals only to help choose what source to inspect next.

## Decision

Omitting `focus` means workspace Orientation. Otherwise `focus` accepts exactly one nested branch:

- `{ path }` for a directory or file
- `{ module }` for discovered-module lookup
- `{ target: TargetSelector }` for a handle, anchored point, or symbol query

No flat `targetId`, `file`, `line`, or `character` fields are accepted. No input wins by precedence; contradictory shapes are invalid. Bare symbol strings are not Orientation focus values.

The Workspace code-intelligence session collects typed Orientation blocks, target facts, instruction-file metadata, diagnostic Priority Signals, and read-next actions. Priority Signals are prioritization context rather than a health report. Markdown and TUI remain presentation adapters over assembled facts.

## Considered Options

- **Keep `code_context` as an aggregator** — rejected because a broad bundle duplicates sibling tools and weakens tool choice.
- **Rename while keeping the old flat shape** — rejected because it preserves hidden precedence.
- **Use one string for both path and module lookup** — rejected because ambiguity would depend on filesystem state.
- **Return rendered markdown from the session** — rejected because it couples workflow policy to one presentation adapter.

## Consequences

- No compatibility alias or dual shape is kept.
- Path and module lookup fail honestly when missing or ambiguous.
- Symbol Orientation uses the shared target workflow and returns a stored target handle in details.
- `maxResults` defaults to 10 and caps rendered evidence lists independently.
- Directory Orientation may surface local instruction files once per session branch.
- Bounded diagnostic Priority Signals may guide source selection; recovery, server status, and complete diagnostic reporting remain owned by `code_health`.
- Orientation includes read-next guidance for landmarks, entrypoints, or an enclosing source range; relationship-site guidance remains owned by `code_graph`.
