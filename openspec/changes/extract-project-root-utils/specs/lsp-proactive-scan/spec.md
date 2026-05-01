## MODIFIED Requirements

### Requirement: Project root detection utilities SHALL be provided by supi-core
The functions used by `supi-lsp` for project walking, project root detection, root deduplication, root specificity sorting, path containment, and known-root resolution SHALL be imported from `supi-core` instead of being defined locally in `supi-lsp`. The behavior of each function SHALL remain identical; this is a pure extraction with no semantic changes to LSP scanning.

#### Scenario: supi-lsp scanner uses supi-core walkProject
- **WHEN** `supi-lsp` calls `walkProject` during project scanning
- **THEN** the function behaves identically to its previous local definition, including depth limit, ignored directories, and callback signature

#### Scenario: supi-lsp findProjectRoot uses supi-core implementation
- **WHEN** `supi-lsp` calls `findProjectRoot` to resolve a file to its project root
- **THEN** the upward walk and marker matching behavior is unchanged

#### Scenario: supi-lsp dedupeTopmostRoots uses supi-core implementation
- **WHEN** `supi-lsp` calls `dedupeTopmostRoots` during root deduplication
- **THEN** the topmost-root algorithm produces the same results as before

#### Scenario: supi-lsp manager roots use supi-core path utilities
- **WHEN** `supi-lsp` calls helpers such as `sortRootsBySpecificity`, `buildKnownRootsMap`, `mergeKnownRoots`, `resolveKnownRoot`, `isWithin`, or related path-depth helpers
- **THEN** those helpers behave identically to their previous local definitions
