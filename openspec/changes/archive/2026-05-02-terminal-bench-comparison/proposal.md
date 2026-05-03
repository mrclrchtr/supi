## Why

SuPi needs a credible, reproducible way to compare plain pi against full SuPi without creating or owning a custom benchmark system. Terminal-Bench already provides an external benchmark substrate through Harbor, and Harbor already supports pi as a built-in agent, making it the lowest-risk path to smoke-test and later demonstrate whether SuPi improves agent behavior.

## What Changes

- Add a documented workflow for running plain pi and full SuPi against the same Terminal-Bench task subset with Harbor's built-in `pi` agent.
- Keep optional/reference adapters such as `badlogic/pi-terminal-bench` external instead of vendoring, submoduling, or subtreeing them.
- Define a simplest-first smoke workflow that validates setup, oracle execution, plain pi execution, SuPi execution, and native result availability before any larger run.
- Define how to compare only metrics natively emitted by Harbor/Terminal-Bench/pi, such as pass/fail and duration, plus tokens/cost/turns only when already present.
- Document controls and caveats for fair A/B runs, including fixed model, task IDs, dataset version, environment, and isolated run outputs.

## Capabilities

### New Capabilities
- `terminal-bench-comparison`: Terminal-Bench comparison workflow for plain pi vs full SuPi using Harbor's built-in `pi` agent and native benchmark artifacts.

### Modified Capabilities

None.

## Impact

- Adds benchmark methodology documentation and, if needed, small helper scripts that invoke Harbor's built-in `pi` agent.
- Does not change runtime extension behavior, pi APIs, package exports, or existing OpenSpec capabilities.
- Does not vendor benchmark data, Harbor source, or adapter source into this repository.
- May add ignored/local output path guidance for benchmark jobs and reports.
