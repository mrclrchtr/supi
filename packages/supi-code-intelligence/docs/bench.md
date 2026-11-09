# Tool-output benchmark

Deterministic comparison of native PI tools (`grep`, `read`) and `code_*` tools on the same navigation questions. No model calls: it measures what each tool sequence puts into context, not how an agent behaves.

```bash
pnpm bench:code-intelligence            # run and diff against baseline.json
pnpm bench:code-intelligence --update   # rewrite baseline.json
pnpm bench:code-intelligence --dump     # also write raw outputs to __tests__/bench/out/
```

Requires git history for `CORPUS_COMMIT` and the TypeScript LSP from root dev dependencies. Not part of CI.

Uses the native TypeScript 7 backend (`@typescript/native`), which SuPi selects by default. tsserver 6 answers implementations from a single project, so cross-package results would be understated.

## Files

| Path | Role |
| --- | --- |
| `__tests__/bench/scenarios.ts` | `CORPUS_COMMIT`, questions, per-arm call sequences, ground truth |
| `__tests__/bench/run.ts` | Corpus setup, execution, metrics, baseline diff |
| `__tests__/bench/corpus.ts` | `git archive` extraction and dependency links |
| `__tests__/bench/baseline.json` | Committed reference metrics |

Workspace and LSP setup reuse `__tests__/helpers/real-substrate-workspace.ts` from the language-baseline acceptance suite.

## Corpus

SuPi's `packages/` tree at `CORPUS_COMMIT`, extracted with `git archive` (binaries and `__tests__/bench` excluded). Workspace packages link to their corpus copies; third-party packages link to the live `node_modules`. The language-baseline fixtures are too small to show noise, truncation, or ambiguity effects.

## Metrics

| Metric | Compared with baseline | Notes |
| --- | --- | --- |
| `tokens` | yes | chars/4 of call arguments plus model-visible output, the estimate PI uses. Not a provider tokenizer. |
| `calls` | yes | Executed steps; conditional steps that return `null` are not counted. |
| `precision` / `recall` | yes | `path:line` locations in the answer against `truth`. "Read Next" hints are excluded. Only for scenarios with `truth`. |
| `codeToolSurfaceTokens` | yes | Per-request cost of all registered `code_*` definitions (description, schema, snippet, guidelines). |
| latency | no | Printed only; machine-dependent. |

All arms run once as warm-up before measurement. Cold TypeScript project loading omits cross-project references nondeterministically.

## Workflow

1. Change tool output or behavior.
2. Run `pnpm bench:code-intelligence` and review the diff column.
3. If the change is intended, run with `--update` and commit `baseline.json` in the same change.
4. When bumping `CORPUS_COMMIT`, re-derive every `truth` entry (`rg -n` on the new commit) and update the baseline. Diffs across corpus commits are not shown.

## Adding scenarios

- Model a competent agent's minimal sequence for each arm. Do not handicap either side.
- Add `truth` whenever the answer is a set of locations.
- Use a function step for data-dependent follow-ups (e.g. disambiguation handles); return `null` when not needed.

## Limits

- Fixed call sequences: real agents may phrase grep differently, misuse `code_*`, or still read files afterward. Agent-level effects need an LLM A/B run (see [Terminal-Bench workflow](../../../docs/ops/benchmarking-terminal-bench.md)).
- TypeScript only.
- Break-even: `codeToolSurfaceTokens` is paid on every request; saved output also persists in later requests, so the package pays off once cumulative per-session savings exceed the surface cost.
