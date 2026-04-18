## Context

supi-claude-md's root refresh reads all files from `systemPromptOptions.contextFiles` and re-emits them as persistent messages every N turns. pi walks from cwd up to home, loading `CLAUDE.md`/`AGENTS.md` along the way — so when a project is below `~`, files like `~/AGENTS.md` appear in `contextFiles`. The extension re-wraps all of them in `<extension-context>` tags, duplicating files that pi already provides natively.

## Goals / Non-Goals

**Goals:**
- Filter native context files to only those within the project tree (cwd) before re-injection
- Eliminate double-injection of home-directory context files
- Preserve pi's native loading of those files (extension doesn't touch the system prompt itself)

**Non-Goals:**
- Changing how pi discovers or loads context files natively (that's pi's domain)
- Changing the `fileNames` config (that only affects subdirectory discovery, which already stops at cwd)
- Filtering subdirectory discovery (already correctly scoped to cwd)

## Decisions

### Decision: Filter in `readNativeContextFiles` using `path.relative`

Add a `cwd` parameter to `readNativeContextFiles`. Use `path.relative(cwd, filePath)` — if the result starts with `..` or is absolute, the file is outside the project tree and is excluded.

**Why here:** `readNativeContextFiles` is the boundary between "raw pi data" and "what the extension emits." Filtering at this point keeps the rest of the pipeline unchanged.

**Alternatives considered:**
- Filter in `formatRefreshContext` — would work but mixes formatting with filtering concerns
- Filter in `captureNativePaths` — that only records paths on first call, not used for refresh content

### Decision: Use `path.resolve` + `path.relative` for boundary check

Same pattern already used in `findSubdirContextFiles` in `discovery.ts`. Consistent with existing code.

## Risks / Trade-offs

- **Users with intentional `~/AGENTS.md` cross-project instructions** → pi still loads it natively into the system prompt. The extension just stops duplicating it in refresh messages. No information is lost.
- **Worktrees or symlinked cwd** → `path.resolve` follows the real path. If cwd is a symlink, `path.relative` still correctly resolves the boundary. Same pattern as `discovery.ts` which already works.
