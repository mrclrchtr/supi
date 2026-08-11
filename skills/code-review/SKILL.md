---
name: code-review
description: Review changes since a fixed point along two axes — Standards and Spec. Runs isolated reviews in parallel with SuPi and reports them side by side. Use for branches, pull requests, work-in-progress changes, or requests to "review since X".
---

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating issue / spec?

Both axes run as isolated `supi_review_run` tasks so they do not affect each other's context. This skill then aggregates their findings.

The issue tracker should have been provided to you. If `docs/agents/issue-tracker.md` is missing, ask the user to run `/skill:setup-matt-pocock-skills`.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point — a commit SHA, branch name, tag, `main`, `HEAD~5`, etc. If they didn't specify one, ask for it.

Capture the diff command once. For committed changes, use `git diff <fixed-point>...HEAD` so the comparison uses the merge base. For work-in-progress changes, use `git diff <fixed-point>` so the command also includes the current filesystem. Also note the commit list with `git log <fixed-point>..HEAD --oneline`.

Before going further, resolve the fixed point to a commit SHA (`git rev-parse <fixed-point>`) and confirm that the selected diff is not empty. A bad ref or empty diff must fail here, not inside the review tasks.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.) — fetch via the workflow in `docs/agents/issue-tracker.md`.
2. A path the user passed as an argument.
3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there is no spec, omit the **Spec** task and report "no spec available".

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below — a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation — and, like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name** — a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code** — the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy** — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession** — a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change** — one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest** — a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Run the isolated reviews

Call `supi_review_run` once with `direct` tasks so both axes run concurrently against one frozen state.

Choose the target from the user's intent:

- Work-in-progress changes, including uncommitted files: `workingTree` with the resolved fixed-point SHA as `baseCommit`.
- Committed branch or pull-request changes: `comparison` with the resolved fixed-point SHA as `baseCommit`.
- One named commit: `commit` with its resolved SHA.

Put the diff command and commit list in `sharedContext`. Use `findingScope: "change-only"` for each task.

**`standards` task** — include:

- The standards-source paths and the complete smell baseline from step 3.
- This brief: "Report, per file or hunk: (a) each documented-standard violation, with the source file and rule; and (b) each baseline smell, with its name and evidence. Distinguish hard violations from judgement calls. Baseline smells are always judgement calls, and a documented project standard overrides the baseline. Skip checks that tooling enforces. Use no more than 400 words."

**`spec` task** — include:

- The spec path or fetched contents.
- This brief: "Report: (a) missing or partial requirements; (b) unrequested behavior or scope creep; and (c) requirements that appear implemented incorrectly. Quote the spec for each finding. Use no more than 400 words."

Add repository documents as `criteriaSources` when they are authoritative and the tool limit permits it. If there is no spec, run only the `standards` task and note the missing axis. If `supi_review_run` is unavailable, run the two axes sequentially in the current session and state that isolation was unavailable.

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings — the two axes are deliberately separate (see _Why two axes_).

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes — that's the reranking the separation exists to prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
