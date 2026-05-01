## ADDED Requirements

### Requirement: Tree-sitter runtime SHALL support the JavaScript and TypeScript file family in v1
The system SHALL recognize and parse `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, and `.cjs` files using Tree-sitter grammars configured by the extension.

#### Scenario: Supported TypeScript file
- **WHEN** a consumer requests Tree-sitter services for `packages/supi-lsp/lsp.ts`
- **THEN** the runtime detects the file as supported and creates or reuses the appropriate parser

#### Scenario: Supported JSX-family file
- **WHEN** a consumer requests Tree-sitter services for `src/component.jsx`
- **THEN** the runtime detects the file as supported and uses the JavaScript grammar family for parsing

### Requirement: Tree-sitter runtime SHALL expose reusable parse and query services
The system SHALL provide reusable runtime services for other extensions to parse supported files, execute Tree-sitter queries, and access structured parse results without reimplementing parser setup.

#### Scenario: Extension requests parse service
- **WHEN** another SuPi extension requests a parse for a supported file
- **THEN** the runtime returns a parsed syntax tree and metadata needed for follow-up structural extraction

#### Scenario: Extension requests query service
- **WHEN** another SuPi extension submits a valid Tree-sitter query for a supported file
- **THEN** the runtime executes the query against the parsed tree and returns the matching captures with ranges

### Requirement: Tree-sitter runtime SHALL initialize parsers lazily and reuse them within a session
The system SHALL load grammars and create parser instances on first use for a supported language, and SHALL reuse those initialized resources for later requests in the same session.

#### Scenario: First parse for a language
- **WHEN** the first TypeScript file is parsed in a session
- **THEN** the runtime loads the required grammar assets and initializes the parser before returning the result

#### Scenario: Subsequent parse for the same language
- **WHEN** another TypeScript-family file is parsed later in the same session
- **THEN** the runtime reuses the already initialized parser resources instead of reinitializing them from scratch

### Requirement: Unsupported languages SHALL return a clear unsupported-language result
If a file does not belong to a configured Tree-sitter language in the runtime, the system SHALL return an explicit unsupported-language result instead of an empty success or heuristic fallback.

#### Scenario: Unsupported file extension
- **WHEN** a consumer requests Tree-sitter services for `script.py`
- **THEN** the runtime returns an unsupported-language result that identifies the file path and states that no Tree-sitter grammar is configured for it
