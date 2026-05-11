---
name: claude-md-improver
description: Use this skill to audit and improve CLAUDE.md files in repositories. Use when user asks to check, audit, update, improve, or fix CLAUDE.md files. Scans for all CLAUDE.md files, evaluates quality against templates, outputs quality report, then makes targeted updates.
tools: Read, Glob, Grep, Bash, Edit
---

# CLAUDE.md Improver

Audit, evaluate, and improve CLAUDE.md files across a codebase to ensure PI has optimal project context.

## Workflow

### Phase 1: Context Baseline Review

**No file reads in this phase.** Use only what is already loaded in this session's context.

**Purpose:** This baseline review is the primary evidence for scoring Criterion 7 (Auto-Delivered Overlap) in Phase 3. Its goal is to identify which information categories are already delivered automatically by SuPi extensions or native pi, so you do NOT recommend adding that same content to CLAUDE.md. If you skip this step, you will inflate scores and propose redundant additions that already appear in every session.

**Step 1 — Detect auto-injected sources.** Scan the conversation context for:

| Source identifier | What to look for | Typical content |
|-------------------|------------------|---------------|
| `supi-code-intelligence` | Workspace module graphs, package lists, dependency arrows, file counts | `## Modules` tables, architecture overviews, root directory trees |
| `supi-claude-md` | `<extension-context source="supi-claude-md">` blocks | Subdirectory CLAUDE.md/AGENTS.md content already injected below cwd |
| `native-pi` | Root CLAUDE.md or AGENTS.md loaded into the system prompt | Project-wide instructions from the repository root |
| Other extensions | `<extension-context source="...">` blocks | Any other extension-injected context |

**Step 2 — Build the baseline.** For each source found, record what it already covers:

| Source | Content Category | Already Covers | Scope |
|--------|------------------|----------------|-------|
| `supi-code-intelligence` | Module graph | Package names, descriptions, dependency relationships | **Root-level** |
| `supi-code-intelligence` | Workspace overview | File counts, root directory tree, top-level landmarks | **Root-level** |
| `supi-claude-md` | Subdirectory instructions | `packages/*/CLAUDE.md` content injected during this session | **Package-specific** |
| `native-pi` | Root instructions | `./CLAUDE.md`, `./AGENTS.md` in system prompt | **Root-level** |

Add rows for any additional categories visible in context.

**Step 3 — Classify redundancy risk by scope.** Use the table above to categorize:

- **Root-level high risk** (already auto-delivered; do NOT recommend for root `./CLAUDE.md`):
  - Package/module inventories (from `supi-code-intelligence`)
  - Root directory trees and file counts (from `supi-code-intelligence`)
  - Dependency graphs from manifests (from `supi-code-intelligence`)
  - High-level architecture without project-specific reasoning (from `supi-code-intelligence`)

