# Task 2: Abort-aware ripgrep (A-deep)

Rewrite `runRipgrepJson` in `search-helpers.ts` from `execFileSync("rg", ...)` to async `spawn` + `AbortSignal` so code_find/code_impact are genuinely cancellable. Propagate the new async signature to all callers (generate-pattern.ts, execute-find.ts, etc.). Pass `signal` from the executor ctx through to the ripgrep call. Keep behavior identical when signal is absent/uncancelled. Run `pnpm verify:ai`; audit tests that call ripgrep-backed paths.
