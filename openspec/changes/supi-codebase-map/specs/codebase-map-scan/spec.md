# Capability: codebase-map-scan

## Purpose
Language-agnostic project scanning that detects module boundaries and extracts inter-module/file dependencies via regex import patterns.

## ADDED Requirements

### Requirement: Project scanning SHALL detect module boundaries via root markers
The system SHALL scan the working directory at `session_start` using `walkProject` from `supi-core` (max depth 3, excluding `node_modules` and `.git`). It SHALL detect module roots using a broader marker set than LSP: `package.json`, `tsconfig.json`, `jsconfig.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `setup.py`, `setup.cfg`, `requirements.txt`, `Gemfile`, `composer.json`, `mix.exs`, `pom.xml`, `build.gradle`, `CMakeLists.txt`, `Makefile`, `pom.xml`, and `.csproj` files.

#### Scenario: TypeScript monorepo with multiple packages
- **WHEN** the project has `package.json` at root and `packages/*/package.json` in subdirectories
- **THEN** each subdirectory with a `package.json` is detected as a module root
- **AND** the topmost root is also detected if it has its own `package.json`

#### Scenario: Mixed-language project
- **WHEN** the project has `package.json` at root and `Cargo.toml` in `crates/core/`
- **THEN** both module roots are detected — one for JS/TS and one for Rust

#### Scenario: No recognized markers
- **WHEN** no root marker files exist in the project tree
- **THEN** the entire working directory is treated as a single unnamed module

#### Scenario: Nested monorepo roots are deduplicated
- **WHEN** `package.json` exists at both `/project/` and `/project/packages/app/`
- **THEN** `dedupeTopmostRoots` (from supi-core) ensures both are retained as separate modules only if they represent genuinely independent projects per the topmost-root algorithm

### Requirement: Language detection SHALL be inferred from root markers and file extensions
The system SHALL detect which programming languages are present in each module root by examining root marker files and the file extensions of source files within each root.

#### Scenario: TypeScript project
- **WHEN** a module root contains `tsconfig.json`
- **THEN** the module is detected as TypeScript

#### Scenario: Go project
- **WHEN** a module root contains `go.mod`
- **THEN** the module is detected as Go

#### Scenario: Multi-language module
- **WHEN** a module root contains both `package.json` and `Cargo.toml`
- **THEN** the module is detected as both JS/TS and Rust

### Requirement: Import extraction SHALL use per-language regex patterns
The system SHALL extract import/dependency statements from source files using language-specific regex patterns. Each language SHALL have a set of patterns that match its import syntax. The system SHALL support at minimum: JavaScript/TypeScript (`import`/`require`/dynamic `import()`), Python (`import`/`from...import`), Rust (`use`/`mod`), Go (`import`), Ruby (`require`/`require_relative`), Java/Kotlin (`import`).

#### Scenario: TypeScript import extraction
- **WHEN** a file contains `import { foo } from "./bar"`
- **THEN** the extractor reports a dependency on `./bar`

#### Scenario: Python import extraction
- **WHEN** a file contains `from mypackage.mymodule import MyClass`
- **THEN** the extractor reports a dependency on `mypackage.mymodule`

#### Scenario: Go import extraction
- **WHEN** a file contains `import "fmt"` and `import "github.com/foo/bar"`
- **THEN** the extractor reports dependencies on `fmt` and `github.com/foo/bar`

#### Scenario: Unrecognized language
- **WHEN** a source file has an extension not covered by any regex pattern set
- **THEN** the file is included in the module but no imports are extracted from it

### Requirement: Dependency graph SHALL resolve relative imports to module roots
The system SHALL resolve relative import paths (e.g., `./utils`, `../config`) to their target files and then map those targets to the module root they belong to. This produces a module-to-module dependency graph.

#### Scenario: Cross-module import in monorepo
- **WHEN** `packages/supi-ask-user/ask-user.ts` imports from `supi-core/config`
- **THEN** the dependency graph records `supi-ask-user → supi-core`

#### Scenario: Internal import within same module
- **WHEN** `packages/supi-ask-user/render.ts` imports from `./format` (same module)
- **THEN** the import is recorded as internal, not a cross-module dependency

#### Scenario: External dependency
- **WHEN** a file imports from `react` (no relative path, resolves to `node_modules`)
- **THEN** the import is classified as external and excluded from the module dependency graph

### Requirement: File-level scan SHALL extract per-file imports and exports
When requested with `--depth file`, the system SHALL produce a per-file breakdown showing each source file's imports (resolved to file paths) and exported symbols (extracted via regex patterns for `export`/`pub`/`def`/`module` keywords).

#### Scenario: TypeScript file with named exports
- **WHEN** scanning `config.ts` containing `export function loadConfig()` and `export interface Config`
- **THEN** the file-level report lists `loadConfig` and `Config` as exports

#### Scenario: Python file with function definitions
- **WHEN** scanning `utils.py` containing `def process():` and `class Handler:`
- **THEN** the file-level report lists `process` and `Handler` as exports

### Requirement: Scanning SHALL be computed fresh on each session start
The system SHALL compute the codebase map from scratch on every `session_start`. No caching between sessions. The scan SHALL re-run on `/reload`.

#### Scenario: Fresh session
- **WHEN** a new session starts
- **THEN** the full project scan runs from scratch

#### Scenario: Reload triggers rescan
- **WHEN** the user triggers `/reload`
- **THEN** the `session_start` handler re-runs and produces a fresh map