- **Package-specific high risk** (already auto-delivered; do NOT recommend for that package's `CLAUDE.md`):
  - Subdirectory CLAUDE.md/AGENTS.md already injected by `supi-claude-md` during this session

- **Low risk** (not auto-delivered; safe to recommend in CLAUDE.md at any scope):
  - Commands and workflows
  - Gotchas and non-obvious patterns
  - Cross-package conventions not obvious from manifests
  - Curated "start here" guidance with ownership or boundary reasoning
  - Project-specific exceptions to generic rules

**Step 4 — Output the baseline.** Produce this structured overview before proceeding to Phase 2:

```markdown
## Phase 1 Baseline Review

### SuPi Detected: yes / no

### Auto-Injected Content by Source

| Source | Content Category | Already Covers | Scope |
|--------|------------------|----------------|-------|
| ... | ... | ... | Root / Package-specific |

### Redundancy Risk Assessment

- **Root-level high risk** (do NOT recommend for root `./CLAUDE.md`):
  - [List categories]
- **Package-specific high risk** (do NOT recommend for matching package `CLAUDE.md`):
  - [List categories]
- **Low risk** (safe to recommend):
  - [List categories]
```

**Note:** This review is intentionally approximate — it compares against the context already visible to you, not the literal hidden system prompt. If no SuPi-delivered context is visible in the conversation, the baseline is empty and this phase is a no-op.

### Phase 2: Discovery

Now read files from disk. Find all CLAUDE.md files in the repository:

```bash
find . -name "CLAUDE.md" -o -name ".claude.md" -o -name ".claude.local.md" 2>/dev/null | head -50
```

**File Types & Locations:**

| Type | Location | Purpose |
|------|----------|---------|
| Project root | `./CLAUDE.md` | Primary project context (checked into git, shared with team) |
| Local overrides | `./.claude.local.md` | Personal/local settings (gitignored, not shared) |
| Global defaults | `~/.claude/CLAUDE.md` | User-wide defaults across all projects |
| Package-specific | `./packages/*/CLAUDE.md` | Module-level context in monorepos |
| Subdirectory | Any nested location | Feature/domain-specific context |

**Note:** PI auto-discovers CLAUDE.md files in parent directories, making monorepo setups work automatically.

### Phase 3: Quality Assessment

For each CLAUDE.md file found in Phase 2, evaluate against quality criteria, incorporating the Phase 1 baseline review results. See [references/quality-criteria.md](references/quality-criteria.md) for detailed rubrics.

**Quick Assessment Checklist:**

| Criterion | Weight | Check |
|-----------|--------|-------|
| Commands/workflows documented | High | Are build/test/deploy commands present? |
| Architecture clarity | High | Can PI understand the codebase structure? |
| Non-obvious patterns | Medium | Are gotchas and quirks documented? |
| Conciseness | Medium | No verbose explanations or obvious info? |
| Currency | High | Does it reflect current codebase state? |
| Actionability | High | Are instructions executable, not vague? |
| Auto-delivered overlap | Low | Does it duplicate what SuPi extensions already inject? **Use the Phase 1 Redundancy Risk Assessment as primary evidence.** |

**Quality Scores:**
- **A (90-100)**: Comprehensive, current, actionable
- **B (70-89)**: Good coverage, minor gaps
- **C (50-69)**: Basic info, missing key sections
- **D (30-49)**: Sparse or outdated
- **F (0-29)**: Missing or severely outdated

### Phase 4: Quality Report Output

**ALWAYS output the quality report BEFORE making any updates.**

Format:

```
## CLAUDE.md Quality Report

### Summary
- Files found: X
- Average score: X/100
- Files needing update: X

### File-by-File Assessment

#### 1. ./CLAUDE.md (Project Root)
**Score: XX/100 (Grade: X)**

**Context Overlap Review:**
- **Fully redundant (root-level):** [sections already covered by baseline context — applies to root `./CLAUDE.md`]
- **Fully redundant (package-specific):** [sections already covered by baseline context — applies to that package's `CLAUDE.md`]
- **Partially redundant:** [sections with overlap plus human-only value]
- **Unique:** [sections that should stay]

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | X/15 | ... |
| Architecture clarity | X/15 | ... |
| Non-obvious patterns | X/15 | ... |
| Conciseness | X/15 | ... |
| Currency | X/15 | ... |
| Actionability | X/15 | ... |
| Auto-delivered overlap | X/10 | ... |

**Issues:**
- [List specific problems]

**Recommended additions:**
- [List what should be added]

#### 2. ./packages/api/CLAUDE.md (Package-specific)
...
```

### Phase 5: Targeted Updates

After outputting the quality report, ask user for confirmation before updating.

**Update Guidelines (Critical):**

1. **Propose targeted additions only** - Focus on genuinely useful info:
   - Commands or workflows discovered during analysis
   - Gotchas or non-obvious patterns found in code
   - Package relationships that weren't clear
   - Testing approaches that work
   - Configuration quirks

2. **Keep it minimal** - Avoid:
   - Restating what's obvious from the code
   - Generic best practices already covered
   - One-off fixes unlikely to recur
   - Verbose explanations when a one-liner suffices

3. **Show diffs** - For each change, show:
   - Which CLAUDE.md file to update
   - The specific addition (as a diff or quoted block)
   - Brief explanation of why this helps future sessions

**Diff Format:**

```markdown
### Update: ./CLAUDE.md

**Why:** Build command was missing, causing confusion about how to run the project.

```diff
+ ## Quick Start
+
+ ```bash
+ npm install
+ npm run dev  # Start development server on port 3000
+ ```
```
```

### Phase 6: Apply Updates

After user approval, apply changes using the Edit tool. Preserve existing content structure.

## Templates

See [references/templates.md](references/templates.md) for CLAUDE.md templates by project type.

## Common Issues to Flag

1. **Stale commands**: Build commands that no longer work
2. **Missing dependencies**: Required tools not mentioned
3. **Outdated architecture**: File structure that's changed
4. **Missing environment setup**: Required env vars or config
5. **Broken test commands**: Test scripts that have changed
6. **Undocumented gotchas**: Non-obvious patterns not captured

## User Tips to Share

When presenting recommendations, remind users:

- **Keep it concise**: CLAUDE.md should be human-readable; dense is better than verbose
- **Actionable commands**: All documented commands should be copy-paste ready
- **Use `.claude.local.md`**: For personal preferences not shared with team (add to `.gitignore`)
- **Global defaults**: Put user-wide preferences in `~/.claude/CLAUDE.md`

## What Makes a Great CLAUDE.md

**Key principles:**
- Concise and human-readable
- Actionable commands that can be copy-pasted
- Project-specific patterns, not generic advice
- Non-obvious gotchas and warnings

**Recommended sections** (use only what's relevant):
- Commands (build, test, dev, lint)
- Architecture (directory structure)
- Key Files (entry points, config)
- Code Style (project conventions)
- Environment (required vars, setup)
- Testing (commands, patterns)
- Gotchas (quirks, common mistakes)
- Workflow (when to do what)
