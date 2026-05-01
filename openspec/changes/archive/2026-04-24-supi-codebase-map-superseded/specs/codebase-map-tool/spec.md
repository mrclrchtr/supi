# Capability: codebase-map-tool

## Purpose
Registered pi tool for on-demand codebase exploration at module or file granularity.

## ADDED Requirements

### Requirement: The system SHALL register a `codebase_map` tool
The extension SHALL register a tool named `codebase_map` with parameters: `focus` (optional file or directory path) and `depth` (optional, one of `module` or `file`, default `module`).

#### Scenario: Tool registration
- **WHEN** the extension loads at session start
- **THEN** a `codebase_map` tool is registered and visible to the agent

#### Scenario: Tool with default parameters
- **WHEN** the agent calls `codebase_map` with no parameters
- **THEN** the tool returns the full module-level dependency graph (equivalent to the session-start injection but as a tool result)

### Requirement: Module depth SHALL show inter-module dependencies for the focus area
When `depth` is `module`, the tool SHALL return the dependency subgraph relevant to the `focus` path. If no `focus` is given, it SHALL return the full module graph. The output SHALL show: module name, its dependencies, modules that depend on it (reverse dependencies), and detected language.

#### Scenario: Focus on specific module
- **WHEN** the agent calls `codebase_map` with `focus: "packages/supi-ask-user/"` and `depth: "module"`
- **THEN** the tool returns `supi-ask-user`'s dependencies (`supi-core`, `pi-tui`, `pi-agent`) and reverse dependencies (`supi/ask-user.ts`)

#### Scenario: Focus on directory containing multiple modules
- **WHEN** the agent calls `codebase_map` with `focus: "packages/"` and `depth: "module"`
- **THEN** the tool returns the dependency graph for all modules under `packages/`

#### Scenario: No focus specified
- **WHEN** the agent calls `codebase_map` with `depth: "module"` and no `focus`
- **THEN** the tool returns the complete module dependency graph for the project

### Requirement: File depth SHALL show per-file imports, exports, and internal graph
When `depth` is `file`, the tool SHALL return a per-file breakdown for the `focus` area. Each file SHALL list its extracted imports (resolved to file paths), extracted exports (public symbols), and internal cross-references. The output SHALL include a file-level dependency graph showing the internal structure.

#### Scenario: File depth on a module directory
- **WHEN** the agent calls `codebase_map` with `focus: "packages/supi-ask-user/"` and `depth: "file"`
- **THEN** the tool returns each `.ts` file with its imports and exports, plus an internal dependency graph

#### Scenario: File depth on a single file
- **WHEN** the agent calls `codebase_map` with `focus: "packages/supi-ask-user/ask-user.ts"` and `depth: "file"`
- **THEN** the tool returns imports, exports, and callers of that specific file

### Requirement: Tool output SHALL optionally enrich via LSP when available
When `depth` is `file` and an LSP server is running for the relevant files (via supi-lsp peer dependency), the tool MAY enrich the export list using `documentSymbol` and the caller list using `references`. LSP enrichment is best-effort — if no LSP is available, the tool returns regex-only results.

#### Scenario: LSP enrichment available
- **WHEN** the agent calls `codebase_map` with `depth: "file"` and a TypeScript LSP server is running
- **THEN** the export list is enriched with accurate symbol information from `documentSymbol`

#### Scenario: No LSP available
- **WHEN** the agent calls `codebase_map` with `depth: "file"` and no LSP server is running
- **THEN** the tool returns regex-extracted imports and exports without LSP enrichment

#### Scenario: LSP partially available
- **WHEN** the agent calls `codebase_map` for a mixed-language project where only the TS LSP is running
- **THEN** TS files get LSP enrichment; files in other languages fall back to regex-only results
