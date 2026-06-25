# code_orientation is the orientation surface

Replace `code_context` with `code_orientation` as the first-pass orientation surface for code intelligence. The tool is intentionally narrower than the old context bundle: it orients around a project, discovered module, directory, file, or precise symbol, while relation evidence belongs to `code_graph`, impact evidence belongs to `code_impact`, and health/status belongs to `code_health`.

## Considered Options

- **Keep `code_context` as an aggregator** — rejected because its name and broad section list prime target-analysis and duplicate sibling tools, so agents miss the orientation-first workflow.
- **Rename but keep the old bundle shape** — rejected because it preserves the same shallow interface under a clearer name.
- **Use `scope`/`file`/`task`/`include`/`budget`** — rejected for the orientation surface; `focus`, top-level `line`/`character`, top-level `targetId`, and explicit `maxResults` are smaller and clearer.

## Consequences

- No compatibility alias is kept; SuPi is pre-release and the public surface should stay sharp.
- `focus` is path-first and language-agnostic, with discovered-module lookup as a convenience that fails honestly when unavailable or ambiguous.
- `targetId` wins over `focus` and coordinates, with a visible ignored-focus note.
- Bare symbol-name orientation is not supported; use `code_resolve` first and pass the resulting `targetId`.
- `maxResults` defaults to 10 and caps each rendered evidence list independently.
- Orientation output includes Read Next guidance for landmark files, entrypoints, or the enclosing source range; relation-site guidance remains owned by `code_graph`.
