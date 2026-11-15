# CLAUDE.md Update Guidelines

## Core Principle

Every token must earn its place in the instruction file. The context window is precious — if content doesn't save future sessions more time than it costs to read, remove it.

**Hard cap: no instruction file should exceed 200 lines.** Above 200 lines, every line must fight for its place against removal. When auditing, files over 200 lines get a massive score downgrade — prioritize removals over additions.

## What TO Add

### 1. Non-Obvious Commands & Workflows

```markdown
## Workflow

Pre-push hook runs `pnpm verify` — covers both lint and tests; don't run them separately.
`pnpm exec biome check --write --unsafe <files>` — auto-fixes unused imports (regular `--write` doesn't).
```

Why: These aren't obvious from package.json or README. Saves future sessions from discovering them the hard way.

Routine commands like `npm install`, `npm test`, `npm run build`, `npm run lint` are trivially discoverable from `package.json` — skip them. Focused test paths (`pnpm vitest run packages/<pkg>/<path>`) are equally discoverable from the file tree — skip those too.

### 2. Gotchas and Non-Obvious Patterns

```markdown
## Gotchas

- Tests must run sequentially (`--runInBand`) due to shared DB state
- `yarn.lock` is authoritative; delete `node_modules` if deps mismatch
```

Why: Prevents repeating debugging sessions.

### 3. Package Relationships

```markdown
## Dependencies

The `auth` module depends on `crypto` being initialized first.
Import order matters in `src/bootstrap.ts`.
```

Why: Architecture knowledge that isn't obvious from code.

### 4. Testing Approaches That Worked

```markdown
## Testing

For API endpoints: Use `supertest` with the test helper in `tests/setup.ts`
Mocking: Factory functions in `tests/factories/` (not inline mocks)
```

Why: Establishes patterns that work.

### 5. Configuration Quirks

```markdown
## Config

- `NEXT_PUBLIC_*` vars must be set at build time, not runtime
- Redis connection requires `?family=0` suffix for IPv6
```

Why: Environment-specific knowledge.

## What SuPi Already Provides

Assume `code_orientation` is used heavily. Distinguish first-turn context from routine on-demand facts, but treat both as a baseline that static CLAUDE.md inventories should not duplicate:

| Surface | What It Provides | When |
|---------|------------------|------|
| `supi-code-intelligence` overview | Every discovered module's name, description, selected manifest entrypoints, manifest-declared dependency arrows, and detected languages | Hidden message on the first `before_agent_start` |
| Workspace `code_orientation` | Root manifest, package names and paths, manifest-declared relationships, direct root files/directories | Routine on demand |
| Directory/file `code_orientation` | Applicable instruction files, direct entries, package manifest/dependency facts, and file outline/import/export observations | Routine on demand for trusted focused paths |
| Native PI context | Context files from the cwd and ancestor chain | Session startup/system prompt |

**Implication:** Instruction files should preserve only information that these surfaces cannot generate:
- Non-obvious commands and workflows (gotcha flags, hook behaviors—not routine npm install/test/build)
- Ownership, boundaries, initialization/data flow, and exceptions
- Cross-package conventions and decisions
- Gotchas and human-curated "start here" guidance with reasoning

For a repo-wide check, run workspace Orientation first. For a targeted change, focus each target file's directory and relevant child paths first. Use workspace Orientation only when the edit checks repo-wide facts. Increase `maxResults` or use narrower repeated focuses when necessary. Compare instruction content with the non-instruction sections of those results; the file's appearance inside Orientation is delivery, not duplication by itself.

## What to REMOVE or Compress

When auditing an existing CLAUDE.md, remove or tighten content before adding anything. Static facts already present on the first turn or available through routine Orientation waste context whenever the file is loaded and MUST be removed.

### 1. Routine Command Listings

Remove sections that just list commands trivially discoverable from `package.json` or the file tree:

```markdown
Remove:
## Commands
| `pnpm vitest run` | Run tests |
| `pnpm exec tsc --noEmit` | Typecheck |

(These are in package.json — they don't earn context-window space.)
```

### 2. SuPi-Provided Static Facts (Non-Negotiable)

