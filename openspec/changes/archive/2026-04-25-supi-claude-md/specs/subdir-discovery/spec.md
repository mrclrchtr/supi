## ADDED Requirements

### Requirement: Discover context files in subdirectories on file access

The extension SHALL discover `CLAUDE.md` / `AGENTS.md` files in subdirectories below cwd when the agent accesses files there via `read`, `write`, `edit`, `ls`, or `lsp` tools. Discovery SHALL walk up from the accessed file's directory toward cwd, collecting all matching context files. Discovery SHALL stop at cwd and SHALL NOT walk above it.

#### Scenario: Agent reads a file in a subdirectory with CLAUDE.md

- **WHEN** the agent reads `packages/supi-lsp/src/index.ts` and `packages/supi-lsp/CLAUDE.md` exists
- **THEN** the extension SHALL inject the content of `packages/supi-lsp/CLAUDE.md` into the tool result

#### Scenario: Agent reads a file in a deeply nested directory

- **WHEN** the agent reads `packages/supi-lsp/src/utils/helpers.ts` and both `packages/supi-lsp/CLAUDE.md` and `packages/CLAUDE.md` exist
- **THEN** the extension SHALL inject both context files, ordered from nearest to farthest ancestor

#### Scenario: No context file exists in subdirectory chain

- **WHEN** the agent reads a file and no CLAUDE.md / AGENTS.md exists between the file's directory and cwd
- **THEN** the extension SHALL NOT modify the tool result

### Requirement: Inject subdirectory context via tool_result augmentation

The extension SHALL append discovered context file content to the `tool_result` content array as additional text entries. The injected content SHALL be wrapped in `<extension-context source="supi-claude-md" file="<relative-path>" turn="<N>">` XML tags. The tool result SHALL NOT be modified in any other way.

#### Scenario: Context appended to read tool result

- **WHEN** a subdirectory context file is discovered during a `read` tool call
- **THEN** the original tool result content SHALL remain unchanged and the context file content SHALL be appended as an additional text content entry

#### Scenario: Context appended to write tool result

- **WHEN** a subdirectory context file is discovered during a `write` tool call
- **THEN** the context file content SHALL be appended to the tool result

### Requirement: Deduplicate against pi natively loaded context files

The extension SHALL NOT inject context files that pi has already loaded natively. On each `before_agent_start`, the extension SHALL read `event.systemPromptOptions.contextFiles` to determine which paths are already loaded and SHALL skip those paths during subdirectory discovery.

#### Scenario: Pi already loaded a subdirectory context file

- **WHEN** pi is launched from `packages/supi-lsp/` and has natively loaded `packages/supi-lsp/CLAUDE.md`
- **THEN** the extension SHALL NOT re-inject that file on file access within that directory

#### Scenario: Pi loaded ancestor files but not subdirectory file

- **WHEN** pi loaded `/project/CLAUDE.md` natively but `packages/supi-lsp/CLAUDE.md` exists and was not loaded
- **THEN** the extension SHALL inject `packages/supi-lsp/CLAUDE.md` on file access

### Requirement: Track injected directories to avoid duplicate injection

The extension SHALL track which directories have had their context files injected and the turn number of injection. The extension SHALL NOT re-inject a directory's context file if it was already injected within the last N turns (where N is the configured `rereadInterval`).

#### Scenario: Agent reads multiple files in same directory within interval

- **WHEN** the agent reads `packages/supi-lsp/src/a.ts` (injecting context at turn 2) then reads `packages/supi-lsp/src/b.ts` at turn 3
- **THEN** the extension SHALL NOT re-inject `packages/supi-lsp/CLAUDE.md` on the second read

#### Scenario: Agent reads file in same directory after interval expires

- **WHEN** the agent reads a file in `packages/supi-lsp/` at turn 2 (context injected) and reads another file at turn 8 (with `rereadInterval: 3`)
- **THEN** the extension SHALL re-inject the context file (stale refresh)

### Requirement: Reset injection tracking after compaction

The extension SHALL clear all subdirectory injection tracking when compaction occurs. After compaction, the next file access in any previously-injected directory SHALL trigger a fresh injection.

#### Scenario: Compaction clears tracking

- **WHEN** compaction occurs and the agent subsequently reads a file in a previously-injected directory
- **THEN** the extension SHALL inject the context file as if it were the first access

### Requirement: Reconstruct subdirectory injection state on session start

The extension SHALL reconstruct its injection tracking state from session history on `session_start`. It SHALL scan tool result messages in the current branch for `<extension-context source="supi-claude-md" file="..." turn="...">` tags and rebuild the injected directories map.

#### Scenario: Extension reloads and reconstructs state

- **WHEN** the extension is reloaded via `/reload`
- **THEN** the extension SHALL reconstruct which directories were already injected and at which turn, and SHALL NOT re-inject them unless stale

### Requirement: Extract file paths from supported tools

The extension SHALL extract the accessed file path from `event.input` for these tools:
- `read`: `event.input.path`
- `write`: `event.input.path`
- `edit`: `event.input.path`
- `ls`: `event.input.path`
- `lsp`: `event.input.file`

The extension SHALL NOT attempt to extract paths from `bash`, `grep`, or `find` tool inputs.

#### Scenario: Path extracted from each supported tool

- **WHEN** the agent uses `read` with `{ path: "packages/foo/bar.ts" }`
- **THEN** the extension SHALL use `packages/foo/bar.ts` to discover subdirectory context files

#### Scenario: Unsupported tool is ignored

- **WHEN** the agent uses `bash` with a command referencing files in a subdirectory
- **THEN** the extension SHALL NOT attempt to discover or inject context files

### Requirement: Support configurable context file names

The extension SHALL look for context files matching the configured `fileNames` list (default: `["CLAUDE.md", "AGENTS.md"]`). In each directory, it SHALL check file names in list order and include the first match found per directory.

#### Scenario: Custom file name configured

- **WHEN** `fileNames` is configured as `["INSTRUCTIONS.md", "CLAUDE.md"]` and a directory contains both
- **THEN** the extension SHALL inject `INSTRUCTIONS.md` (first match)

#### Scenario: Default file names

- **WHEN** no custom `fileNames` is configured and a directory contains `AGENTS.md` but not `CLAUDE.md`
- **THEN** the extension SHALL inject `AGENTS.md`
