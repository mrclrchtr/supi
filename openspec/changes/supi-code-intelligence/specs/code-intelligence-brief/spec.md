## ADDED Requirements

### Requirement: Code intelligence SHALL inject an architecture overview once per session
The system SHALL generate a lightweight architecture overview and inject it into the agent context on the first `before_agent_start` event of each session. It SHALL NOT re-inject the overview on later agent turns in the same session.

#### Scenario: First agent turn in a new session
- **WHEN** a new session reaches its first `before_agent_start`
- **THEN** the system generates a compact architecture overview and injects it into the agent context

#### Scenario: Subsequent agent turn in the same session
- **WHEN** `before_agent_start` fires again later in the same session
- **THEN** the system does not inject the architecture overview again

#### Scenario: Reload or resume with an existing overview on the active branch
- **WHEN** the extension reloads or the user resumes a session whose active branch already contains the code-intelligence overview message
- **THEN** the system does not inject a duplicate overview for that active branch

### Requirement: The auto-injected overview SHALL be compact, structural, and actionable
The auto-injected overview SHALL summarize top-level project layout, module/package names, one-line purpose descriptions when available, and key dependency edges. It SHALL prefer concise summaries over detailed API listings and SHOULD usually stay well below 500 tokens, using a much smaller budget in the common case and reserving the upper end only for unusually complex repositories. By default it SHOULD stay within a small predictable budget such as roughly eight modules/packages, roughly eight dependency edges, and at most one follow-up hint. It SHALL be built from cheap metadata and readily available structural data first, with deeper enrichment treated as opportunistic. When space allows, it SHOULD include a brief hint that richer focused context is available through `code_intel brief` instead of expanding the injected context itself.

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

#### Scenario: Deep enrichment would be slow
- **WHEN** LSP, Tree-sitter, or repository scans would require slow whole-project work during the first agent turn
- **THEN** the overview uses the best cheap architecture model available and points the agent to an on-demand `code_intel brief` for deeper context

#### Scenario: Agent needs deeper context
- **WHEN** the compact overview omits details for token budget reasons
- **THEN** it nudges the agent toward a focused `code_intel brief` query rather than dumping additional detail automatically

### Requirement: Brief generation SHOULD focus on source structure rather than low-signal artifacts by default
Brief generation SHOULD prioritize source structure, public/shared surfaces, and likely human-edited files rather than obvious generated, build-output, vendored, dependency-output, or cache-like artifacts by default. If the requested focus path explicitly targets such a location, the tool MAY include it normally.

#### Scenario: Brief target includes both source and generated artifacts
- **WHEN** a brief would otherwise emphasize both project source structure and obvious generated/build/vendor outputs
- **THEN** the brief prioritizes the source structure by default

#### Scenario: Agent explicitly briefs a generated path
- **WHEN** the agent calls `code_intel` with `action: "brief"` and a focus path inside a generated or build-output location
- **THEN** the tool respects that focus path instead of filtering it out

### Requirement: Code intelligence SHALL handle projects without a detectable architecture model
If no project metadata, modules, or source structure can be detected, the system SHALL avoid noisy empty architecture sections. It SHALL either skip auto-injection or inject a short note that no structured project model was detected.

#### Scenario: Empty project
- **WHEN** the first `before_agent_start` occurs in a directory with no recognizable project metadata or source files
- **THEN** the system does not inject an empty module map

#### Scenario: Source-only project without module metadata
- **WHEN** source files exist but no package/module metadata can be detected
- **THEN** the overview uses the limited detected structure or reports that only a minimal project model is available

### Requirement: Brief output SHALL stay predictably bounded and low-noise
Brief output SHALL stay predictably bounded so agents can treat `code_intel brief` as a cheap first stop. By default, on-demand briefs SHOULD surface a ranked summary plus no more than roughly three “start here” files/symbols, roughly five notable public surfaces, and at most two next-query hints unless the agent explicitly asks for more scope. Brief output SHALL omit empty sections, avoid boilerplate confidence explanations when they do not affect actionability, and prefer ranked summaries over exhaustive import/export dumps.

