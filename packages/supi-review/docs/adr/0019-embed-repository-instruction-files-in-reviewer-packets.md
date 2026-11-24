---
status: accepted
---

# Carry Repository Instruction Files in Reviewer Packets

Supersedes [ADR 0013](0013-reference-authoritative-review-criteria.md).

Reviewers need a repository's documented standards, and callers forgot them or compressed them into short `criteriaSources` summaries. Reviewers could still see instruction files through headless `code_orientation`, but only when they happened to call it, and outside the packet hash.

The Review Engine now selects Repository Instruction Files once per Review from the frozen after state: the workspace-root file plus the nearest configured file in each ancestor directory of every changed path (when the batch has a change task) and of every Review Scope path. File names come from the caller's effective `code-intelligence.instructionFileNames`. Project configuration applies only when the project is trusted, and the reviewed target's own configuration is never read.

The packet uses a hybrid before the task-specific lines:

- The **root file is embedded in full** with its SHA-256 and line count. It holds the repository-wide rules and is what every Pi session loads natively. A root file above `REVIEW_LIMITS.instructionFileBytes` fails the Review before fan-out.
- **Deeper files are indexed**: path, SHA-256, line count, change status, and the changed or Review Scope paths they cover, all computed mechanically. The Reviewer Protocol asks the Reviewer to get those rules before judging code in a covered path, through `code_orientation` on the directory or a full `read`. Headless `code_orientation` is seeded only with the embedded root file, so it still delivers indexed files.
- A change task also learns which files the target changes or deletes.

The Reviewer Protocol frames instruction files as Review Criteria evidence that cannot override the protocol or the Review Task. Rules addressed to an executing agent, such as landing or running checks, are not Review Criteria.

`criteriaSources` is removed. Callers name issues, specs, ADRs, and other documents in task `instructions` and quote the rules that apply. The authoritative-source rule moves into the Reviewer Protocol and keeps incomplete Criteria Coverage when a named source is unavailable.

## Considered options

- **Load instruction files as Reviewer context files.** Rejected: context files become system-prompt project instructions, which contradicts treating repository content as untrusted evidence. They are also outside the packet hash and only cover ancestors of the workspace root.
- **Embed every selected file in full.** Implemented first and replaced before release: a change across three packages carried about 49,000 characters of instruction files per task, most of them irrelevant to the change. Kept as the fallback if measurement shows Reviewers skip indexed files.
- **Embed the root plus files the target modifies.** Rejected for now: rare, and the instruction-file diff is already Target Evidence.
- **Reference every file by path and hash only.** Rejected: the root file's repository-wide rules would depend on the Reviewer fetching them.
- **Require reading every indexed file at the start.** Rejected: it costs nearly as much as embedding.
- **Read file names from the reviewed after state.** Rejected: the reviewed change could then disable its own criteria.

## Consequences

- Breaking change to `review_run` input: a task with `criteriaSources` is rejected.
- Packets grow by the root file (about 3,700 tokens in this repository) plus one index line per deeper file.
- Whether Reviewers reach indexed files is measured, not assumed: each `review-task` Debug event carries `instructionFileUsage` counts (indexed, delivered by `code_orientation`, read in full, mentioned in `bash`, reached). [#685](https://github.com/mrclrchtr/supi/issues/685) found that Claude-family Reviewers rarely use `code_*` tools and often skip instruction files, so this decision is to be revalidated with those counts.
- Global (personal) instruction files are never carried. Planner Drafts and Submission Recovery receive none.
- One selection serves every task. Tasks of the same Review Mode share the packet prefix up to `Task id`; change and state tasks diverge at the first change status. Concurrent tasks start together, so a provider cache hit across them is not guaranteed.
