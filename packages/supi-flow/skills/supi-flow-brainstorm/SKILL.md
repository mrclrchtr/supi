---
name: supi-flow-brainstorm
description: You MUST use this before any implementation — explores intent, design, and approach before touching code. Creates a tndm ticket when the change spans multiple sessions; skips the ticket for small, single-session work.
---

# Flow Brainstorm

Help turn ideas into fully formed designs through natural collaborative dialogue. Output is an approved design — implementation comes after.

<HARD-GATE>
Do NOT write code, scaffold anything, or take implementation action until you have presented a design and the user has approved it. This applies to EVERY change regardless of perceived simplicity.
</HARD-GATE>

## Checklist

Complete these in order:

1. **Explore project context** — check relevant files, docs, recent commits, existing tndm tickets
2. **Ask clarifying questions** — one at a time, understand purpose/constraints/success criteria
3. **Propose 2-3 approaches** — with trade-offs and your recommendation
4. **Present design** — in sections scaled to complexity, get user approval after each section
5. **Ask: ticket or no ticket?** — see below
6. **Write outcome** — capture the approved direction
7. **Brief self-review** — check for placeholders, contradictions, ambiguity

## Design presentation

- Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced
- Ask after each section whether it looks right so far
- Cover: approach, components, data flow, error handling, testing
- For existing codebases: follow existing patterns, include targeted improvements where code problems affect the work, don't propose unrelated refactoring

## After design approval: ticket or no ticket?

Ask the user:

> "Create a tndm ticket to track this? Recommended for multi-session work. Skip for small changes done in one session."

**If ticket:**
```sh
tndm ticket create "<brief title>" --status todo --definition questions <<'EOF'
## Intent
[1-2 sentences on the problem and why now]

## Context
[Relevant files, constraints, prior decisions]

## Design
[Technical approach and key decisions]

## Docs to update
- [ ] [files that need documentation changes]

## Plan
- [ ]

## Verification
- [ ]

## Open Questions
- [ ]
EOF
```

**If no ticket:** the design lives in the conversation. Continue with `/supi-flow-plan`.

## Self-review (before handing off)

1. Placeholder scan: Any "TBD", "TODO", incomplete sections?
2. Internal consistency: Does the design match what was discussed?
3. Scope check: Focused enough for one change, or needs decomposition?

## Handoff

Present the outcome:

```markdown
## Brainstorming Outcome
**Problem**: ...
**Recommended approach**: ...
**Why**: ...
**Constraints / non-goals**: ...
**Open questions**: ...
**Ticket**: TNDM-XXXXXX / none
```

Then recommend: `/supi-flow-plan [TNDM-XXXXXX]` to create the implementation plan.
