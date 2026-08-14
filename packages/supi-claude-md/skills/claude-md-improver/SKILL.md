---
name: claude-md-improver
description: Audit and improve existing CLAUDE.md files across a repository. Use for a deliberate, repo-wide quality review—not to record learnings from the current session.
disable-model-invocation: true
tools: Read, Glob, Grep, Bash, Edit
---

# CLAUDE.md Improver

Audit, evaluate, and improve CLAUDE.md files across a codebase to ensure PI has optimal project context.

## Workflow

### Phase 1: SuPi Context Baseline Review

**Do not read target instruction files yet.** Start from the session context and available tool surface. When `code_orientation` is available, assume future agents use it routinely and repeatedly—not only as a fallback. Static facts that are on demand rather than automatically injected are still poor CLAUDE.md content when Orientation exposes them directly.

**Purpose:** This baseline is the primary evidence for scoring Criterion 7 (SuPi Context Overlap) in Phase 3. Separate context that arrives on the first turn from facts routinely obtained through Orientation so the audit preserves human reasoning rather than generated inventories.

**Step 1 — Detect SuPi context surfaces.** Scan the conversation context and available tools for:

| Source identifier | What to look for | Typical content |
|-------------------|------------------|-----------------|
| `supi-code-intelligence` overview | Hidden first-turn project overview | Every discovered module's name, description, selected manifest entrypoints, manifest-declared dependency arrows, detected languages |
| `code_orientation` workspace focus | Workspace Orientation | Root manifest, package names and paths, manifest-declared package relationships, direct root files and directories |
| `code_orientation` directory/file focus | Focused Orientation | Applicable instruction files, direct directory entries, package manifest/dependency facts, file outline/import/export observations |
| `native-pi` | Root/ancestor CLAUDE.md or AGENTS.md loaded into the system prompt | Project-wide instructions from the cwd chain |
| Other extensions | `<extension-context source="...">` blocks | Any other extension-delivered context |

**Step 2 — Build the baseline.** Record both first-turn and routine on-demand coverage:

| Source | Content Category | Already Covers | Scope |
|--------|------------------|----------------|-------|
| `supi-code-intelligence` overview | Complete discovered module graph | Module names, descriptions, entrypoints, dependency relationships, languages | **Root-level / first turn** |
| `code_orientation` | Workspace facts | Package paths, manifests, dependency relationships, direct root entries | **Root-level / on demand** |
| `code_orientation` | Directory and file facts | Direct entries, package declarations/dependencies, outlines/imports/exports | **Package-specific / on demand** |
| `code_orientation` | Instruction-file surfacing | Configured `CLAUDE.md`/`AGENTS.md` files for trusted directory focus, up to 200 lines per file | **Package-specific / on demand** |
| `native-pi` | Root instructions | Context files in the cwd/ancestor chain | **Root-level / first turn** |

Add rows for other visible sources. Do not treat an instruction file as redundant merely because `code_orientation` is how its contents reach the model; compare its contents with the other facts Orientation provides.

**Step 3 — Classify redundancy risk by scope.** Assume heavy Orientation use:

- **Root-level high risk** (do NOT recommend for root `./CLAUDE.md`):
  - Package/module inventories, descriptions, entrypoint tables, and manifest dependency graphs
  - Package paths, static project-layout trees, and direct file/directory inventories
  - High-level architecture that adds no ownership, boundary, flow, exception, or rationale

