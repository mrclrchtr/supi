---
name: claude-md-revision
description: "Update CLAUDE.md or .claude.local.md with learnings from the current session. Use this skill whenever the user wants to capture session insights, update project memory, revise CLAUDE.md, document codebase patterns, or preserve gotchas discovered during a coding session. Also trigger on phrases like 'add this to CLAUDE.md', 'remember this for next time', 'update project memory', 'document this pattern', or when wrapping up a session that revealed useful context."
license: MIT
---

# Revise CLAUDE.md with Session Learnings

Review the current session for actionable learnings and update the project's CLAUDE.md or .claude.local.md files. The goal is concise, durable context that helps future sessions work more effectively in this codebase.

## When to Use This Skill

- The user explicitly asks to update CLAUDE.md or project memory
- The user says things like "remember this," "add this to the docs," or "document this pattern"
- A session revealed non-obvious gotchas, commands, or patterns worth preserving
- You're wrapping up a session and the user wants to capture learnings
- You discovered environment quirks, testing approaches, or style patterns that future sessions should know

## When NOT to Use This Skill

- The user wants to update README.md, API docs, or user-facing documentation (this skill is for agent context files only)
- The session had no novel learnings (routine work needs no revision)
- The user says "don't update CLAUDE.md" or similar

## Workflow

### Step 1: Reflect

Identify what context would have helped this session go smoother. Scan the conversation for learnings worth preserving.

**What TO capture:**
- **Commands/workflows** discovered or used repeatedly
- **Gotchas and non-obvious patterns** (deprecated APIs, common pitfalls, tricky behaviors)
- **Package relationships** or ordering dependencies not obvious from code
- **Testing approaches** that worked (or didn't)
- **Configuration quirks** (env vars, build tools, path oddities)

**What NOT to capture:**
- Obvious info already clear from code or naming
- Generic best practices ("write tests", "use meaningful names")
- One-off fixes unlikely to recur ("fixed typo on line 42")
- Verbose explanations — one line per concept; link to docs for detail
- Content that SuPi extensions already auto-deliver (package tables, module graphs, dependency lists from manifests — see update guidelines)

Filter ruthlessly. CLAUDE.md is part of the prompt — brevity directly improves future sessions.

> See also: [detailed update guidelines](references/update-guidelines.md) and [quality criteria](references/quality-criteria.md)

### Step 2: Find Context Files

Find existing CLAUDE.md and .claude.local.md files in the project:

```bash
find . -name "CLAUDE.md" -o -name ".claude.local.md" 2>/dev/null | head -20
```

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
`pnpm vitest run packages/<pkg>/` — run tests for a single workspace package
`os.homedir()` cannot be mocked in ESM — pass `homeDir` parameter for testability
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
- [ ] Commands are tested and work
- [ ] File paths are accurate
- [ ] Team-shared vs. personal-local scope is respected
- [ ] This is the most concise way to express the info

## Guidelines

- **Brevity is the priority** — CLAUDE.md content is injected into every prompt. Long files hurt performance.
- **Actionability** — each line should save future sessions time or prevent a mistake.
- **No duplication** — read the existing file before adding; merge with existing entries when possible.
- **Respect scope** — team-shared vs. personal-local. Don't put machine-specific paths in CLAUDE.md.
- **Format consistency** — match the existing format in the target file. If the file uses backticks for commands, use backticks. If it uses bullet points, use bullet points.

## References

- [Update guidelines](references/update-guidelines.md) — detailed rubric for what to add and what to skip
- [Quality criteria](references/quality-criteria.md) — scoring rubric for assessing CLAUDE.md quality
- [Templates](references/templates.md) — section templates for creating new CLAUDE.md files
