## ADDED Requirements

### Requirement: XML tag wrapper function

The `supi-core` package SHALL export a `wrapExtensionContext(source: string, content: string, attrs?: Record<string, string | number>): string` function. It SHALL produce an XML block with an opening `<extension-context source="...">` tag, the content, and a closing `</extension-context>` tag. Additional attributes SHALL be rendered as `key="value"` pairs on the opening tag.

#### Scenario: Basic wrapping without attributes

- **WHEN** called with `wrapExtensionContext("supi-lsp", "Outstanding diagnostics:\n- foo.ts: 1 error")`
- **THEN** the output SHALL be:
  ```
  <extension-context source="supi-lsp">
  Outstanding diagnostics:
  - foo.ts: 1 error
  </extension-context>
  ```

#### Scenario: Wrapping with attributes

- **WHEN** called with `wrapExtensionContext("supi-claude-md", "file content", { file: "packages/foo/CLAUDE.md", turn: 5 })`
- **THEN** the output SHALL be:
  ```
  <extension-context source="supi-claude-md" file="packages/foo/CLAUDE.md" turn="5">
  file content
  </extension-context>
  ```

#### Scenario: No attributes

- **WHEN** called with `attrs` as `undefined` or omitted
- **THEN** the opening tag SHALL contain only the `source` attribute

### Requirement: Tag is parseable for state reconstruction

The `<extension-context>` tag format SHALL be machine-parseable via simple regex. The `source`, `file`, and `turn` attributes SHALL be extractable from the opening tag string.

#### Scenario: Parse source and file from tag

- **WHEN** a tool result contains `<extension-context source="supi-claude-md" file="packages/foo/CLAUDE.md" turn="5">`
- **THEN** a regex SHALL be able to extract `source: "supi-claude-md"`, `file: "packages/foo/CLAUDE.md"`, `turn: "5"`

### Requirement: Consistent tag format across SuPi extensions

All SuPi extensions that inject context into LLM messages SHALL use the `<extension-context source="...">` tag format provided by `supi-core`. The `source` attribute SHALL identify the producing extension.

#### Scenario: supi-claude-md uses the tag

- **WHEN** `supi-claude-md` injects subdirectory or root context
- **THEN** it SHALL use `wrapExtensionContext("supi-claude-md", ...)` from `supi-core`

#### Scenario: supi-lsp adopts the tag (future)

- **WHEN** `supi-lsp` adopts `supi-core` in a follow-up change
- **THEN** it SHALL use `wrapExtensionContext("supi-lsp", ...)` instead of inline string concatenation
