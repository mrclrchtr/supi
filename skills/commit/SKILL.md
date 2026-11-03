---
name: commit
description: "Guides how to commit"
---

# Commit candidate

A **commit candidate** is the exact patch that will enter the commit. A **coherent change** has one task or issue as its reason for existing.

# Guardrails

- Inspect candidate changes for credentials, private keys, tokens, and local secret files. **STOP and ask** what to do without repeating the secret value.
- Preserve changes outside the current task. Ask before changing an existing staged change that is outside the task boundary.
- Keep normal Git hooks enabled.
- Do not use sub-agents.

# Process

1. **Establish the Git state.** Inspect the branch, active Git operation, staged and unstaged changes, untracked files, and the task or issue boundary. Ask when required facts are unclear.

   **Done when:** the request mode, task boundary, and Git state are understood.

2. **Build the commit candidate.** Stage only changes that directly belong to the task or issue. Preserve unrelated staged changes. If the task forms one coherent change, prepare one candidate. Ask when grouping is unclear. If there is no suitable candidate, report it and stop.

   **Done when:** the staged patch contains the complete intended change and no unrelated change.

3. **Audit the candidate and verify hooks.** Inspect the full staged diff, check for possible secrets, and run `git diff --cached --check`.

   **Verify effective hooks.** Identify the hooks expected by the repository and use `git hook list --show-scope <event>` when supported. Git hooks may be registered through configuration rather than executable files in `.git/hooks`. If listing is unsupported, inspect `core.hooksPath` and the applicable hook files. Follow the repository's installation guidance only when the expected hooks are actually absent. If hook state remains unclear, stop and report the uncertainty rather than changing the hook setup.

   **Done when:** the diff audit passes and expected hooks are verified as present.

4. **Write the message.** Match recent commit history first. Honor explicit message requirements. Use a concise subject with the repository's normal type, scope, mood, length, and punctuation. Add a body only when it explains why, a trade-off, a constraint, a side effect, or a required follow-up. Add references to tickets if they exist; don't invent them.

5. **Create the requested commit.** For a normal commit, pass the complete message through a quoted heredoc:

   ```bash
   git commit -F - <<'COMMIT_MSG'
   type(scope): concise summary

   optional body explaining why, trade-offs, constraints, side effects, or follow-ups

   #related-issue
   COMMIT_MSG
   ```

   For an active Git operation, use its appropriate continuation path. When known Git facts show a clearly local follow-up to `HEAD`, the agent may amend. Ask when those facts are unclear; otherwise create a new commit.

   Let the real commit run normal Git hooks. Fix and retry only an obvious mechanical failure inside the task; otherwise stop and report the failure. Re-audit the candidate before retrying if a fix or hook changed it.

6. **Verify the result.** Inspect the new commit's hash, subject, stat, and `git status`. Report the commit and the checks and hooks that actually ran, including their results. Hook registration alone does not prove execution or success. Confirm that remaining changes are intentional. If the commit fails, leave the state available for inspection and report the failure without retrying blindly.

   **Done when:** `HEAD` contains the intended patch, the message follows repository style, check results are reported, and remaining changes are understood.
