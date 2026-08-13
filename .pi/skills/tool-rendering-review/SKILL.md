---
name: tool-rendering-review
description: Check a named SuPi package for correct PI tool rendering
disable-model-invocation: true
---

# Tool rendering review

Review the package path supplied by the user. If no package is supplied, ask for it. Do not edit files.

1. Read `docs/tool-rendering.md` first.
2. Read the package `CLAUDE.md` and `CONTEXT.md`, then trace every `pi.registerTool()` call, including indirect registration.
3. For every non-trivial tool, check:
   - `renderCall` and `renderResult` exist, or the package documents an exception.
   - The call view is compact and safe.
   - The result view handles collapsed, expanded, partial, missing-details, and `context.isError` states.
   - Result chrome comes from `details`; it does not parse Markdown `content`.
   - `details` is typed, JSON-safe, bounded, stable, and free of secrets.
   - Large output reports truncation and continuation paths.
   - Shell, width, invalidation, and keybinding rules are followed.
4. Run focused renderer tests when available. Report tests not run.

Report only actionable findings with severity, evidence, and the recommended fix. State when the package passes. Finish only after every registered tool is accounted for.
