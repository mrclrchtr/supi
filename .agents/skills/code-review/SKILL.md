---
name: code-review
description: Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes — Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/PRD asked for?). Runs both reviews in parallel sub-agents and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to "review since X".
---

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating issue / PRD / spec?

Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

The issue tracker should have been provided to you — run `/setup-matt-pocock-skills` if `docs/agents/issue-tracker.md` is missing.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point — a commit SHA, branch name, tag, `main`, `HEAD~5`, etc. If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, peel and verify the fixed point as a commit (`git rev-parse --verify '<fixed-point>^{commit}'`) and capture that full commit ID. Use the captured ID consistently for the diff and `target.baseCommit`. Confirm the diff is non-empty. A bad/non-commit ref or empty diff should fail here — not inside two parallel tasks.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.) — fetch via the workflow in `docs/agents/issue-tracker.md`.
2. A path the user passed as an argument.
3. A PRD/spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

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

### 4. Run both tracks through `supi_review_run`

Call `supi_review_run` once in Direct mode. Use the full commit id resolved in step 1 as `target.baseCommit` and provide two independent review tasks so the Review Engine runs them concurrently. Do not call `supi_review_prepare`; this skill already owns planning and methodology.

```json
{
  "mode": "direct",
  "target": {
    "kind": "comparison",
    "baseCommit": "<resolved full commit id>"
  },
  "review": {
    "sharedContext": "<originating change intent and commit-list context>",
    "tasks": [
      {
        "id": "standards",
        "instructions": "<Standards task below>"
      },
      {
        "id": "spec",
        "instructions": "<Spec task below>"
      }
    ]
  }
}
```

**Standards task instructions** — include:

- The list of standards-source files found in step 3.
- The smell baseline from step 3 pasted in full.
- The brief: "Report — per file/hunk where relevant — (a) every place the change violates a documented standard: cite the standard (file + rule); and (b) any baseline smell you spot: name it and quote the relevant code. Distinguish hard violations from judgment calls — documented-standard breaches can be hard, but baseline smells are always judgment calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec task instructions** — include:

- The path or fetched contents of the spec.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behavior in the change that was not asked for (scope creep); (c) requirements that look implemented but where the implementation is wrong. Quote the spec line for each finding. Under 400 words."

If the spec is missing, omit the Spec task and note this in the final report. The Review Engine supplies the pinned diff and target-aware read tools, so task instructions do not need to repeat a shell diff command.

### 5. Aggregate

Present the separate task results under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings — the two axes are deliberately separate.

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Do not invent a run-level verdict; `supi-review` derives only per-task `pass` or `issues` verdicts.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