#### Scenario: Large package brief
- **WHEN** the agent requests a brief for a package or directory with many files and exports
- **THEN** the brief returns a ranked summary with bounded high-value targets and reports omitted detail instead of dumping every file or export

#### Scenario: Brief has no meaningful section content
- **WHEN** a potential brief section would be empty or low-signal
- **THEN** the tool omits that section rather than rendering a noisy placeholder heading

### Requirement: The system SHALL support `action: "brief"` for project, module, directory, file, and anchored-symbol briefs
The `code_intel` tool SHALL support `action: "brief"` to generate a structured architecture brief for the whole project or for a specific file or directory path. Focused briefs SHALL cover project-level, module/directory-level, single-file focus paths, and anchored file-position briefs where those targets exist.

#### Scenario: Full-project brief
- **WHEN** the agent calls `code_intel` with `action: "brief"` and no `path`
- **THEN** the tool returns a project-level brief covering major modules, dependency relationships, and notable entrypoints or patterns

#### Scenario: Focused brief for a package
- **WHEN** the agent calls `code_intel` with `action: "brief"` and `path: "packages/supi-lsp/"`
- **THEN** the tool returns a focused brief describing that package's purpose, internal structure, dependencies, dependents, and notable exports or entrypoints

#### Scenario: Focused brief for a single file
- **WHEN** the agent calls `code_intel` with `action: "brief"` and a file path
- **THEN** the tool returns a file-focused brief describing the file's containing module, imports, exports, outline, and relevant relationships when available

#### Scenario: Focused brief for an enclosing symbol
- **WHEN** the agent calls `code_intel` with `action: "brief"`, `file`, `line`, and `character`
- **THEN** the tool returns a brief for the enclosing symbol or syntax node when LSP or Tree-sitter can identify one
- **AND** the brief includes the containing file/module plus imports, exports, callers or next-query hints when available

### Requirement: Focused briefs SHOULD include a compact "start here" section when useful
Focused package, directory, file, or anchored-symbol briefs SHOULD include a compact "start here" section when the target is non-trivial. This section SHOULD name one to three files, symbols, or entrypoints most likely to help the agent inspect or modify the target efficiently, with a short reason for each recommendation.

#### Scenario: Agent briefs an unfamiliar package
- **WHEN** the agent requests a brief for a package with multiple entrypoints or layers
- **THEN** the brief highlights a small ranked set of files or symbols to inspect first and explains why they matter

#### Scenario: Focused file brief is already obvious
- **WHEN** the target is a small self-contained file with no more informative sub-targets
- **THEN** the tool may omit the "start here" section rather than restating the file itself as boilerplate

### Requirement: Briefs SHALL surface entrypoints and public API surfaces when useful
Project and module-level briefs SHALL highlight notable entrypoints, exported surfaces, settings/config entrypoints, or other public/shared APIs when those surfaces can be inferred cheaply. They SHOULD prioritize the most relevant public surfaces rather than enumerating every export.

#### Scenario: Workspace package with a public entrypoint
- **WHEN** the agent requests a brief for a package that exposes a documented entrypoint or notable exported surface
- **THEN** the brief highlights that entrypoint or API surface near the top of the result

#### Scenario: Module with many exports
- **WHEN** a module exports many symbols
- **THEN** the brief highlights the most relevant public exports or shared surfaces rather than dumping the entire export list inline

### Requirement: Focused briefs SHALL report dependency direction explicitly
Focused briefs SHALL include dependencies and dependents/reverse dependencies when those relationships can be inferred. They SHALL distinguish internal project/module edges from external package dependencies where available.

#### Scenario: Focused module with dependents
- **WHEN** the agent requests a focused brief for a module used by other workspace modules
- **THEN** the brief lists both the module's dependencies and the modules or files that depend on it

