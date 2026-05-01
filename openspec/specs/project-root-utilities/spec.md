# Capability: project-root-utilities

## Purpose
Shared project/root detection utilities exported by `supi-core` for use by peer extensions.

## Requirements

### Requirement: supi-core SHALL export shared project/root utilities
The `supi-core` package SHALL provide and export reusable project/root detection utilities for peer extensions. The exported utilities SHALL include project walking, marker-based root detection, root deduplication, root specificity sorting, path containment, and known-root resolution helpers.

#### Scenario: Peer extension imports project/root utilities
- **WHEN** a peer extension imports project/root helpers from `@mrclrchtr/supi-core`
- **THEN** the package exposes the shared utilities without requiring imports from `supi-lsp` implementation files

#### Scenario: Shared utility module avoids higher-level dependencies
- **WHEN** the shared utility module is loaded
- **THEN** it does not import from `supi-lsp` or other extension packages above `supi-core`

### Requirement: Project walking behavior SHALL be preserved
The shared project walking utility SHALL preserve the current `supi-lsp` traversal behavior, including depth limits, ignored directories, and callback semantics.

#### Scenario: Project walk skips ignored directories
- **WHEN** a project contains ignored directories such as `node_modules` or `.git`
- **THEN** the shared walker skips those directories as the existing `supi-lsp` walker did

#### Scenario: Project walk honors depth behavior
- **WHEN** a caller walks a project with the same arguments previously used by `supi-lsp`
- **THEN** the shared walker visits the same candidate roots and files as the previous local implementation

### Requirement: Root detection behavior SHALL be preserved
The shared root detection utilities SHALL preserve current marker-based root lookup and topmost-root deduplication behavior.

#### Scenario: Marker-based root lookup
- **WHEN** a caller asks for the project root from a nested file path using a marker list and fallback directory
- **THEN** the shared `findProjectRoot` walks upward and returns the same root or fallback as the previous `supi-lsp` implementation

#### Scenario: Topmost root deduplication
- **WHEN** a caller deduplicates overlapping detected roots
- **THEN** the shared deduplication helper returns the same root set as the previous `supi-lsp` implementation

### Requirement: Known-root resolution behavior SHALL be preserved
The shared known-root helpers SHALL preserve root merge, specificity ordering, and file-to-root resolution behavior used by `supi-lsp`.

#### Scenario: Merge known roots
- **WHEN** a caller merges an already-known root list with an additional root
- **THEN** the shared helper deduplicates and orders roots consistently with the previous `supi-lsp` behavior

#### Scenario: Resolve most specific known root
- **WHEN** a file path is contained by multiple known roots
- **THEN** the shared resolver returns the most specific matching root

#### Scenario: Resolve missing known root
- **WHEN** a file path is not contained by any known root
- **THEN** the shared resolver returns a clear no-match result
