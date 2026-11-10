# Code Orientation: inline directory navigation

Change record and expectations for directory-focused `code_orientation`. Re-evaluate with the commands below once enough sessions have used the change.

## Problem

Evidence from 2026-11-10, covering the preceding 30 days of sessions in this workspace:

| Source | Finding |
| --- | --- |
| Benchmark | `orient-package` path recall 29% (native 71%); `orient-directory` 50% (native 100%) |
| Session usage | 119 `code_orientation` calls; next call read an unnamed path (`gap`) 37×, a named file or listed directory 33×; 0 reads of captured snapshots |
| Session usage | `path`-focus results: median 9,245 / p90 14,023 chars with inlined instruction files (177 of 327 calls); navigation alone median 1,493 / p90 3,174 |

Causes:

- Commit `241bb1b7` deferred **Declared paths** (manifest entry points such as `exports` and `main`) to the captured snapshot, which agents did not read.
- **Direct files** were capped at `maxResults` (default 10) in a table; sorted siblings after the cap were hidden.
- A **Captured navigation** section only reported `showing 0 of N` for deferred sections.

## Change

| Area | Before | After |
| --- | --- | --- |
| Declared paths of the focused project | Captured snapshot only | Inline |
| Direct files, `maxResults` unset | First 10, table | All, one compact line; falls back to the default cap when the navigation budget requires it |
| Direct files, `maxResults` set | Capped, table | Capped, compact line |
| Deferred sections | Separate `Captured navigation` section | One header note naming the deferred sections |
| Bench path recall | `./`-prefixed manifest paths not counted | Counted as the same file |

Out of scope: instruction-file size (intended per ADR 0013 and ADR 0003; deduplication observed working: 4 repeats in 176 deliveries), workspace (unfocused) Orientation, and the Overview.

## Measured (benchmark)

| Scenario | Tokens | Path recall | Tokens per hit |
| --- | --- | --- | --- |
| `orient-package` | 383 → 430 | 29% → 71% | 192 → 86 |
| `orient-directory` | 385 → 402 | 50% → 100% | 96 → 50 |

Native arms: 732 tokens / 71%, 128 tokens / 100%. `orient-directory` remains about 3× the native `ls` cost because of header notes and the directory table.

## Expected (unverified)

Observational; session ratios show correlation, not savings.

- `code_orientation` `followed + descend` share rises relative to `gap` (baseline 33 : 37).
- Fewer immediate `ls`/`read` calls on the focused directory after a `path` focus.
- `p90Chars` for `path` focus without instructions stays near 3,200; a small increase from declared paths is acceptable.
- Snapshot reads stay near zero; they were not a recovery path before either.

Revisit the change if `gap` share does not drop or navigation p90 grows well beyond the 4,000-token cap behavior.

## Re-evaluation

After about 20 or more `code_orientation` calls on the new commit:

```bash
node scripts/code-tool-usage.mjs --since-commit <commit> --output after.json
node scripts/code-tool-usage.mjs --before-commit <commit> --output before.json
pnpm bench:code-intelligence
```

Compare per-tool ratios, not raw counts. Requires Debug capture (`debug.enabled`); see [Code tool usage report](code-tool-usage.md).
