---
description: Check a named SuPi package for correct PI tool rendering
argument-hint: "[package path]"
---

# Tool rendering review

Review the package `${1}`.

1. Read `docs/conventions/tool-rendering.md` first.
2. Read the package `CLAUDE.md` and `CONTEXT.md`, then trace every `pi.registerTool()` call, including indirect registration.
3. Apply every applicable rule in `docs/conventions/tool-rendering.md` to every registered tool.

Report only actionable findings with severity, evidence, and the recommended fix. State when the package passes. Finish only after every registered tool is accounted for.
