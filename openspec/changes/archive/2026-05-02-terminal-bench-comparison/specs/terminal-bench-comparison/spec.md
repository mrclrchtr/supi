## ADDED Requirements

### Requirement: Harbor-native pi benchmark workflow
The repository SHALL document a workflow for running Terminal-Bench comparisons through Harbor's built-in `pi` agent rather than vendoring a benchmark adapter into this repository.

#### Scenario: Harbor built-in pi agent is used
- **WHEN** a contributor follows the benchmark workflow
- **THEN** the workflow identifies Harbor's built-in `pi` agent as the primary execution path
- **AND** the repository does not require a vendored benchmark adapter source tree to execute the workflow

#### Scenario: Tool references are reproducible
- **WHEN** benchmark methodology is documented
- **THEN** it records the Harbor version, Terminal-Bench dataset version, pi version when available, SuPi package source for SuPi runs, and execution environment used for the comparison

### Requirement: Plain pi versus full SuPi comparison
The workflow SHALL compare plain pi and full SuPi against the same Terminal-Bench task set under controlled settings.

#### Scenario: Smoke comparison uses matching task IDs
- **WHEN** the smoke comparison is run
- **THEN** the plain pi variant and the full SuPi variant use the same fixed task IDs or task filters
- **AND** the workflow records the model, provider, benchmark dataset version, environment type, and output directories used

#### Scenario: Variant outputs are separated
- **WHEN** benchmark jobs are executed for both variants
- **THEN** the plain pi outputs and full SuPi outputs are written to separate jobs or results directories

#### Scenario: Variant configuration roots are isolated
- **WHEN** plain pi and full SuPi variants are configured
- **THEN** each variant uses a separate pi config root via `PI_CODING_AGENT_DIR` or an equivalent Harbor-supported isolation mechanism

#### Scenario: SuPi loading is verified
- **WHEN** the full SuPi smoke run completes or fails
- **THEN** the workflow requires checking logs or native output for evidence that the full SuPi extension stack was active

### Requirement: Smoke gate before larger runs
The workflow SHALL require a successful smoke validation before recommending larger or full Terminal-Bench runs.

#### Scenario: Smoke gate passes
- **WHEN** the oracle run succeeds, both variants run at least one task, SuPi loading is verified, and native result artifacts are available
- **THEN** the workflow may recommend running a larger or full A/B comparison

#### Scenario: Smoke gate fails
- **WHEN** oracle execution, variant execution, SuPi loading, or native result capture fails
- **THEN** the workflow treats the issue as setup or methodology work rather than proceeding to full benchmark execution

### Requirement: Native metrics only in initial reporting
The workflow SHALL report only metrics available from native Harbor, Terminal-Bench, or pi artifacts in its initial version.

#### Scenario: Native pass/fail and duration are available
- **WHEN** native result artifacts include pass/fail or duration fields
- **THEN** the comparison report includes those fields for both variants

#### Scenario: Native token or cost metrics are absent
- **WHEN** native result artifacts do not include token, cost, turn, or tool-call metrics
- **THEN** the comparison report states that those metrics are not available from initial native artifacts
- **AND** the workflow does not require custom token counters or custom benchmark instrumentation

#### Scenario: Native token or cost metrics are present
- **WHEN** native result artifacts include token, cost, turn, or tool-call metrics
- **THEN** the comparison report may include those metrics without changing the benchmark runner or SuPi runtime behavior

### Requirement: No target-driven benchmark customization
The initial workflow SHALL avoid custom benchmark tasks, custom scoring formulas, and custom instrumentation intended to produce target numbers.

#### Scenario: Initial workflow remains benchmark-substrate neutral
- **WHEN** the initial comparison workflow is implemented
- **THEN** it uses Terminal-Bench tasks through Harbor without adding SuPi-specific benchmark tasks
- **AND** it does not define a custom aggregate SuPi score

#### Scenario: Missing desired metrics are documented
- **WHEN** desired metrics are unavailable from native artifacts
- **THEN** the workflow documents the gap as a limitation rather than adding bespoke instrumentation in the initial version
