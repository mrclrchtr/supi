---
status: accepted
---

# Embed Repository Instruction Files in Reviewer Packets

Supersedes [ADR 0013](0013-reference-authoritative-review-criteria.md).

Reviewers need a repository's documented standards, and callers forgot them or compressed them into short `criteriaSources` summaries. Reviewers could still see instruction files through headless `code_orientation`, but only when they happened to call it, cut to 200 lines, and outside the packet hash.

The Review Engine now selects Repository Instruction Files once per Review from the frozen after state and embeds them in full in every Reviewer Packet, before the task-specific lines. It selects the workspace-root file plus the nearest configured file in each ancestor directory of every changed path (when the batch has a change task) and of every Review Scope path. File names come from the caller's effective `code-intelligence.instructionFileNames`. Project configuration applies only when the project is trusted, and the reviewed target's own configuration is never read. Each file carries its path, SHA-256, and size, and a change task also learns which files the target changes or deletes. If the selected files total more than `REVIEW_LIMITS.instructionFileBytes`, the Review fails before fan-out and lists the files and sizes.

The Reviewer Protocol frames embedded files as Review Criteria evidence that cannot override the protocol or the Review Task. Rules addressed to an executing agent, such as landing or running checks, are not Review Criteria. Headless `code_orientation` is seeded with the embedded paths, so it names them as already supplied instead of repeating truncated copies.

`criteriaSources` is removed. Callers name issues, specs, ADRs, and other documents in task `instructions` and quote the rules that apply. The authoritative-source rule moves into the Reviewer Protocol and keeps incomplete Criteria Coverage when a named source is unavailable.

## Considered options

- **Load instruction files as Reviewer context files.** Rejected: context files become system-prompt project instructions, which contradicts treating repository content as untrusted evidence. They are also outside the packet hash and only cover ancestors of the workspace root.
- **Reference files by path and hash only.** Rejected: the hash proves identity, not that the Reviewer read the file.
- **Embed up to a character budget.** Rejected: whether a rule reaches the Reviewer would depend on file sizes and how many packages a change touches. Failing loudly makes the limit a visible configuration problem.
- **Embed the before version in change reviews.** Rejected: a change that moves conventions and code together would produce false findings. The instruction-file diff itself stays Target Evidence.
- **Read file names from the reviewed after state.** Rejected: the reviewed change could then disable its own criteria.

## Consequences

- Breaking change to `review_run` input: a task with `criteriaSources` is rejected.
- Packets grow by the embedded files, about 4–7k tokens for a typical single-package change in this repository.
- Global (personal) instruction files are never embedded. Planner Drafts and Submission Recovery receive none.
- One selection serves every task, so tasks in one Review share the packet prefix up to `Task id`. Concurrent tasks start together, so a provider cache hit across them is not guaranteed.
