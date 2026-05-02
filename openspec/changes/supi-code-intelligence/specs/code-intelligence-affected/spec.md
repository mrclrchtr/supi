## ADDED Requirements

### Requirement: `action: "affected"` SHALL resolve a concrete target before semantic impact analysis
For `affected`, the tool SHALL accept either an anchored target (`file`, `line`, and `character`) or a discovery input such as `symbol`. If discovery input resolves to multiple plausible targets, the tool SHALL return a disambiguation result instead of combining unrelated impact results.

#### Scenario: Anchored impact target
- **WHEN** the agent calls `code_intel` with `action: "affected"`, `file`, `line`, and `character`
- **THEN** the tool analyzes the symbol at that concrete position

#### Scenario: Ambiguous symbol impact target
- **WHEN** the agent calls `code_intel` with `action: "affected"` and a `symbol` value that matches multiple declarations
- **THEN** the tool returns the candidate targets and asks for disambiguation instead of returning merged affected output

### Requirement: `action: "affected"` SHALL report direct and downstream impact
The system SHALL support `action: "affected"` to report what files and modules would be impacted by changing a resolved symbol target. The output SHALL distinguish direct references from downstream dependent modules.

#### Scenario: Symbol referenced across multiple modules
- **WHEN** the agent calls `code_intel` with `action: "affected"` for a resolved target referenced in multiple packages
- **THEN** the tool returns a summary of affected files and modules, grouping direct references separately from downstream dependents

#### Scenario: Symbol only used locally
- **WHEN** the agent calls `code_intel` with `action: "affected"` for a resolved target used only in its defining file or package
- **THEN** the tool reports the impact as local to that file or package

### Requirement: Affected analysis SHALL assign an explained risk level
The affected output SHALL include a qualitative risk assessment derived from the number of affected files, affected modules, and downstream dependency breadth. The risk section SHALL briefly explain the evidence behind the rating so agents can decide whether to inspect more context, add tests, or make a narrower change.

#### Scenario: Small local change
- **WHEN** a symbol change affects only one file or one module with no downstream dependents
- **THEN** the tool reports a low risk level

#### Scenario: Broad cross-module change
- **WHEN** a symbol change affects many files across multiple modules with downstream dependents
- **THEN** the tool reports a higher risk level
- **AND** the output names the main modules or edges that make the change risky

### Requirement: Affected output SHALL be summary-first and action-oriented
Affected output SHALL start with a concise answer card summarizing target identity, confidence source, direct references, downstream breadth, and risk. Detailed evidence SHALL be grouped after the summary, and the output MAY include one or two concrete next steps such as focused briefs, caller drill-down, or likely test areas.

#### Scenario: Agent reviews blast radius before editing
- **WHEN** `affected` finds direct references and downstream dependents
- **THEN** the first lines summarize the likely blast radius before listing detailed references

#### Scenario: Follow-up analysis would be useful
- **WHEN** affected evidence points to a high-risk module or ambiguous dependency edge
- **THEN** the output may suggest a focused `code_intel brief` or `code_intel callers` query for that path or symbol

### Requirement: Affected analysis SHALL label degraded fallback results clearly
If semantic reference data is unavailable, the system SHALL either return clearly labeled heuristic impact output or explain that only limited impact analysis is available.

#### Scenario: Heuristic fallback impact
- **WHEN** the agent requests `action: "affected"` in a context without usable LSP references but with structural or pattern-based fallback data
- **THEN** the tool labels the result as heuristic impact analysis and distinguishes it from semantic reference-based analysis

#### Scenario: No viable fallback data
- **WHEN** the agent requests `action: "affected"` for a symbol with neither semantic nor heuristic evidence available
- **THEN** the tool reports that it could not determine affected usage for the symbol

### Requirement: Missing or unknown symbols SHALL return a clear message
If the requested symbol cannot be resolved to any semantic or heuristic evidence, the tool SHALL return a clear message naming the unresolved symbol.

#### Scenario: Unknown symbol
- **WHEN** the agent calls `code_intel` with `action: "affected"` for a symbol that cannot be found
- **THEN** the tool returns a message indicating that the symbol could not be found or analyzed
