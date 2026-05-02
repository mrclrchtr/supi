## ADDED Requirements

### Requirement: `action: "affected"` SHALL resolve a concrete target before semantic impact analysis
For `affected`, the tool SHALL accept either an anchored target (`file`, `line`, and `character`) or a discovery input such as `symbol`. Public `line` and `character` parameters SHALL be 1-based and compatible with the existing `lsp` and `tree_sitter` tools; the implementation SHALL translate them to the 0-based LSP service API internally. If discovery input resolves to multiple plausible targets, the tool SHALL return a disambiguation result instead of combining unrelated impact results. Disambiguation candidates SHALL include retry-ready display name, kind, container/module when available, explicit rank order, `file`, 1-based `line`, 1-based `character`, and a short distinguishing reason or snippet. Candidate lists SHOULD be ranked, bounded by default, and report omitted counts when additional matches exist.

#### Scenario: Anchored impact target
- **WHEN** the agent calls `code_intel` with `action: "affected"`, `file`, `line`, and `character`
- **THEN** the tool analyzes the symbol at that concrete position

#### Scenario: Ambiguous symbol impact target
- **WHEN** the agent calls `code_intel` with `action: "affected"` and a `symbol` value that matches multiple declarations
- **THEN** the tool returns the candidate targets, including anchored coordinates where available, and asks for disambiguation instead of returning merged affected output

### Requirement: `action: "affected"` SHALL report direct and downstream impact
The system SHALL support `action: "affected"` to report what files and modules would be impacted by changing a resolved symbol target. The output SHALL distinguish direct references from downstream dependent modules and SHOULD rank the highest-value affected targets ahead of any long tail.

#### Scenario: Symbol referenced across multiple modules
- **WHEN** the agent calls `code_intel` with `action: "affected"` for a resolved target referenced in multiple packages
- **THEN** the tool returns a summary of affected files and modules, grouping direct references separately from downstream dependents

#### Scenario: Symbol only used locally
- **WHEN** the agent calls `code_intel` with `action: "affected"` for a resolved target used only in its defining file or package
- **THEN** the tool reports the impact as local to that file or package

### Requirement: Affected analysis SHOULD prioritize likely human-edited impact targets by default
Affected analysis SHOULD prioritize likely human-edited source files, tests, and module boundaries over obvious generated, build-output, vendored, dependency-output, or cache-like artifacts when ranking impact targets by default. If the agent explicitly scopes analysis to such a location, the tool MAY include those results normally.

#### Scenario: Source and generated impact targets both exist
- **WHEN** affected analysis finds both source-level impact targets and obvious generated/build/vendor outputs
- **THEN** the ranked result prioritizes the source-level impact targets by default

### Requirement: Affected analysis SHALL assign an explained `low` / `medium` / `high` risk level
The affected output SHALL include a qualitative risk assessment with one of the labels `low`, `medium`, or `high`, derived from the number of affected files, affected modules, and downstream dependency breadth. The risk section SHALL briefly explain the evidence behind the rating so agents can decide whether to inspect more context, add tests, or make a narrower change.

#### Scenario: Small local change
- **WHEN** a symbol change affects only one file or one module with no downstream dependents
- **THEN** the tool reports a `low` risk level

#### Scenario: Moderate shared change
- **WHEN** a symbol change affects a few files or a shared module but has limited downstream breadth
- **THEN** the tool reports a `medium` risk level and summarizes the main evidence

#### Scenario: Broad cross-module change
- **WHEN** a symbol change affects many files across multiple modules with downstream dependents
- **THEN** the tool reports a `high` risk level
- **AND** the output names the main modules or edges that make the change risky

### Requirement: Affected output SHALL be summary-first and action-oriented
Affected output SHALL start with a concise answer card summarizing target identity, confidence source using the shared vocabulary (`semantic`, `structural`, `heuristic`, or `unavailable`), direct references, downstream breadth, risk, and the most important "check next" files or modules. Detailed evidence SHALL be grouped after the summary, and the output MAY include one or two concrete next steps such as focused briefs, caller drill-down, or likely test areas. When the relevant target or path is known, next steps SHOULD include copyable `code_intel` parameters so the agent can continue without locating the symbol manually. When a follow-up `code_intel` query is strongly implied, the output SHOULD include a compact copyable rerun example with concrete parameter values.

