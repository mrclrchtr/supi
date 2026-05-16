// Prompt guidance and tool description for the code_intel tool.

export const toolDescription = `Code intelligence tool — architecture briefs, semantic relationships, impact analysis, structured text search, and project indexing.

Actions:
- brief: Architecture overview or focused brief for a project, package, directory, file, or anchored symbol
- callers: Find call sites for a symbol, or analyze a file-level export surface when only \`file\` is provided
- callees: Best-effort outgoing calls from a symbol (structural tree-sitter analysis across supported grammars)
- implementations: Find concrete implementations of an interface or abstract type
- affected: Blast-radius analysis for a symbol or exported file surface — direct references, downstream dependents, risk level, likely tests
- pattern: Bounded text search with grouped matches, context lines, structured \`kind\` filters (\`definition\` | \`export\` | \`import\`), partial-result warnings on oversized structured scans, and regex opt-in via \`regex: true\`
- index: Factual project map — file counts by language, top-level directory tree, landmark config files

Coordinates are 1-based (line, character) with UTF-16 character columns, matching lsp and tree_sitter conventions.
Relative paths resolve from the session working directory. A leading @ on path/file is stripped automatically.

Examples:
  { "action": "brief" }
  { "action": "brief", "path": "packages/supi-lsp/" }
  { "action": "brief", "file": "packages/supi-lsp/lsp.ts", "line": 42, "character": 7 }
  { "action": "callers", "file": "packages/supi-core/index.ts" }
  { "action": "callers", "symbol": "registerSettings", "path": "packages/supi-core/" }
  { "action": "callees", "file": "src/handler.ts", "line": 88, "character": 12 }
  { "action": "implementations", "symbol": "SessionLspService", "path": "packages/" }
  { "action": "affected", "file": "packages/supi-core/index.ts" }
  { "action": "pattern", "pattern": "registerSettings", "path": "packages/", "maxResults": 10 }
  { "action": "pattern", "pattern": "register(Settings|Config)", "path": "packages/", "regex": true, "maxResults": 10 }
  { "action": "pattern", "pattern": "payment", "kind": "definition", "path": "src/" }`;

export const promptSnippet =
  "Use the code_intel tool for architecture orientation, semantic relationships, impact analysis, and structured search before broad file reads.";

export const promptGuidelines = [
  "Use `code_intel brief` before editing an unfamiliar package, directory, or file to get architecture context and reduce blind reads.",
  "Use `code_intel affected` before changing exported APIs, shared helpers, config surfaces, or cross-package contracts to check blast radius and risk; file-only requests now expand across exported targets when possible.",
  "Use `code_intel callers` before modifying a function to verify all call sites; use `callees` and `implementations` for dependency and interface analysis, and use file-only `callers` when you need the export surface of a module.",
  'Use `code_intel pattern` for bounded, scope-aware text search when the question is textual rather than semantic; it treats patterns as literal strings by default, supports `regex: true`, supports `kind: "definition" | "export" | "import"` for structured searches, and may return a partial-result warning when a structured scan is too broad.',
  "Use `code_intel brief` and `code_intel affected` priority signals to notice diagnostics, low coverage, or unused-code hints before editing risky files.",
  "Use `code_intel index` for a factual project map (file counts, directory structure, landmark files) when you need to orient yourself in a new codebase.",
  "After `code_intel` narrows the target, use raw `lsp` and `tree_sitter` tools for precise drill-down on exact symbols, types, or AST nodes.",
  "Do not prefer `code_intel` over direct file reads or lower-level tools for trivial, already-localized edits or exact symbol/AST drill-down tasks.",
];
