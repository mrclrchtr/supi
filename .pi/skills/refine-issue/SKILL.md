---
name: refine-issue
description: Refine a GitHub issue into a clear, actionable specification — challenge every requirement and goal for YAGNI and KISS.
disable-model-invocation: true
---

# Refine an issue

Refine the GitHub issue named by the user.

1. Read the issue with `gh`. Inspect relevant code, read or fetch docs, history, and related issues or pull requests. Separate facts, assumptions, decisions, and open questions.
   Done when every claim in the issue is classified.
2. Challenge every requirement and goal for YAGNI and KISS: propose cutting what the issue does not need and simplifying what remains. Give each a verdict: keep, cut, or simplify.
   Done when every requirement and goal has a verdict and a concrete proposal.
3. Run a `/grilling` session, loading the `/domain-modeling` skill when in this stage, not before. Press every unresolved requirement, scope decision, and challenge proposal. Wait for answers before finalizing.
4. Produce a concise refinement with:
   - Problem
   - Goal
   - Scope and constraints — including what the challenge cut
   - Requirements — only what survived the challenge
   - Acceptance criteria
   - Open questions

Do not edit code or the issue unless the user confirms.