#### Scenario: Agent reviews blast radius before editing
- **WHEN** `affected` finds direct references and downstream dependents
- **THEN** the first lines summarize the likely blast radius before listing detailed references
- **AND** the summary names a small set of highest-value files or modules to inspect next when such targets are available

#### Scenario: Follow-up analysis would be useful
- **WHEN** affected evidence points to a high-risk module or ambiguous dependency edge
- **THEN** the output may suggest a focused `code_intel brief`, `code_intel callers`, or `code_intel callees` query for that path or symbol

### Requirement: Affected output SHOULD identify likely tests to inspect
When nearby or naming-correlated tests can be inferred cheaply, the affected result SHOULD highlight the most likely tests to inspect before or after the change. These suggestions SHALL be framed as likely verification targets, not as a claim that those are the only relevant tests. By default, the result SHOULD limit this section to a small ranked set such as the top three likely tests.

#### Scenario: Shared API change with nearby tests
- **WHEN** a symbol change affects a public or shared module that has nearby or clearly related test files
- **THEN** the affected output highlights a small ranked list of likely tests to inspect

#### Scenario: No likely tests can be inferred cheaply
- **WHEN** the tool cannot infer likely test files with reasonable confidence
- **THEN** the affected output omits the test section rather than inventing low-signal suggestions

### Requirement: Affected analysis SHALL label non-semantic and unavailable results clearly
If semantic reference data is unavailable, the system SHALL either return clearly labeled `structural` or `heuristic` impact output, or explain that impact analysis is `unavailable`. When semantic enrichment is unavailable or unsupported but bounded structural or heuristic evidence is available, the tool SHOULD return that correctly labeled result. The tool MAY return an early bounded structural or heuristic result while semantic enrichment is still pending, but this is optional in v1 and SHOULD NOT be required purely for responsiveness.

#### Scenario: Structural or heuristic fallback impact
- **WHEN** the agent requests `action: "affected"` in a context without usable LSP references but with structural or pattern-based fallback data
- **THEN** the tool labels the result as `structural` or `heuristic` impact analysis and distinguishes it from `semantic` reference-based analysis

#### Scenario: Semantic enrichment is still pending
- **WHEN** the agent requests `action: "affected"` while semantic reference data is still pending and semantic results are likely to materially improve correctness
- **THEN** the tool MAY wait for the higher-confidence semantic result rather than returning an early partial answer purely for responsiveness
- **AND** if semantic enrichment ultimately proves unavailable or unsupported, the tool returns the best bounded structural, heuristic, or unavailable result with clear confidence labeling

#### Scenario: No viable fallback data
- **WHEN** the agent requests `action: "affected"` for a symbol with neither semantic nor heuristic evidence available
- **THEN** the tool reports that affected analysis is `unavailable` for the symbol

### Requirement: Affected results SHALL expose structured details metadata in addition to markdown
In addition to markdown content for the model, `affected` results SHALL include compact structured `details` metadata suitable for tests, renderers, and future automation. Where applicable, `details` SHOULD include confidence mode from the shared vocabulary, direct and downstream counts, ranked check-next targets, likely tests, omitted counts, risk level, and suggested next queries.

#### Scenario: Affected result includes metadata
- **WHEN** a `code_intel` `affected` action succeeds
- **THEN** the tool result includes markdown content for the model and a compact `details` object describing the structured impact result

### Requirement: Missing or unknown symbols SHALL return a clear message
If the requested symbol cannot be resolved to any semantic, structural, or heuristic evidence, the tool SHALL return a clear message naming the unresolved symbol.

#### Scenario: Unknown symbol
- **WHEN** the agent calls `code_intel` with `action: "affected"` for a symbol that cannot be found
- **THEN** the tool returns a message indicating that the symbol could not be found or analyzed
