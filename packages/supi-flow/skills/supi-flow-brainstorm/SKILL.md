---
name: supi-flow-brainstorm
description: You MUST use this before any implementation. Clarify intent, shape the design, and get approval before touching code.
---

# Flow Brainstorm

Turn an idea into an approved design through focused collaboration. Default to a lightweight conversation. Add more structure only when the change is larger, riskier, or likely to span sessions.

<HARD-GATE>
Do NOT write code, scaffold anything, or take implementation action until you have presented a design and the user has approved it. This applies even to changes that seem simple.
</HARD-GATE>

## Core flow

1. **Explore context:** check relevant files, docs, recent commits, and existing tickets if they matter.
2. **Check scope:** if the request really contains multiple independent changes, decompose it before going deeper.
3. **Ask clarifying questions:** one at a time. Focus on purpose, constraints, and success criteria.
4. **Propose 2-3 approaches:** include trade-offs and a recommendation.
5. **Present the design:** scale detail to complexity and get approval.
6. **Capture the outcome:** by default in conversation; offer saving it for larger or multi-session work.
7. **Recommend `/supi-flow-plan`:** that is the next step.

## Understanding the idea

- Check the current project state first. Follow existing patterns before proposing new ones.
- Assess scope early. If the user is really asking for several subsystems, say so and help break the work into smaller changes.
- Ask one question per message. Multiple choice is great when it makes the decision easier.
- Keep refining until you understand the goal, non-goals, constraints, and what success looks like.

## Visual Companion

If upcoming questions would be easier with mockups, diagrams, or visual comparisons, offer a visual companion once:

> "Some of what we're working on could be easier to explain if I can show it to you visually. I can put together mockups, diagrams, comparisons, and other visuals as we go. Want to try it?"

That offer MUST be its own message. Do not combine it with any other content. If the user declines, continue in text.

Even if they accept, use visuals only when seeing the idea would help more than reading it.

## Exploring approaches

- Propose 2-3 approaches with trade-offs.
- Lead with your recommendation and say why.
- Prefer simple, well-bounded designs over sprawling ones.

## Presenting the design

Cover the parts that matter for the change, such as:

- approach
- main components or files
- data flow or control flow
- edge cases and error handling
- testing and verification
- docs to update, if any

Keep each section proportional to the complexity. A small change may only need a few sentences.

## Working in existing codebases

- Follow established patterns unless there is a strong reason not to.
- Include targeted cleanup when it directly helps the work.
- Do not propose unrelated refactors.

## Persistence and tracking

After approval:

- **Default to conversation-first.** The design can live in the chat for small, single-session work.
- **Offer saving the design** when the work is larger, likely multi-session, or would benefit from a durable reference.
- **Offer a TNDM ticket** when tracking would help. Do not force ticket creation for every change.

## Self-review

Before handing off:

1. Remove placeholders or vague wording.
2. Check for contradictions.
3. Make sure the scope still fits a single implementation plan.
4. Make ambiguous requirements explicit.

Fix issues inline, then continue.

## Handoff

Present the outcome in a compact form:

```markdown
## Brainstorming Outcome
**Problem**: ...
**Recommended approach**: ...
**Why**: ...
**Constraints / non-goals**: ...
**Open questions**: ...
**Persistence**: conversation / saved design
**Ticket**: TNDM-XXXXXX / none
```

Then recommend: `/supi-flow-plan [TNDM-XXXXXX]`

## Key principles

- One question at a time
- Explore alternatives before settling
- Scale rigor to risk
- Default to lightweight collaboration
- Keep the design clear enough to implement without guessing
