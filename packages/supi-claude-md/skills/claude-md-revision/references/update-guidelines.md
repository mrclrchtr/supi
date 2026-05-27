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

## What SuPi Extensions Already Deliver

When auditing or updating CLAUDE.md in a project using SuPi extensions, these sections are redundant because they're auto-injected on every session:

| Extension | What It Injects | When |
|-----------|----------------|------|
| `supi-code-intelligence` | Workspace module graph (names, descriptions, paths, dependency edges) | First `before_agent_start` per session |
| `supi-claude-md` | Subdirectory `CLAUDE.md` files wrapped in `<extension-context>` | On `read`/`edit`/`lsp`/`tree_sitter` to subdirectories |
| `supi-core` | `findProjectRoot`, `walkProject`, XML `<extension-context>` tagging | Available to all extensions |

**Implication:** A root CLAUDE.md doesn't need to document what `code_brief` would say. Focus instead on:
- Non-obvious commands and workflows (gotcha flags, hook behaviors — NOT routine npm install/test/build)
- Cross-package conventions and patterns
- Gotchas that aren't in code
- Human-curated guidance ("start here for X")

When SuPi is active, do a quick baseline review first: compare the CLAUDE.md against `code_brief` and other known injected context, then separate each section into overlap vs unique value. If a root `## Project structure` / `## Architecture` section mostly restates the workspace tree, treat that portion as redundant and keep only the orientation, boundary rules, or exceptions that the generated overview cannot supply.

## What to REMOVE or Compress

When auditing an existing CLAUDE.md, identify content that MUST be removed or tightened before adding anything new. Never skip removals because of edit churn — a one-time edit that saves tokens every session pays for itself immediately. Content that's already in the Context Baseline (auto-delivered by SuPi extensions) wastes tokens every session it persists and MUST be removed.

### 1. Routine Command Listings

Remove sections that just list commands trivially discoverable from `package.json` or the file tree:

```markdown
Remove:
## Commands
| `pnpm vitest run` | Run tests |
| `pnpm exec tsc --noEmit` | Typecheck |

(These are in package.json — they don't earn context-window space.)
```

### 2. Auto-Delivered Content (Non-Negotiable)

These sections MUST be removed — they duplicate what SuPi extensions already inject and waste tokens every session:
- Package/module tables that match `code_brief` output
- Package layout / project structure sections that just list packages with descriptions
- Architecture trees that restate what `code_brief` or `code_intelligence` auto-deliver
- Dependency graphs derivable from workspace manifests
- Root directory trees that just restate the folder layout

These are never "minor overlaps worth a point" — they are unconditional waste. Remove them.

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

Better: Skip — `code_brief` shows this live.
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
- [ ] No overlap with SuPi auto-delivered content (when SuPi is active)
