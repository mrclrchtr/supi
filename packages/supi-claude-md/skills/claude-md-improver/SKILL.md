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

Before opening any files, introspect the conversation context you already have:

1. **Scan for auto-injected context** — look for `<extension-context>` blocks already present in this conversation (from `supi-code-intelligence`, `supi-claude-md`, or other SuPi extensions), workspace overview summaries, or any CLAUDE.md content that was injected via subdirectory discovery earlier in the session.
2. **Infer SuPi presence** from whether SuPi-delivered content is visible in the conversation. If you see workspace module graphs, package lists, or `<extension-context source="supi-*">` blocks, SuPi is active.
3. **Build the baseline** from what you already know:
   - workspace package/module inventory visible in context
   - dependency relationships already described
   - directory structures or architecture overviews already shown
   - subdirectory injection behavior if `supi-claude-md` context was injected
4. **Classify what the baseline likely already covers**:
   - package/module inventories — usually fully covered
   - dependency graphs from manifests — usually fully covered
   - directory trees and file structures — often covered
   - high-level architecture without project-specific reasoning — often covered
5. **Preserve categories that are likely unique** (not in the baseline):
   - commands and workflows
   - gotchas and non-obvious patterns
   - cross-package conventions not obvious from manifests
   - curated "start here" guidance with ownership or boundary reasoning
   - project-specific exceptions to generic rules

Show an overview of this baseline review before proceeding.

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
| Auto-delivered overlap | Low | Does it duplicate what SuPi extensions already inject? (Use Phase 1 classifications) |

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
- **Fully redundant:** [sections already covered by baseline context]
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
