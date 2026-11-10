# Code tool usage report

`scripts/code-tool-usage.mjs` summarizes how agents used `code_*` tools in persisted Pi sessions. It complements the deterministic [tool-output benchmark](../../packages/supi-code-intelligence/docs/bench.md): the benchmark measures fixed call sequences, this report measures observed agent behavior.

```bash
node scripts/code-tool-usage.mjs --since 30d                  # current workspace tree
node scripts/code-tool-usage.mjs --since 30d --output r.json  # also write JSON for later comparison
node scripts/code-tool-usage.mjs --help
```

`--since-commit <rev>` keeps only session segments whose recorded SuPi commit is at least as new as `<rev>`. Segments start at each Debug `runtime-provenance` record (startup, reload, resume, …), so a long session counts from its last reload. `--before-commit <rev>` keeps segments older than `<rev>`; together they select a window, e.g. before and after one change. Requires Debug capture; segments without provenance are excluded and reported as `unknownProvenanceSegments`.

Defaults: sessions whose `cwd` is in the current directory tree; storage from `--sessions-dir`, `PI_CODING_AGENT_SESSION_DIR`, then `<PI_CODING_AGENT_DIR or ~/.pi/agent>/sessions`. `--since` filters by session file modification time.

## Metrics per tool

| Column | Meaning |
| --- | --- |
| `calls`, `errors` | Results and `isError` results |
| `status` | `details.status` (`completed`, `disambiguation`, `invalid-input`, …); `error` for `isError` |
| `avg/p90 chars` | Model-visible result size |
| `followed` | Next call reads a file the result named |
| `descend` | Next call reads below a directory the result listed (`dir/`) |
| `snapshot` | Next call reads a captured orientation snapshot (`supi-orientation-*`) |
| `gap` | Next call reads a file or directory the result did not name |
| `retry` | Next call is the same tool (narrowing, disambiguation, correction) |
| `chain` | Next call is another `code_*` tool |
| `edit` / `other` | Mutation, or a call without path targets / no further call |

The JSON report also counts argument keys per tool (e.g. how often `maxResults` or `scope` is set).

`beforeFirstEdit` compares sessions that called a `code_*` tool before their first mutation with sessions that did not: median calls and model-visible result characters before that edit.

## Interpretation limits

- Follow-up classes compare path tokens in `read.path` and bash commands with the result text. A `gap` can be a planned next step (e.g. reading repository docs), not a missing fact; compare ratios across versions rather than reading them as absolute failure rates.
- `beforeFirstEdit` is a correlation. Sessions that use `code_*` tools are often exploratory and larger; it does not show an effect.
- Sessions are read in file order; branched sessions interleave branches.
- Only the next call is classified, not later recovery.
