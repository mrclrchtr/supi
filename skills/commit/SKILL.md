---
name: commit
description: "Create a Git commit for the current task. Use when the user asks to commit changes."
compatibility: Requires Git and a POSIX shell.
---

# Commit

Reuse established task context, repository conventions, and checks for unchanged content. Refresh Git state, but investigate only missing facts. Work directly, without sub-agents.

1. **Inspect.** From the target working tree, run `sh "<skill-directory>/scripts/inspect.sh"`, resolving the path relative to this skill. Use its report instead of separate state, history, and hook probes. It reports facts, not whether the candidate or hook setup is correct.

   Compare reported hooks with repository expectations. Investigate only missing or ambiguous registration; follow installation guidance only when expected hooks are confirmed absent. Stop if inspection fails or hook state remains uncertain. Registration does not prove execution.

2. **Stage.** Stage only the complete, coherent task change. Preserve unrelated work; ask before altering unrelated staged changes, and never include them in the candidate. Ask if scope or grouping is unclear. If nothing suitable remains, report it and stop.

3. **Audit.** Read the full staged patch once and run `git diff --cached --check`. Check for credentials and local secret files; stop and ask without exposing secret values. Honor required validation, reusing results for unchanged content. Reinspect only changes introduced after this audit.

4. **Message.** Follow recent repository style and explicit requirements. Use a concise subject; add a body only for useful rationale, constraints, or follow-ups. Include existing issue references, never invented ones.

5. **Commit.** Use `git commit -F -` with a quoted heredoc and normal hooks enabled. Use the appropriate continuation for an active Git operation. Default to a new commit; amend only for a verified local follow-up to `HEAD`, asking if an intended amend is uncertain.

   Fix and retry only obvious mechanical failures within the task, re-auditing any changed candidate. Otherwise stop and report the failure.

6. **Verify.** Check the resulting hash, subject, stat, and status. Compare any hook-introduced changes against the audited candidate: autofixes can stage previously unstaged work. Report the commit, checks/hooks actually observed and their results, and remaining changes or blockers. Keep the report concise.
