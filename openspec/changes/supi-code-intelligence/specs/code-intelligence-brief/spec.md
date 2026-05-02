## ADDED Requirements

### Requirement: Code intelligence SHALL inject an architecture overview once per session
The system SHALL generate a lightweight architecture overview and inject it into the agent context on the first `before_agent_start` event of each session. It SHALL NOT re-inject the overview on later agent turns in the same session.

#### Scenario: First agent turn in a new session
- **WHEN** a new session reaches its first `before_agent_start`
- **THEN** the system generates a compact architecture overview and injects it into the agent context

#### Scenario: Subsequent agent turn in the same session
- **WHEN** `before_agent_start` fires again later in the same session
- **THEN** the system does not inject the architecture overview again

### Requirement: The auto-injected overview SHALL be compact, structural, and actionable
The auto-injected overview SHALL summarize top-level project layout, module/package names, one-line purpose descriptions when available, and key dependency edges. It SHALL prefer concise summaries over detailed API listings and SHOULD target roughly 500 tokens or less. When space allows, it SHOULD include a brief hint that richer focused context is available through `code_intel brief` instead of expanding the injected context itself.

#### Scenario: Multi-package workspace overview
- **WHEN** the project contains multiple workspace packages with descriptions and internal dependencies
- **THEN** the overview lists each package with a compact description and the most relevant dependency edges between them

#### Scenario: Dense module-edge format
- **WHEN** the project contains modules with internal dependencies
- **THEN** the overview may use a dense line-oriented format such as:
  ```
  supi-core (leaf)
  supi-lsp → supi-core
  supi-tree-sitter → supi-core
  supi → supi-lsp, supi-tree-sitter, supi-code-intelligence
  ```

#### Scenario: Large repository overview
- **WHEN** the project contains more structural detail than fits comfortably in the prompt budget
- **THEN** the overview prioritizes module names, purposes, and dependency edges while omitting lower-level API detail

#### Scenario: Agent needs deeper context
- **WHEN** the compact overview omits details for token budget reasons
- **THEN** it nudges the agent toward a focused `code_intel brief` query rather than dumping additional detail automatically

### Requirement: Code intelligence SHALL handle projects without a detectable architecture model
If no project metadata, modules, or source structure can be detected, the system SHALL avoid noisy empty architecture sections. It SHALL either skip auto-injection or inject a short note that no structured project model was detected.

#### Scenario: Empty project
- **WHEN** the first `before_agent_start` occurs in a directory with no recognizable project metadata or source files
- **THEN** the system does not inject an empty module map

#### Scenario: Source-only project without module metadata
- **WHEN** source files exist but no package/module metadata can be detected
- **THEN** the overview uses the limited detected structure or reports that only a minimal project model is available

### Requirement: The system SHALL support `action: "brief"` for project, module, directory, and file briefs
The `code_intel` tool SHALL support `action: "brief"` to generate a structured architecture brief for the whole project or for a specific file or directory path. Focused briefs SHALL cover project-level, module/directory-level, and single-file focus paths where those paths exist.

#### Scenario: Full-project brief
- **WHEN** the agent calls `code_intel` with `action: "brief"` and no `path`
- **THEN** the tool returns a project-level brief covering major modules, dependency relationships, and notable entrypoints or patterns

#### Scenario: Focused brief for a package
- **WHEN** the agent calls `code_intel` with `action: "brief"` and `path: "packages/supi-lsp/"`
- **THEN** the tool returns a focused brief describing that package's purpose, internal structure, dependencies, dependents, and notable exports or entrypoints

#### Scenario: Focused brief for a single file
- **WHEN** the agent calls `code_intel` with `action: "brief"` and a file path
- **THEN** the tool returns a file-focused brief describing the file's containing module, imports, exports, outline, and relevant relationships when available

### Requirement: Focused briefs SHALL report dependency direction explicitly
Focused briefs SHALL include dependencies and dependents/reverse dependencies when those relationships can be inferred. They SHALL distinguish internal project/module edges from external package dependencies where available.

#### Scenario: Focused module with dependents
- **WHEN** the agent requests a focused brief for a module used by other workspace modules
- **THEN** the brief lists both the module's dependencies and the modules or files that depend on it

#### Scenario: Internal and external dependencies
- **WHEN** a focused path imports both local project modules and third-party packages
- **THEN** the brief distinguishes internal dependency edges from external dependencies

### Requirement: Brief output SHALL include concise next-query hints when useful
Full-project and focused briefs SHALL end with at most a few targeted next-query hints when those hints help the agent continue efficiently. Hints SHALL be specific to detected relationships and SHALL NOT become a generic boilerplate footer on every response.

#### Scenario: Focused module exposes shared APIs
- **WHEN** a focused brief identifies a module with exports or downstream dependents
- **THEN** the brief may suggest `code_intel affected` before modifying those exports

#### Scenario: Focused file has many relationships
- **WHEN** a focused brief identifies a file with callers, imports, or dependents that need semantic drill-down
- **THEN** the brief may suggest `code_intel callers`, `code_intel implementations`, or raw `lsp` / `tree_sitter` drill-down as appropriate

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
