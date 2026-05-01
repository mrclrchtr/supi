## ADDED Requirements

### Requirement: Code intelligence SHALL inject an architecture overview once per session
The system SHALL generate a lightweight architecture overview and inject it into the agent context on the first `before_agent_start` event of each session. It SHALL NOT re-inject the overview on later agent turns in the same session.

#### Scenario: First agent turn in a new session
- **WHEN** a new session reaches its first `before_agent_start`
- **THEN** the system generates a compact architecture overview and injects it into the agent context

#### Scenario: Subsequent agent turn in the same session
- **WHEN** `before_agent_start` fires again later in the same session
- **THEN** the system does not inject the architecture overview again

### Requirement: The auto-injected overview SHALL be compact and structural
The auto-injected overview SHALL summarize top-level project layout, module/package names, one-line purpose descriptions when available, and key dependency edges. It SHALL prefer concise summaries over detailed API listings.

#### Scenario: Multi-package workspace overview
- **WHEN** the project contains multiple workspace packages with descriptions and internal dependencies
- **THEN** the overview lists each package with a compact description and the most relevant dependency edges between them

#### Scenario: Large repository overview
- **WHEN** the project contains more structural detail than fits comfortably in the prompt budget
- **THEN** the overview prioritizes module names, purposes, and dependency edges while omitting lower-level API detail

### Requirement: The system SHALL support `action: "brief"` for full-project and focused briefs
The `code_intel` tool SHALL support `action: "brief"` to generate a structured architecture brief for the whole project or for a specific file or directory path.

#### Scenario: Full-project brief
- **WHEN** the agent calls `code_intel` with `action: "brief"` and no `path`
- **THEN** the tool returns a project-level brief covering major modules, dependency relationships, and notable entrypoints or patterns

#### Scenario: Focused brief for a package
- **WHEN** the agent calls `code_intel` with `action: "brief"` and `path: "packages/supi-lsp/"`
- **THEN** the tool returns a focused brief describing that package's purpose, internal structure, dependencies, dependents, and notable exports or entrypoints

### Requirement: Brief generation SHALL combine base architecture data with optional enrichment
The system SHALL build briefs from project metadata and structural analysis, and SHALL enrich them with LSP and Tree-sitter data when those sources are available.

#### Scenario: LSP and Tree-sitter both available
- **WHEN** the focused path is in a language supported by both `supi-lsp` and `supi-tree-sitter`
- **THEN** the brief includes semantic details such as public symbols or references alongside structural details such as imports, exports, and outline information

#### Scenario: LSP unavailable but structural analysis available
- **WHEN** LSP is unavailable for the focused path but Tree-sitter support exists
- **THEN** the brief still returns structural information from project metadata and Tree-sitter analysis without failing the action

### Requirement: Brief requests for missing paths SHALL return a clear error
If the agent requests a brief for a path that does not exist, the tool SHALL return a clear error naming the missing path.

#### Scenario: Missing path
- **WHEN** the agent calls `code_intel` with `action: "brief"` and `path: "packages/does-not-exist/"`
- **THEN** the tool returns an error indicating that the path was not found