- **Package-specific high risk** (do NOT recommend for that package's instruction file):
  - Direct file/subdirectory listings
  - Package manifest declarations, dependency lists, and manifest-derived relationships
  - Source-symbol inventories that file Orientation exposes without additional reasoning

- **Low risk** (safe to recommend at any scope):
  - Non-obvious commands and workflows (not routine build/test/lint)
  - Gotchas, failure modes, and ordering constraints
  - Ownership, boundaries, initialization/data flow, and exceptions not derivable from manifests
  - Curated "start here" guidance with reasoning
  - Cross-package conventions and project-specific decisions

**Step 4 — Output the baseline.** Produce this structured overview before Phase 2:

```markdown
## Phase 1 Baseline Review

### SuPi Detected: yes / no

### SuPi Context Surfaces

| Source | Delivery | Already Covers | Scope |
|--------|----------|----------------|-------|
| ... | First turn / Routine Orientation | ... | Root / Package-specific |

### Redundancy Risk Assessment

- **Root-level high risk:** [categories]
- **Package-specific high risk:** [categories]
- **Low risk:** [categories]
```

**Note:** If `code_orientation` is available, include its documented workspace/directory/file coverage even before calling it; Phase 2 verifies the actual target outputs.

### Phase 2: Discovery

Now read files from disk. Find all CLAUDE.md files in the repository:

```bash
find . \( -name "CLAUDE.md" -o -name ".claude.md" -o -name ".claude.local.md" \) \
  -not -path "*/.agents/skills/*" -not -path "*/.pi/skills/*" -not -path "*/.claude/skills/*" 2>/dev/null | head -50
```

**Ignore instruction files inside agent skill directories.** Skills may ship `CLAUDE.md`/`AGENTS.md` files as examples, templates, or fixtures. They are skill content, not project instructions — exclude them from discovery, scoring, and updates. Match only hidden agent-tool skill directories such as `.agents/skills`, `.pi/skills`, or `.claude/skills`; do not exclude project directories that happen to be named `skills`.

**File Types & Locations:**

| Type | Location | Purpose |
|------|----------|---------|
| Project root | `./CLAUDE.md` | Primary project context (checked into git, shared with team) |
| Local overrides | `./.claude.local.md` | Personal/local settings (gitignored, not shared) |
| Global defaults | `~/.claude/CLAUDE.md` | User-wide defaults across all projects |
| Package-specific | `./packages/*/CLAUDE.md` | Module-level context in monorepos |
| Subdirectory | Any nested location | Feature/domain-specific context |

**Note:** PI natively loads context files from the cwd and its ancestors. Nested package files are surfaced when `code_orientation` focuses their directories.

After discovery, run workspace `code_orientation` once, then directory Orientation for every target file's containing directory. Use a sufficiently high `maxResults` or narrower repeated focuses so a display cap is not mistaken for absence. This is required baseline evidence, not an optional removal check.

### Phase 3: Quality Assessment

For each CLAUDE.md file found in Phase 2, evaluate against quality criteria, incorporating the Phase 1 baseline review results. See [references/quality-criteria.md](references/quality-criteria.md) for detailed rubrics.

**Quick Assessment Checklist:**

| Criterion | Weight | Check |
|-----------|--------|-------|
| Commands/workflows documented | High | Are non-obvious commands/workflows captured (not routine build/test)? |
| Architecture clarity | High | Can PI understand the codebase structure? |
| Non-obvious patterns | Medium | Are gotchas and quirks documented? |
| Conciseness | Medium | No verbose explanations or obvious info? |
| Currency | High | Does it reflect current codebase state? |
| Actionability | High | Are instructions executable, not vague? |
| SuPi context overlap | Low | Does it duplicate the first-turn overview or facts available through routine `code_orientation` use? **Use the Phase 1 assessment as primary evidence.** |

**Phase 1 enforcement for Criterion 7:**
- Score package-specific files by comparing their contents with the non-instruction sections of directory/file Orientation. Surfacing is the delivery mechanism, not overlap by itself.
- Root- or package-level static facts classified as high risk must be flagged for removal rather than excused as minor overlap.
- Preserve concise human reasoning—ownership, boundaries, flow, exceptions, and gotchas—even when it mentions files or packages also shown by Orientation.

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
- Potential token savings: ~X (removing redundant generated/discoverable context)

**SuPi context overlap is never "minor" when it is only a generated inventory.** Content that duplicates the first-turn overview or routine Orientation wastes context whenever the instruction file is loaded and MUST be flagged for removal.

### File-by-File Assessment

#### 1. ./CLAUDE.md (Project Root)
**Score: XX/100 (Grade: X)**

**Context Overlap Review:**
- **Fully redundant (root-level):** [sections already covered by baseline context — applies to root `./CLAUDE.md`]
- **Fully redundant (package-specific):** [sections already covered by baseline context — applies to that package's `CLAUDE.md`]
- **Partially redundant:** [sections with overlap plus human-only value]
- **Unique:** [sections that should stay]
- **Estimated waste:** ~X tokens (characters ÷ 4) duplicate first-turn or routine Orientation context — should be removed

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands/workflows | X/15 | ... |
| Architecture clarity | X/15 | ... |
| Non-obvious patterns | X/15 | ... |
| Conciseness | X/15 | ... |
| Currency | X/15 | ... |
| Actionability | X/15 | ... |
| SuPi context overlap | X/10 | ... |

**Issues:**
- [List specific problems]

**Recommended removals (non-negotiable generated/discoverable overlap):**
- [List static inventories that MUST be removed or compressed, with estimated token savings.]

**Recommended additions:**
- [List what should be added]

#### 2. ./packages/api/CLAUDE.md (Package-specific)
...
```

### Phase 5: Targeted Updates

**Core principle: every token must earn its place in the instruction file.** If content doesn't save future sessions more time than it costs to read, remove it. No instruction file should exceed 200 lines — above that, every line must fight for its place against removal.

After outputting the quality report, ask user for confirmation before updating.

**Before recommending removals, verify the Phase 2 Orientation baseline.** Compare each target file with workspace and focused `code_orientation` output. Remove facts Orientation already supplies; retain human-only meaning. Never count the instruction text shown inside the Orientation result as evidence that the same text is redundant.

**Update Guidelines (Critical):**

1. **Remove or compress unnecessary content first** — Before adding anything, flag sections that MUST be removed or tightened. Never skip removals because of edit churn—a one-time edit that saves tokens on every relevant load pays for itself quickly.
   - Routine command listings (`npm install`, `npm test`, `npm run build`) — remove; they're in package.json
   - Package/module inventories that duplicate the complete first-turn overview — MUST be removed
   - Package paths, project trees, manifest facts, and dependency listings available through routine `code_orientation` use — MUST be removed unless they add ownership, flow, boundary, exception, or rationale
   - Verbose explanations where a one-liner suffices — compress
   - Stale or outdated commands, file references, or architecture descriptions — remove

2. **Then propose targeted additions** — Add only genuinely useful, non-obvious info:
   - Non-obvious commands or workflows discovered during analysis. Non-obvious means: gotcha flags (`--unsafe`, `--runInBand`), hook behaviors, ordering requirements, cross-tool workflows. Routine commands with scoped paths (`pnpm vitest run packages/<pkg>/path`) are still routine — they're equally discoverable from the file tree.
   - Gotchas or non-obvious patterns found in code
   - Package relationships that weren't clear
   - Testing approaches that work
   - Configuration quirks

3. **Keep it minimal** - Avoid:
   - Restating what's obvious from the code
   - Generic best practices already covered
   - One-off fixes unlikely to recur
   - Verbose explanations when a one-liner suffices

4. **Show diffs** - For each change, show:
   - Which CLAUDE.md file to update
   - The specific addition (as a diff or quoted block)
   - Brief explanation of why this helps future sessions

**Diff Format:**

```markdown
### Update: ./CLAUDE.md

**Why:** The pre-push hook behavior wasn't documented, causing repeated confusion in CI.

```diff
+ The pre-push hook runs `pnpm verify` — covers both lint and tests; don't run them separately.
```
```

### Phase 6: Apply Updates

After user approval, apply changes using the Edit tool. Preserve existing content structure.

## Templates

See [references/templates.md](references/templates.md) for CLAUDE.md templates by project type.

## Common Issues to Flag

1. **Stale commands**: Non-obvious commands or flags that no longer work
2. **Missing dependencies**: Required tools not mentioned
3. **Outdated architecture**: File structure that's changed
4. **Missing environment setup**: Required env vars or config
5. **Undocumented gotchas**: Non-obvious patterns not captured

## User Tips to Share

When presenting recommendations, remind users:

- **Keep it concise**: CLAUDE.md should be human-readable; dense is better than verbose
- **Actionable commands**: All documented commands should be non-obvious and copy-paste ready; skip routine ones
- **Use `.claude.local.md`**: For personal preferences not shared with team (add to `.gitignore`)
- **Global defaults**: Put user-wide preferences in `~/.claude/CLAUDE.md`

## What Makes a Great CLAUDE.md

**Key principles:**
- Concise and human-readable
- Non-obvious commands and workflows (gotcha flags, ordering, hooks — not routine build/test)
- Project-specific patterns, not generic advice
- Non-obvious gotchas and warnings

**Recommended sections** (use only what's relevant):
- Non-Obvious Commands & Workflows (gotcha flags, hook behaviors, ordering)
- Architecture (directory structure)
- Key Files (entry points, config)
- Code Style (project conventions)
- Environment (required vars, setup)
- Testing (non-obvious patterns and conventions)
- Gotchas (quirks, common mistakes)
- Workflow (when to do what)
