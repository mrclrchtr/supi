---
name: evaluate-code-tools
description: Evaluate Code Intelligence (`code_*`) tools from benchmark, session usage, retrospectives, and open issues; judge one change or rank current weaknesses.
disable-model-invocation: true
metadata:
  internal: true
---

# Evaluate code tools

Combine sources that measure different things; none proves an effect alone.

| Source | Measures | Read before interpreting |
| --- | --- | --- |
| Benchmark (`pnpm bench:code-intelligence`) | Fixed call sequences: tokens, recall, tokens per hit | `packages/supi-code-intelligence/docs/bench.md` |
| `node scripts/code-tool-usage.mjs` | Observed agent behavior after each `code_*` result | `docs/ops/code-tool-usage.md` |
| `gather-retrospectives` skill | Sub-agent self-reports | its `SKILL.md` |
| `gh issue list --state open --search "code_ OR code-intelligence OR lsp"` | Known, triaged defects and gaps | `docs/agents/issue-tracker.md` |

Read each source's doc before running it; flags and metric definitions live there. Put every JSON output in one `mktemp -d` directory.

## Pick the mode

- **Change mode**: the user names a change (commit, PR, feature) and asks whether it helped. Follow every step.
- **Status mode**: the user asks where the tools stand or what to improve next. Skip step 1 and the commit windows; there is no change to compare.

## 1. Pin the change (change mode)

Resolve the change to commit `C` (`git rev-parse <rev>`). Record `C`, its subject, and its committer date.

## 2. Benchmark

Run `pnpm bench:code-intelligence` from the repository root, never with `--update`: the baseline is the committed reference, and rewriting it erases the comparison.

- Change mode: when `C` changed `baseline.json`, its committed diff is the before/after (`git show C -- packages/supi-code-intelligence/__tests__/bench/baseline.json`). Otherwise report the run's diff column.
- Status mode: rank scenarios by the `code_*` arm's recall and tokens per hit against the native arm.

## 3. Session usage

- Change mode: run the report with `--before-commit C` and with `--since-commit C`.
- Status mode: run it with `--since 30d`.

Compare per tool: result status mix, `p90Chars`, and follow-up ratios (`followed + descend` against `gap`, `retry` share, `snapshot` count). Compare ratios, not raw counts.

Commit windows rely on Debug runtime provenance, which SuPi records only since commit `c6f9647b` and only while `debug.enabled` is true. Sessions older than that have none, so an empty window usually means "not enough new sessions yet", not a configuration fault. When a window has fewer than about 20 `code_*` calls, report its counts and `unknownProvenanceSegments` and call it insufficient. Fall back to `--since <date of C>` only with that caveat stated.

## 4. Retrospectives

Follow the `gather-retrospectives` skill, with `--since-commit C` in change mode. Keep only findings about `code_*` tools, grouped per tool. Reports with `promptRevision` below 2 or none were not asked about `code_*` tools, so their silence is not evidence.

## 5. Issues

List open issues touching `code_*` tools and map each to the tool it affects. Mark issues that the change in `C` claims to fix.

## 6. Report

Stay under 300 words:

- **Scope**: change mode `C`, subject, date; status mode the time window.
- **Benchmark**: improved, regressed, or weakest scenarios with numbers.
- **Usage**: per-tool ratios with call counts, or "insufficient" with counts.
- **Retrospectives** and **Issues**: per-tool findings with refs, or none.
- **Verdict**: change mode, did it help and where the sources disagree; status mode, a ranked list of what to improve next, each item backed by at least two sources where possible.
- **Evidence**: absolute paths of the saved outputs.

Label usage and retrospective findings as observational: they show correlation and self-report, not measured savings.
