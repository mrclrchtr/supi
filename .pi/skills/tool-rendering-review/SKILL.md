---
name: tool-rendering-review
description: Check a named SuPi package for correct PI tool rendering
disable-model-invocation: true
---

# Tool rendering review

Review the package path supplied by the user. If no package is supplied, ask for it. Do not edit files.

1. Read `docs/tool-rendering.md` first.
2. Read the package `CLAUDE.md` and `CONTEXT.md`, then trace every `pi.registerTool()` call, including indirect registration.
3. Apply every applicable rule in `docs/tool-rendering.md` to every registered tool.

Report only actionable findings with severity, evidence, and the recommended fix. State when the package passes. Finish only after every registered tool is accounted for.
