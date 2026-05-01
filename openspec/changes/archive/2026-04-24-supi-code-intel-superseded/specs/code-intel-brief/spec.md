## ADDED Requirements

### Requirement: Auto-injected architecture overview
The system SHALL generate a lightweight architecture overview and inject it into the agent context on the first `before_agent_start` event of each session.

#### Scenario: New session starts
- **WHEN** a new session starts and the first `before_agent_start` event fires
- **THEN** the system scans the project for workspace packages, extracts module names, descriptions, and dependency edges, and injects a structured overview into the agent context

#### Scenario: Subsequent agent turns in the same session
- **WHEN** `before_agent_start` fires for the second or later agent turn
- **THEN** the system does NOT re-inject the overview (injection happens only once per session)

### Requirement: Overview content structure
The auto-injected overview SHALL include: top-level directory layout, module list with one-line descriptions (from `package.json`), and dependency edges between modules.

#### Scenario: Workspace with multiple packages
- **WHEN** the project has `packages/supi-aliases`, `packages/supi-lsp`, and `packages/supi-core`
- **THEN** the overview lists each package with its description, and notes that `supi-lsp` depends on `supi-core`

### Requirement: Overview size constraint
The auto-injected overview SHALL target under 500 tokens to minimize context overhead.

#### Scenario: Large monorepo
- **WHEN** the project has many packages
- **THEN** the overview is truncated or summarized to stay within the token target, omitting low-level details in favor of module names and dependency edges

### Requirement: On-demand focused brief
The system SHALL support `action: "brief"` to generate a detailed architecture brief for a specific path, including public APIs, dependency analysis, entry points, and key patterns.

#### Scenario: Brief for a specific package
- **WHEN** the agent calls `code_intel` with `action: "brief"`, `path: "packages/supi-ask-user/"`
- **THEN** the tool returns a structured brief containing: purpose (from package.json description), public exports (from LSP symbols), dependencies (imports), dependents (who imports this package), entry points, and key patterns

#### Scenario: Brief for the whole project
- **WHEN** the agent calls `code_intel` with `action: "brief"` and no `path` parameter
- **THEN** the tool returns the full architecture brief equivalent to the auto-injected overview but with additional detail (public APIs per module)

#### Scenario: Brief for a non-existent path
- **WHEN** the agent calls `code_intel` with `action: "brief"`, `path: "packages/nonexistent/"`
- **THEN** the tool returns an error: "Path not found: <path>"
