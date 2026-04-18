# Native Context Scoping

Purpose: Ensure native context files outside the project tree are excluded from root refresh re-injection.

## Requirements

### Requirement: Native context files outside the project tree are excluded from refresh
`readNativeContextFiles` SHALL accept a `cwd` parameter and SHALL exclude any file whose resolved path is outside the project tree (i.e., `path.relative(cwd, filePath)` starts with `..` or is an absolute path).

#### Scenario: Home directory AGENTS.md is excluded
- **WHEN** `contextFiles` contains `{ path: "/Users/alice/AGENTS.md", content: "..." }` and `cwd` is `/Users/alice/projects/myapp`
- **THEN** the file SHALL NOT appear in the returned array

#### Scenario: Project-level CLAUDE.md is included
- **WHEN** `contextFiles` contains `{ path: "/Users/alice/projects/myapp/CLAUDE.md", content: "..." }` and `cwd` is `/Users/alice/projects/myapp`
- **THEN** the file SHALL appear in the returned array

#### Scenario: Subdirectory CLAUDE.md is included
- **WHEN** `contextFiles` contains `{ path: "/Users/alice/projects/myapp/packages/foo/CLAUDE.md", content: "..." }` and `cwd` is `/Users/alice/projects/myapp`
- **THEN** the file SHALL appear in the returned array

#### Scenario: Files with no path or content are excluded
- **WHEN** `contextFiles` contains `{ path: undefined, content: "..." }` or `{ path: "/foo.md", content: undefined }`
- **THEN** the entry SHALL NOT appear in the returned array