These sections MUST be removed unless they add ownership, flow, boundary, exception, or rationale:
- Package/module tables already present in the complete first-turn overview
- Package paths, manifest declarations, dependency lists, and relationships reported by Orientation
- Direct file/directory inventories and static project trees reproducible through repeated focused Orientation
- Source-symbol inventories reported by file Orientation

Generated inventories are unconditional waste; keep only the human meaning around them.

### 3. Verbose Explanations

Compress multi-sentence explanations into one-liners:

```markdown
Before:
The authentication system uses JWT tokens. JWT (JSON Web Tokens) are an open standard
(RFC 7519) that defines a compact and self-contained way for securely transmitting...

After:
Auth: JWT with HS256, tokens in `Authorization: Bearer <token>` header.
```

### 4. Stale or Outdated Content

Remove commands that no longer work, file paths that no longer exist, and architecture descriptions that don't match the current codebase. Stale content is worse than no content.

## What NOT to Add

### 1. Obvious Code Info

Bad:
```markdown
The `UserService` class handles user operations.
```

The class name already tells us this.

### 2. Generic Best Practices

Bad:
```markdown
Always write tests for new features.
Use meaningful variable names.
```

This is universal advice, not project-specific.

### 3. One-Off Fixes

Bad:
```markdown
We fixed a bug in commit abc123 where the login button didn't work.
```

Won't recur; clutters the file.

### 4. Verbose Explanations

Bad:
```markdown
The authentication system uses JWT tokens. JWT (JSON Web Tokens) are
an open standard (RFC 7519) that defines a compact and self-contained
way for securely transmitting information between parties as a JSON
object. In our implementation, we use the HS256 algorithm which...
```

Good:
```markdown
Auth: JWT with HS256, tokens in `Authorization: Bearer <token>` header.
```

### 5. Routine/Easy-to-Find Commands

```markdown
Bad:
npm install   # install dependencies
npm test      # run tests
npm run build # production build
```

These are in `package.json` and README. They don't earn their place in the context window.

## Diff Format for Updates

For each suggested change:

### 1. Identify the File

```
File: ./CLAUDE.md
Section: Commands (new section after ## Architecture)
```

### 2. Show the Change

```diff
 ## Start Here

+## Non-Obvious Commands & Workflows
+
+- Pre-push hook runs `pnpm verify` — covers both lint and tests
+- `pnpm exec biome check --write --unsafe` — only way to auto-fix unused imports
```

### 3. Explain Why

> **Why this helps:** The pre-push hook behavior and required biome flag
> weren't documented, causing repeated confusion. This saves future sessions
> from needing to discover these through trial and error.

## What NOT to Add (SuPi Projects)

In addition to the existing guidelines, avoid these when SuPi is active:

**Redundant: Package/module inventory**
```markdown
Bad:
## Packages
| Package | Description | Path |
|---------|-------------|------|
| `api` | REST API | `packages/api/` |

Better: Skip entirely, or if relationships are non-obvious:
## Cross-Package Patterns
The `api` package must be initialized before `worker` due to shared DB migrations.
```

**Redundant: High-level dependency graph**
```markdown
Bad:
## Dependencies
- `api` depends on `db`, `auth`
- `web` depends on `api`

Better: Skip — `code_orientation` shows this live.
```

**Partially redundant: Root project structure section with both overlap and unique value**
```markdown
Overlap portion:
## Project structure
- `apps/web` — frontend
- `apps/api` — backend
- `packages/db` — shared database code
- `packages/ui` — shared components

Keep portion:
- `packages/db` owns schema changes; app packages consume generated clients only
- API request flow starts at `apps/api/src/routes/` and drops into `packages/db/`

Better rewrite:
## Start Here
- Web changes usually start in `apps/web/src/app/`
- API request flow starts at `apps/api/src/routes/` and drops into `packages/db/`

## Cross-Package Patterns
- `packages/db` owns schema changes; app packages consume generated clients only
```

## Validation Checklist

Before finalizing an update, verify:

- [ ] Each addition is project-specific
- [ ] No generic advice or obvious info
- [ ] Commands are tested and work
- [ ] File paths are accurate
- [ ] Would a new Claude session find this helpful?
- [ ] Is this the most concise way to express the info?
- [ ] No overlap with the first-turn overview or routine Orientation facts (when SuPi is active)
