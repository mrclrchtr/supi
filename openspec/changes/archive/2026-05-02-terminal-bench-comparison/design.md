## Context

SuPi currently has unit/integration tests for individual packages, but no documented external benchmark workflow that compares agent-level behavior between plain pi and full SuPi. The desired benchmark substrate already exists outside this repository: Terminal-Bench provides benchmark tasks through Harbor, and Harbor provides a built-in `pi` agent.

This change should preserve that ownership boundary. SuPi should document how to run and compare variants using Harbor's native pi support, not import an adapter or create a competing benchmark harness. The first useful deliverable is a smoke workflow that proves the setup works and records exactly what the native tools emit.

## Goals / Non-Goals

**Goals:**

- Provide a reproducible plain pi vs full SuPi comparison workflow using Harbor's built-in `pi` agent.
- Make the smoke workflow explicit enough to validate setup before expensive/full benchmark runs.
- Document fair-run controls: same Harbor/pi versions, same model/provider, same task IDs, same dataset version, same environment, and separate output directories.
- Report only metrics already emitted by Harbor/Terminal-Bench/pi in the initial version.
- Capture caveats when native artifacts do not include desired metrics such as tokens or cost.

**Non-Goals:**

- Building a new benchmark runner or benchmark task format.
- Vendoring, subtreeing, submoduling, or forking Harbor or `pi-terminal-bench` in the initial version.
- Adding custom token accounting, custom scoring, or task selection optimized for target numbers.
- Measuring per-extension attribution in the first version.
- Changing SuPi runtime behavior only to improve benchmark results.

## Decisions

### Use Harbor's built-in pi agent first

Use Harbor's built-in `pi` agent via `harbor run -a pi` as the primary comparison path. The SuPi repository may contain methodology documentation and tiny helper scripts, but it must not include Harbor source or external adapter source by default.

Alternatives considered:

- **`badlogic/pi-terminal-bench` adapter:** useful context, but not necessary for the first workflow because Harbor already supports pi.
- **Git subtree/submodule:** rejected initially because it increases maintenance and implies SuPi owns upstream benchmark code.
- **Fork:** reserved for cases where Harbor's built-in pi agent cannot support required config/package loading hooks.

### Start with smoke, then expand

The initial workflow should run a tiny fixed task subset for plain pi and full SuPi before any large run. The smoke run is not for public claims; it validates setup, extension loading, result paths, and available metrics.

A larger or full Terminal-Bench run should only happen after smoke acceptance criteria pass.

### Compare native artifacts only in v1

The first workflow should summarize only fields that already exist in native job outputs. Pass/fail and duration are expected baseline metrics. Tokens, cost, turns, and tool-call counts should be included only when they are present or directly recoverable from native artifacts without patching the benchmark system.

If token/cost data is missing, the report should state that token/cost claims are not available from v1 artifacts instead of adding custom counters.

### Isolate variants through configuration and output paths

Plain pi and full SuPi runs should use separate jobs directories and separate pi config/install roots via `PI_CODING_AGENT_DIR`. The SuPi variant should load SuPi through normal pi package settings, preferably a published npm package or pinned git package, rather than benchmark-specific adapter patches.

## Risks / Trade-offs

- **Native artifacts may not include token/cost data** → Report the gap honestly in v1 and defer instrumentation decisions until after artifact inspection.
- **SuPi may not load through package settings inside the benchmark container** → Include a smoke acceptance gate requiring log or output evidence that full SuPi is active in the SuPi variant.
- **Terminal-Bench tasks may not isolate SuPi-specific improvements** → Frame results as plain pi vs full SuPi agent-level comparisons, not per-extension attribution.
- **Small smoke samples are noisy** → Treat smoke results as setup validation only; require larger/repeated runs before public claims.
- **External tooling may change** → Document the Harbor version, pi version, dataset version, package source, and environment used for each run.
