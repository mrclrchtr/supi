## MODIFIED Requirements

### Requirement: Native context files outside the project tree are excluded from refresh
`readNativeContextFiles` SHALL NOT return files for SuPi root refresh re-injection. All files supplied by pi through `systemPromptOptions.contextFiles` SHALL be treated as native system-prompt context and excluded from SuPi refresh payloads, regardless of whether the resolved path is outside cwd, at cwd, or below cwd. The extension MAY continue to inspect native context paths for subdirectory deduplication, but it SHALL NOT use native context file contents to build a refresh message.

#### Scenario: Home directory AGENTS.md is excluded
- **WHEN** `contextFiles` contains `{ path: "/Users/alice/AGENTS.md", content: "..." }` and `cwd` is `/Users/alice/projects/myapp`
- **THEN** the file SHALL NOT appear in any returned refresh-file array

#### Scenario: Project-level CLAUDE.md is excluded
- **WHEN** `contextFiles` contains `{ path: "/Users/alice/projects/myapp/CLAUDE.md", content: "..." }` and `cwd` is `/Users/alice/projects/myapp`
- **THEN** the file SHALL NOT appear in any returned refresh-file array

#### Scenario: Native subdirectory CLAUDE.md is excluded
- **WHEN** `contextFiles` contains `{ path: "/Users/alice/projects/myapp/packages/foo/CLAUDE.md", content: "..." }` and `cwd` is `/Users/alice/projects/myapp`
- **THEN** the file SHALL NOT appear in any returned refresh-file array

#### Scenario: Files with no path or content are excluded
- **WHEN** `contextFiles` contains `{ path: undefined, content: "..." }` or `{ path: "/foo.md", content: undefined }`
- **THEN** the entry SHALL NOT appear in any returned refresh-file array
