# CLAUDE.md Update Guidelines

## Core Principle

Only add information that will genuinely help future Claude sessions. The context window is precious - every line must earn its place.

## What TO Add

### 1. Commands/Workflows Discovered

```markdown
## Build

`npm run build:prod` - Full production build with optimization
`npm run build:dev` - Fast dev build (no minification)
```

Why: Saves future sessions from discovering these again.

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

**Implication:** A root CLAUDE.md doesn't need to document what `code_intel brief` would say. Focus instead on:
- Commands and workflows
- Cross-package conventions and patterns
- Gotchas that aren't in code
- Human-curated guidance ("start here for X")

When SuPi is active, do a quick baseline review first: compare the CLAUDE.md against `code_intel brief` and other known injected context, then separate each section into overlap vs unique value. If a root `## Project structure` / `## Architecture` section mostly restates the workspace tree, treat that portion as redundant and keep only the orientation, boundary rules, or exceptions that the generated overview cannot supply.

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

## Diff Format for Updates

For each suggested change:

### 1. Identify the File

```
File: ./CLAUDE.md
Section: Commands (new section after ## Architecture)
```

### 2. Show the Change

```diff
 ## Architecture
 ...

+## Commands
+
+| Command | Purpose |
+|---------|---------|
+| `npm run dev` | Dev server with HMR |
+| `npm run build` | Production build |
+| `npm test` | Run test suite |
```

### 3. Explain Why

> **Why this helps:** The build commands weren't documented, causing
> confusion about how to run the project. This saves future sessions
> from needing to inspect `package.json`.

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

Better: Skip — `code_intel brief` shows this live.
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
