## ADDED Requirements

### Requirement: Tree-sitter runtime SHALL support the JavaScript and TypeScript file family in v1
The system SHALL recognize and parse `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, and `.cjs` files using Tree-sitter grammars configured by the extension.

#### Scenario: Supported TypeScript file
- **WHEN** a consumer requests Tree-sitter services for `packages/supi-lsp/lsp.ts`
- **THEN** the runtime detects the file as supported and creates or reuses the appropriate TypeScript parser

#### Scenario: Supported TSX file
- **WHEN** a consumer requests Tree-sitter services for `src/component.tsx`
- **THEN** the runtime detects the file as supported and uses the TSX grammar for parsing

#### Scenario: Supported JSX-family file
- **WHEN** a consumer requests Tree-sitter services for `src/component.jsx`
- **THEN** the runtime detects the file as supported and uses the JavaScript grammar family for parsing

### Requirement: Tree-sitter runtime SHALL use packaged WebAssembly grammars
The system SHALL use the portable WASM setup proven in commit `b48ba23e`: `web-tree-sitter` as the runtime, npm grammar packages for JavaScript and TypeScript, and package-relative `.wasm` asset resolution.

#### Scenario: Runtime resolves grammar assets from package metadata
- **WHEN** the first supported JavaScript or TypeScript-family file is parsed
- **THEN** the runtime locates the required grammar package with `createRequire(import.meta.url)` and `require.resolve(<grammar>/package.json)`
- **AND** loads the appropriate `.wasm` grammar asset from that installed package directory

#### Scenario: Runtime does not depend on repository-relative paths
- **WHEN** the extension is loaded through the published `@mrclrchtr/supi` wrapper or directly as `@mrclrchtr/supi-tree-sitter`
- **THEN** grammar asset loading succeeds without assuming the current working directory is the SuPi repository root

### Requirement: Tree-sitter runtime SHALL expose reusable parse and query services
The system SHALL provide reusable runtime services for other extensions to parse supported files, execute Tree-sitter queries, and access structured parse results without reimplementing parser setup.

#### Scenario: Extension requests parse service
- **WHEN** another SuPi extension requests a parse for a supported file
- **THEN** the runtime returns a structured parse result with source metadata and enough package-owned context for follow-up structural extraction
- **AND** it does not require consumers to import private implementation files or parse tool markdown

#### Scenario: Public parse result avoids accidental raw parser coupling
- **WHEN** another extension requests a parse for a supported file
- **THEN** the public result exposes documented structured data and package-owned context
- **AND** raw Tree-sitter parser/tree objects are not exposed unless explicitly documented in the exported TypeScript API

#### Scenario: Extension requests query service
- **WHEN** another SuPi extension submits a valid Tree-sitter query for a supported file
- **THEN** the runtime executes the query against the parsed tree and returns the matching captures with ranges

#### Scenario: Extension imports the service API
- **WHEN** another workspace package imports from `@mrclrchtr/supi-tree-sitter`
- **THEN** it can access documented service acquisition functions and TypeScript types for parse, query, structure, unsupported-language, and error results without importing private implementation files

### Requirement: Runtime service API contract
The system SHALL export the following types and factory from `@mrclrchtr/supi-tree-sitter` so that peer extensions have a stable, typed contract:

```ts
export interface SourceRange {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

export type TreeSitterResult<T> =
  | { kind: "success"; data: T }
  | { kind: "unsupported-language"; file: string; message: string }
  | { kind: "file-access-error"; file: string; message: string }
  | { kind: "validation-error"; message: string }
  | { kind: "runtime-error"; message: string };

export interface OutlineItem {
  name: string;
  kind: string;
  range: SourceRange;
  children?: OutlineItem[];
}

export interface ImportRecord {
  moduleSpecifier: string;
  range: SourceRange;
}

export interface ExportRecord {
  name: string;
  kind: string;
  range: SourceRange;
  moduleSpecifier?: string;
}

export interface NodeAtResult {
  type: string;
  range: SourceRange;
  text: string;
  ancestry: Array<{ type: string; range: SourceRange }>;
}

export interface QueryCapture {
  name: string;
  nodeType: string;
  range: SourceRange;
  text: string;
}

export interface TreeSitterSession {
  parse(file: string): Promise<TreeSitterResult<{ file: string; language: string }>>;
  query(file: string, queryString: string): Promise<TreeSitterResult<QueryCapture[]>>;
  outline(file: string): Promise<TreeSitterResult<OutlineItem[]>>;
  imports(file: string): Promise<TreeSitterResult<ImportRecord[]>>;
  exports(file: string): Promise<TreeSitterResult<ExportRecord[]>>;
  nodeAt(file: string, line: number, character: number): Promise<TreeSitterResult<NodeAtResult>>;
  dispose(): void;
}

export function createTreeSitterSession(cwd: string): TreeSitterSession;
```

#### Scenario: Peer extension uses the service contract
- **WHEN** another extension calls `createTreeSitterSession(cwd).outline("src/index.ts")`
- **THEN** it receives a `TreeSitterResult<OutlineItem[]>` without needing to import internal implementation files

### Requirement: File access SHALL be resolved and reported explicitly
The runtime SHALL resolve requested file paths consistently and return structured file access errors for missing or unreadable files instead of throwing uncaught filesystem exceptions.

#### Scenario: Relative file path
- **WHEN** a consumer requests Tree-sitter services for `src/example.ts` from a pi session rooted at `/repo`
- **THEN** the runtime resolves the file relative to `/repo`
- **AND** returned source metadata identifies the resolved file path

#### Scenario: Missing file
- **WHEN** a consumer requests Tree-sitter services for `src/missing.ts`
- **THEN** the runtime returns a file access error identifying the requested file path and stating that the file could not be read

#### Scenario: Unreadable file
- **WHEN** a consumer requests Tree-sitter services for a supported file that exists but cannot be read
- **THEN** the runtime returns a file access error that includes the file path and the filesystem error message when available

### Requirement: Tree-sitter runtime SHALL initialize parsers lazily and reuse them within a session
The system SHALL load grammars and create parser instances on first use for a supported language, and SHALL reuse those initialized resources for later requests in the same session.

#### Scenario: First parse for a language
- **WHEN** the first TypeScript file is parsed in a session
- **THEN** the runtime initializes `web-tree-sitter`, loads the required grammar assets, and initializes the parser before returning the result

#### Scenario: Subsequent parse for the same language
- **WHEN** another TypeScript-family file is parsed later in the same session
- **THEN** the runtime reuses the already initialized parser resources instead of reinitializing them from scratch

#### Scenario: Parser initialization fails once
- **WHEN** grammar initialization fails because of a transient runtime or filesystem error
- **THEN** the runtime returns a clear runtime failure result
- **AND** a later request SHALL retry initialization instead of permanently caching the failed state for the rest of the session

### Requirement: Tree-sitter runtime SHALL dispose of parser resources on session shutdown
The system SHALL dispose of Tree-sitter parser instances and parsed tree handles when the pi session ends, either on the `session_shutdown` event or when the service session is explicitly torn down.

#### Scenario: Session ends
- **WHEN** the pi session shuts down
- **THEN** the runtime releases all held Tree-sitter parser and language objects to free native WASM memory

### Requirement: Runtime service coordinates SHALL use the public 1-based position convention
The system SHALL accept and return public positions as 1-based `line` and `character` values compatible with the existing `lsp` tool convention. The `character` value SHALL be interpreted as a UTF-16 code-unit column, and any Tree-sitter byte-column positions SHALL be converted at the service boundary.

#### Scenario: Consumer requests node lookup with public coordinates
- **WHEN** a consumer requests node lookup at `line: 10` and `character: 5`
- **THEN** the runtime interprets those as 1-based editor/LSP-compatible coordinates
- **AND** converts them to the runtime representation before querying the syntax tree

#### Scenario: Runtime returns ranges
- **WHEN** a parse, query, outline, import/export, or node lookup result includes a source range
- **THEN** the range uses 1-based `line` and `character` values suitable for display to agents and reuse with other SuPi tools

### Requirement: Unsupported languages SHALL return a clear unsupported-language result
If a file does not belong to a configured Tree-sitter language in the runtime, the system SHALL return an explicit unsupported-language result instead of an empty success or heuristic fallback.

#### Scenario: Unsupported file extension
- **WHEN** a consumer requests Tree-sitter services for `script.py`
- **THEN** the runtime returns an unsupported-language result that identifies the file path and states that no Tree-sitter grammar is configured for it

### Requirement: Invalid queries SHALL return validation errors
If a consumer submits malformed Tree-sitter query syntax, the system SHALL return a structured validation error instead of throwing an uncaught exception or crashing the tool.

#### Scenario: Malformed query string
- **WHEN** a consumer submits an invalid Tree-sitter query for a supported file
- **THEN** the runtime returns a validation error that identifies the query as invalid and includes the parser error message when available
