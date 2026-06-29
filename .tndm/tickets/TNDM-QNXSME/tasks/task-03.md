# Task 3: onUpdate progress emission (A-progress)

Emit `onUpdate?.({ content: [{ type: "text", text: "..." }], details: { progress } })` from the genuinely long-running executors: code_find (rg searching), code_impact (changedFiles + semantic sweep), code_graph with relations:["all"], code_health with refresh, code_refactor_plan (LSP refactor request). Others accept onUpdate and no-op. Keep updates coarse (start + a couple of progress beats) — not chatty. Run `pnpm verify:ai`.
