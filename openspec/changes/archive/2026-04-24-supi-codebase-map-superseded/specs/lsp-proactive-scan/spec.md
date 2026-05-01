# Capability: lsp-proactive-scan

## MODIFIED Requirements

### Requirement: Project root detection utilities SHALL be provided by supi-core
The functions `walkProject`, `findProjectRoot`, `dedupeTopmostRoots`, `sortRootsBySpecificity`, `isWithin`, and `byPathDepth`/`segmentCount` SHALL be exported from `supi-core` instead of being defined locally in `supi-lsp`. The `supi-lsp` package SHALL import these functions from `supi-core`. The behavior of each function SHALL remain identical — this is a pure extraction with no semantic changes.

#### Scenario: supi-lsp scanner uses supi-core walkProject
- **WHEN** `supi-lsp` calls `walkProject` during project scanning
- **THEN** the function behaves identically to its previous local definition (same depth limit, same ignored directories, same callback signature)

#### Scenario: supi-lsp findProjectRoot uses supi-core implementation
- **WHEN** `supi-lsp` calls `findProjectRoot` to resolve a file to its project root
- **THEN** the upward walk and marker matching behavior is unchanged

#### Scenario: supi-lsp dedupeTopmostRoots uses supi-core implementation
- **WHEN** `supi-lsp` calls `dedupeTopmostRoots` during root deduplication
- **THEN** the topmost-root algorithm produces the same results as before

#### Scenario: supi-lsp manager-roots uses supi-core path utilities
- **WHEN** `supi-lsp` calls `sortRootsBySpecificity`, `mergeKnownRoots`, or `resolveKnownRoot`
- **THEN** these functions behave identically to their previous local definitions