#### Scenario: Internal and external dependencies
- **WHEN** a focused path imports both local project modules and third-party packages
- **THEN** the brief distinguishes internal dependency edges from external dependencies

### Requirement: Brief output SHALL include concise next-query hints when useful
Full-project and focused briefs SHALL end with at most two targeted next-query hints when those hints help the agent continue efficiently. Hints SHALL be specific to detected relationships and SHALL NOT become a generic boilerplate footer on every response. When the relevant target is known, hints SHOULD include copyable parameter values such as `path`, `file`, 1-based `line`, 1-based `character`, or `symbol` so the agent can issue the next query without extra file reads. When a follow-up `code_intel` query is strongly implied, hints SHOULD include a compact copyable rerun example with concrete parameter values.

#### Scenario: Focused module exposes shared APIs
- **WHEN** a focused brief identifies a module with exports or downstream dependents
- **THEN** the brief may suggest `code_intel affected` before modifying those exports, including the path or anchored target when available

#### Scenario: Focused file has many relationships
- **WHEN** a focused brief identifies a file with callers, callees, imports, or dependents that need semantic drill-down
- **THEN** the brief may suggest `code_intel callers`, `code_intel callees`, `code_intel implementations`, or raw `lsp` / `tree_sitter` drill-down as appropriate

### Requirement: Brief generation SHALL combine base architecture data with optional enrichment
The system SHALL build briefs from project metadata and structural analysis, and SHALL enrich them with LSP and Tree-sitter data when those sources are available and useful. When some enrichment sources are unavailable, unsupported, or not useful for the target, the brief SHALL return the best bounded result available, state the effective confidence mode using the shared vocabulary (`semantic`, `structural`, `heuristic`, or `unavailable`), and, when useful, recommend the next best follow-up query or retry. In v1, correctness, token efficiency, and usable summaries take precedence over latency optimization; the tool MAY wait for higher-confidence enrichment instead of emitting an early partial answer solely for responsiveness.

#### Scenario: LSP and Tree-sitter both available
- **WHEN** the focused path is in a language supported by both `supi-lsp` and `supi-tree-sitter`
- **THEN** the brief includes semantic details such as public symbols or references alongside structural details such as imports, exports, and outline information

#### Scenario: LSP unavailable but structural analysis available
- **WHEN** LSP is unavailable for the focused path but Tree-sitter support exists
- **THEN** the brief still returns structural information from project metadata and Tree-sitter analysis without failing the action
- **AND** it labels the brief as `structural` rather than `semantic` when that distinction matters

#### Scenario: Semantic enrichment is still pending
- **WHEN** LSP-backed enrichment is still pending and semantic results are likely to materially improve the brief
- **THEN** the tool MAY wait for higher-confidence enrichment rather than returning an early structural brief purely for responsiveness
- **AND** if semantic enrichment ultimately proves unavailable or unsupported, the tool returns the best bounded structural, heuristic, or unavailable result with clear confidence labeling

### Requirement: Brief results SHALL expose structured details metadata in addition to markdown
In addition to markdown content for the model, `brief` results SHALL include compact structured `details` metadata suitable for tests, renderers, and future automation. Where applicable, `details` SHOULD include confidence mode from the shared vocabulary, focus target identity, start-here targets, detected entrypoints/public surfaces, dependency summaries, omitted counts, and suggested next queries.

#### Scenario: Brief result includes metadata
- **WHEN** a `code_intel` `brief` action succeeds
- **THEN** the tool result includes markdown content for the model and a compact `details` object describing the structured brief

### Requirement: Brief requests for missing paths SHALL return a clear error
If the agent requests a brief for a path that does not exist, the tool SHALL return a clear error naming the missing path.

#### Scenario: Missing path
- **WHEN** the agent calls `code_intel` with `action: "brief"` and `path: "packages/does-not-exist/"`
- **THEN** the tool returns an error indicating that the path was not found
