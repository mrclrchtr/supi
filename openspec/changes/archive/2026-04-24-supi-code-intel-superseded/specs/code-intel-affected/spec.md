## ADDED Requirements

### Requirement: Affected action for blast-radius analysis
The system SHALL support `action: "affected"` to report what files and modules would be impacted by changing a symbol.

#### Scenario: Symbol referenced across multiple modules
- **WHEN** the agent calls `code_intel` with `action: "affected"`, `symbol: "makeCtx"`
- **THEN** the tool returns a list of files that reference the symbol, grouped by module (package), with a summary (e.g., "Changing makeCtx would affect 5 files across 2 packages")

#### Scenario: Symbol only used locally
- **WHEN** the agent calls `code_intel` with `action: "affected"` for a symbol used only in its defining file
- **THEN** the tool returns "Changing <symbol> would only affect its defining file: <file>"

#### Scenario: Symbol not found
- **WHEN** the agent calls `code_intel` with `action: "affected"` for a symbol that doesn't exist
- **THEN** the tool returns "Symbol not found: <symbol>"

### Requirement: Affected analysis includes dependency chain
The affected analysis SHALL include not only direct references but also downstream modules that depend on the modules containing references.

#### Scenario: Symbol change propagates through dependency chain
- **WHEN** symbol `X` in package `supi-core` is referenced by `supi-lsp`, and `supi-lsp` is imported by `supi-ask-user`
- **THEN** the affected report lists both `supi-lsp` (direct) and `supi-ask-user` (transitive) as affected, distinguishing between direct and transitive impact

### Requirement: Affected output format
The affected output SHALL be structured as: summary line, direct references grouped by module, transitive dependents, and a risk assessment (low/medium/high based on the number of affected files).

#### Scenario: High-impact change
- **WHEN** changing a symbol would affect more than 10 files across 3+ modules
- **THEN** the tool includes a risk assessment of "high" in the output
