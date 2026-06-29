# Archive

Fresh verification (2026-06-24, ~23:06 UTC):

- **`pnpm verify:ai`**: EXIT 0 — `biome ci` clean, `tsc -b` clean (all packages + tests), **2237 tests passed / 0 failed** (213 files), all 17 packages pack-verified (`pack-all`).
- **Commit delta**: 23 tracked files changed (+453/-259) + 11 new files (2 source, 6 tests, 2 ADRs, 1 ticket).
- **Post-review fixes** (3/3 applied, 0 must-fix):
  - #1: timeout comment corrected (now accurately describes the spawn improvement over the prior execFileSync path).
  - #2: all 10 executors now uniformly use `CodeIntelToolExecCtx` (5 were still on `{ cwd: string }`; zero-behavioral change).
  - #3: JSDoc subtyping terminology fixed (supertype, not subtype).

- **CLAUDE.md**: 3-way throw policy documented; new "Tool adapter contract" gotcha documents truncation + signal/onUpdate forwarding; ADR 0006 cross-reference added to Refactor safety.
- **ADRs**: 0005 (prompt-surface division of labor) and 0006 (refactor-apply file-mutation queue) written during planning; both match the final implementation.
