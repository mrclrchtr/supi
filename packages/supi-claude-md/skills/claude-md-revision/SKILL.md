---
name: claude-md-revision
description: "Record durable, project-specific learnings from the current session in CLAUDE.md, .claude.local.md, or AGENTS.md—not general documentation, session summaries, or repo-wide audits."
disable-model-invocation: true
license: MIT
---

# Revise CLAUDE.md with Session Learnings

Review the current session for actionable learnings and update the project's CLAUDE.md or .claude.local.md files. The goal is concise, durable context that helps future sessions work more effectively in this codebase.

## Workflow

### Step 1: Reflect

Identify what context would have helped this session go smoother. Scan the conversation for learnings worth preserving.

**What TO capture:**
- **Non-obvious commands/workflows** discovered or used repeatedly (not routine build/test/lint — those are in package.json)
- **Gotchas and non-obvious patterns** (deprecated APIs, common pitfalls, tricky behaviors)
- **Package relationships** or ordering dependencies not obvious from code
- **Testing approaches** that worked (or didn't)
- **Configuration quirks** (env vars, build tools, path oddities)

**What NOT to capture:**
- Obvious info already clear from code or naming
- Generic best practices ("write tests", "use meaningful names")
- One-off fixes unlikely to recur ("fixed typo on line 42")
- Routine/easy-to-find commands: `npm install`, `npm test`, `npm run build` — these are in package.json or README and don't earn their place in the context window
- Verbose explanations — one line per concept; link to docs for detail
- Static facts SuPi already provides on the first turn or through routine `code_orientation`: package/module tables, manifest dependency graphs, project trees, direct directory inventories, and package manifest declarations

Filter ruthlessly. Every token must earn its place in the instruction file — if content doesn't save future sessions more time than it costs to read, remove it.

**Before adding, consider removing.** Scan the file for content that MUST be removed or compressed. Never skip removals because of edit churn—a one-time edit that saves tokens on every relevant load pays for itself quickly:
- Routine command listings that are trivially discoverable from `package.json` — MUST remove (~50–200 tokens saved per session)
- Sections that duplicate the complete first-turn module overview or facts available through routine `code_orientation` (package tables/paths, manifest dependency graphs, static project trees, direct directory listings, manifest declarations) — MUST remove unless they add ownership, flow, boundary, exception, or rationale
- Verbose explanations where a one-liner suffices — compress (~20–100 tokens saved)
- Stale commands, paths, or architecture descriptions that no longer match the codebase — remove

Removing unnecessary content is as valuable as adding useful content. Do both.

> See also: [detailed update guidelines](references/update-guidelines.md) and [quality criteria](references/quality-criteria.md)

**Step 1.5: Build a focused Orientation baseline.** Assume future agents use `code_orientation` heavily. Start with a directory focus for the target instruction file. This shows applicable instruction files and local facts. Use file or child-directory focus when needed. Run workspace Orientation only when the edit checks repo-wide facts, such as package topology or dependency relationships. Remove static facts those non-instruction sections already provide. Do not treat the instruction file's appearance inside Orientation as proof that its own human guidance is redundant—Orientation is its delivery mechanism.

### Step 2: Find Context Files

Find existing CLAUDE.md and .claude.local.md files in the project:

```bash
find . \( -name "CLAUDE.md" -o -name ".claude.local.md" \) \
  -not -path "*/.agents/skills/*" -not -path "*/.pi/skills/*" -not -path "*/.claude/skills/*" 2>/dev/null | head -20
```

Ignore instruction files inside hidden agent-tool skill directories (`.agents/skills`, `.pi/skills`, `.claude/skills`, and similar) — they are skill content (examples, templates, fixtures), not project instructions. Do not ignore project directories that happen to be named `skills`.

For each file found, decide if the new content belongs there:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Team-shared context. Check into git. Use for patterns, commands, and gotchas that any teammate would benefit from. |
| `.claude.local.md` | Personal/local only. Gitignored. Use for personal preferences, local environment quirks, or experimental notes. |

If no CLAUDE.md exists at the project root and the learnings are team-relevant, create one.

### Step 3: Draft Additions

**Keep it concise** — one line per concept. Use this format:

```
<command or pattern> — <brief description>
```

Examples:

```
`os.homedir()` cannot be mocked in ESM — pass `homeDir` parameter for testability
Pre-push hook runs `pnpm verify` — covers both lint and tests; don't run them separately
Root context files are never re-injected by extensions; use `/reload` to refresh
```

Avoid:
- Verbose explanations (link to docs if detail is needed)
- Obvious information ("JavaScript uses `const` for constants")
- One-off fixes unlikely to recur ("Fixed typo in variable name on line 42")
- Duplicating existing content (read the file first)

### Step 4: Propose Changes

For each addition, present it in this format:

```markdown
### Update: ./path/to/CLAUDE.md

**Why:** [one-line reason this belongs here]

```diff
+ [the addition — keep it brief]
```
```

Group related additions under a single heading. If multiple files need updates, show each separately.

**Diff structure:**
1. **Identify the file and section** — existing heading, or note if new
2. **Show the change** — concise diff or quoted block
3. **Explain why** — one sentence on how this helps future sessions

### Step 5: Apply with Approval

Ask the user if they want to apply the changes. Only edit files they approve.

If the user approves:
- Append new content in the appropriate section, or create the section if it doesn't exist
- Maintain alphabetical or logical ordering within sections
- Run `git diff` (or equivalent) after editing to confirm the change looks correct

If the user rejects or modifies a proposal, adjust and re-present.

**Validation checklist** — before finalizing, verify:
- [ ] Each addition is project-specific, not generic advice
- [ ] No duplication with existing content (read the file first)
- [ ] Commands (if any) are non-obvious and tested
- [ ] File paths are accurate
- [ ] Team-shared vs. personal-local scope is respected
- [ ] This is the most concise way to express the info

## Guidelines

- **Every token must earn its place** — if content doesn't save future sessions more time than it costs to read, remove it. Root context files are loaded by PI; nested files consume context when relevant Orientation surfaces them.
- **200-line hard cap** — no instruction file should exceed 200 lines. Above that, every line must fight for its place against removal. If a file is over 200 lines, prioritize removals over additions.
- **Actionability** — each line should save future sessions time or prevent a mistake.
- **No duplication** — read the existing file before adding; merge with existing entries when possible.
- **Respect scope** — team-shared vs. personal-local. Don't put machine-specific paths in CLAUDE.md.
- **Format consistency** — match the existing format in the target file. If the file uses backticks for commands, use backticks. If it uses bullet points, use bullet points.

## References

- [Update guidelines](references/update-guidelines.md) — detailed rubric for what to add and what to skip
- [Quality criteria](references/quality-criteria.md) — scoring rubric for assessing CLAUDE.md quality
- [Templates](references/templates.md) — section templates for creating new CLAUDE.md files
