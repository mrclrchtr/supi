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

## Missed opportunities

The report also counts native calls that a `code_*` tool could have answered, next to the `code_*` calls of the same kind. Logic: `scripts/code-tool-opportunities.mjs`; JSON key `opportunities`.

| Category | Native search counted | `code_*` call counted | Benchmark favors |
| --- | --- | --- | --- |
| `references` | Pattern is one identifier or an alternation of identifiers, each camelCase, PascalCase with a second word, or snake_case (`fooBar`, `\bfooBar\(`, `FooBar\|BazQux`) | `code_graph` with `references` (default) or `all` | `code_*` for ambiguous names |
| `implementations` | Pattern ends in `implements X` or `extends X` | `code_graph` with `implements` or `all` | `code_*` |
| `declaration` | Pattern is a declaration keyword plus a name (`export function foo`, `interface Foo`) | `code_resolve` symbol query; `code_find` semantic or AST `definition` | grep for exact names |

Native searches are `rg`/`grep` commands in `bash` (each command of a chain counts) and Pi's `grep` tool. Not counted: filters over another command's output (`… | rg`), `rg --files`, case-insensitive searches, searches whose paths are all non-code files, other regular expressions, and single lowercase words. `in sessions` is the number of sessions with at least one such search. The JSON report lists the five most frequent patterns per category.

`Whole-file reads before an edit` counts `read` calls without `offset`/`limit` on source files of at least 100 lines whose next mutation of the same path is an `edit`, with median lines read and median `oldText` lines replaced. It estimates how often a declaration-scoped read could replace a whole-file read.

## Interpretation limits

- Missed-opportunity categories come from the search pattern alone. A counted search is a candidate, not proof that the `code_*` tool would have been cheaper or more precise: an identifier search can be a text question (log messages, config keys, SQL names), and for exact names the benchmark favors grep. Compare ratios across versions.
- Whole-file reads are matched to edits by literal path, so a read by absolute path and an edit by relative path are not paired.

- Follow-up classes compare path tokens in `read.path` and bash commands with the result text. A `gap` can be a planned next step (e.g. reading repository docs), not a missing fact; compare ratios across versions rather than reading them as absolute failure rates.
- `beforeFirstEdit` is a correlation. Sessions that use `code_*` tools are often exploratory and larger; it does not show an effect.
- Sessions are read in file order; branched sessions interleave branches.
- Only the next call is classified, not later recovery.
