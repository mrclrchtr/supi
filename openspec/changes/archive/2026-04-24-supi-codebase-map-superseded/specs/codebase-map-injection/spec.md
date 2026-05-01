# Capability: codebase-map-injection

## Purpose
Format and inject a compact module-level dependency map into the system prompt at session start so agents have immediate structural context.

## ADDED Requirements

### Requirement: Session start SHALL produce a compact module-level map
The system SHALL format the scanned dependency graph as a compact text summary suitable for LLM consumption. The summary SHALL include: total module count, language(s) detected, a listing of each module with its dependencies (other modules it imports), and identification of leaf modules (no internal dependencies) and entry-point modules (depended on by others but not importing from internal modules).

#### Scenario: Supi monorepo map
- **WHEN** scanning the supi monorepo with 8 packages
- **THEN** the summary lists all 8 modules, shows that `supi-core` is a leaf, shows that `supi` (meta-package) depends on all others, and shows the language as TypeScript

#### Scenario: Single-module project
- **WHEN** scanning a project with no sub-module markers (just a root `package.json`)
- **THEN** the summary lists one module with no inter-module dependencies

#### Scenario: Mixed-language project
- **WHEN** scanning a project with JS/TS and Rust modules
- **THEN** the summary shows both languages and which modules are which language

### Requirement: Module map SHALL be injected via promptGuidelines
The system SHALL inject the formatted module-level map into the system prompt using the `promptGuidelines` mechanism during the `session_start` handler. The injection SHALL use the `<extension-context>` tag from `supi-core` wrapped in a `## Codebase Structure` section.

#### Scenario: Session start injection
- **WHEN** a session starts in a project with detected modules
- **THEN** the system prompt contains a `## Codebase Structure` section with the module map inside an `<extension-context>` tag

#### Scenario: Empty project
- **WHEN** a session starts in a directory with no detected module markers or source files
- **THEN** no codebase structure section is injected into the system prompt

### Requirement: Map format SHALL be token-efficient
The formatted map SHALL use a dense, line-oriented format. Each module SHALL appear on one line with its dependencies listed inline. The format SHALL avoid redundant information and repetitive structure.

#### Scenario: Dense format for multi-module project
- **WHEN** formatting a project with 5 modules
- **THEN** the output uses a format like:
  ```
  supi-core (leaf)
  supi-aliases (leaf)
  supi-ask-user → supi-core
  supi-claude-md → supi-core
  supi → supi-aliases, supi-ask-user, supi-claude-md
  ```
  rather than a verbose multi-line-per-module format
