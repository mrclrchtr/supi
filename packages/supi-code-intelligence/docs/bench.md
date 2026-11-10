# Tool-output benchmark

Deterministic comparison of native PI tools (`grep`, `read`) and `code_*` tools on the same navigation questions. No model calls: it measures what each tool sequence puts into context, not how an agent behaves.

```bash
pnpm bench:code-intelligence            # run and diff against baseline.json
pnpm bench:code-intelligence --update   # rewrite baseline.json
pnpm bench:code-intelligence --dump     # also write raw outputs to __tests__/bench/out/
pnpm bench:code-intelligence --check    # exit 1 when deterministic metrics differ from baseline.json
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
| `precision` / `recall` | yes | Answer locations against `truth` spans (`path:line` or `path:start-end`). "Read Next" hints and `locate` steps are excluded. Lines shown by `read` count only when they hit a span: unrelated window lines are already paid for in tokens. Recall counts covered spans. Only for scenarios with `truth`. |
| `recall` (paths) | yes | For `truthPaths` scenarios (orientation, multi-line imports): share of expected files the answer names, workspace- or focus-relative, or reads. No precision: a map may list more than the question needs. |
| `tokensPerHit` | yes | `tokens` divided by correct locations or paths. Compares cost per useful fact across arms with different recall. |
| `complete` | yes | Same metrics after lifting a truncation the last call discloses, as an agent would to get every result: code_* `N of M … K omitted` or `showing N; K collected omitted` re-run with `maxResults` covering all collected results; grep `limit reached. Use limit=N` re-run with that limit (at most 3 follow-ups). Absent when nothing was cut. Shown as `full tok` / `full recall`. |
| `viewed` | yes | Only for `viewSource` scenarios (the question needs the code at each site, e.g. how a symbol is used). `calls` and `tokens` after additionally reading ±2 lines around every reported location whose source text the arm has not shown; grep match lines and read windows count as shown, code_* position rows do not. Wrong locations are read too. Shown as `viewed tok`. |
| `codeToolSurfaceTokens` | yes | Per-request cost of all registered `code_*` definitions (description, schema, snippet, guidelines). |
| latency | no | Printed only; machine-dependent. |

Before running, every `truth` span is checked against the corpus and must match the scenario's `truthText`; stale line numbers abort the run. An arm that recognizes none of the expected locations or paths also aborts, since that indicates an output format the extractors no longer parse rather than a tool regression.

The report ends with a suite balance: summed tokens of complete answers per arm, savings per question, and how many questions' savings one request's tool surface costs. It is a rough ratio over this scenario mix, not a session model (no prompt caching, no persistence of output in later requests). A second line repeats the balance with `viewed` tokens where present.

All arms run once as warm-up before measurement. Cold TypeScript project loading omits cross-project references nondeterministically.

## Workflow

1. Change tool output or behavior.
2. Run `pnpm bench:code-intelligence` and review the diff column.
3. If the change is intended, run with `--update` and commit `baseline.json` in the same change.
4. When bumping `CORPUS_COMMIT`, re-derive every `truth` entry (`rg -n` on the new commit) and update the baseline. Diffs across corpus commits are not shown.

## Adding scenarios

- Model a competent agent's minimal sequence for each arm. Do not handicap either side.
- Add `truth` and `truthText` whenever the answer is a set of locations; use `truthPaths` when the answer is a set of files. Use a span when tools legitimately report different lines of one construct.
- Derive follow-up arguments (read offsets, inspect points) from earlier outputs with function steps. Hard-coded positions leak the answer and hide whether the first output was sufficient.
- Mark pure locating calls (e.g. grep for a declaration before reading its body) with `locate: true` so their hits are not scored as answers.
- Use a function step for data-dependent follow-ups (e.g. disambiguation handles); return `null` when not needed.
- Include questions where `code_*` is expected to lose or tie (e.g. text in Markdown, name-based calls across packages), so the suite does not only cover its strengths.

## Limits

- Fixed call sequences: real agents may phrase grep differently, misuse `code_*`, or still read files afterward. The [code tool usage report](../../../docs/ops/code-tool-usage.md) measures observed follow-up behavior from session logs. Agent-level effects need an LLM A/B run (see [Terminal-Bench workflow](../../../docs/ops/benchmarking-terminal-bench.md)).
- TypeScript only.
- chars/4 is biased against `code_*`. A one-off check of the dumped outputs with BPE tokenizers (o200k and Anthropic's legacy tokenizer) counted grep/read output at about ×1.0–1.2 of the estimate, but `code_*` output at about ×1.3–1.45. Target handles (`tg-…`, 30 characters, ~21 tokens vs. an estimated 8) cause most of the gap; file outlines reach ×1.6. Read `code_*` token savings as upper bounds. No tokenizer is used because no official offline tokenizer exists for current Claude or GPT models; exact counts need a provider API (e.g. Anthropic `messages.countTokens`).
- Path recall checks that a file is named, not that the agent would recognize it as relevant. Captured snapshot files are not followed, matching observed agent behavior.
- Break-even: `codeToolSurfaceTokens` is paid on every request; saved output also persists in later requests, so the package pays off once cumulative per-session savings exceed the surface cost. The suite balance depends on the scenario mix and is not a representative workload.
- `viewed` is a hypothetical upper bound, not observed behavior. In persisted Pi sessions across projects (60 days, ~700 completed `code_graph`/`code_find` calls), about two thirds were not followed by reading a named file within three calls, and no follow-up read was 20 lines or shorter (median 150 lines, often the whole file). Agents read whole functions to edit, not single sites, so inline source lines would rarely replace a read. Measured with the heuristics of the [code tool usage report](../../../docs/ops/code-tool-usage.md).
- `viewed` compares one grep line with a 5-line read window, which favors grep when one line suffices and favors code_* when the agent would read the context anyway. With ±0 lines code_* still costs more than grep in every `viewSource` scenario except `refs-ambiguous` and `implementations`.
- Truncations without omitted results (`more may exist` only) are not expanded; such answers stay incomplete in `complete`.
