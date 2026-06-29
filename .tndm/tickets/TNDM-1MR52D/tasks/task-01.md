# Task 1: Write failing tests for CiStatusDialog overlay component

## Goal
Write unit tests for the new `CiStatusDialog` component before implementing it. Tests go in `packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-overlay.test.ts`.

## Tests to write

1. **Renders header and border** — verify the dialog renders a title line containing "Code Intelligence" and DynamicBorder framing.

2. **Shows servers section when servers provided** — mock `ProjectServerInfo[]` with 2 servers (typescript running, bash running). Verify server names, status icons (✓), root paths appear in output.

3. **Hides servers section when empty** — empty array → "no configured language servers" message or section skipped.

4. **Shows problems section with file list** — mock `OutstandingDiagnosticSummaryEntry[]` with 3 files. Verify file paths and error/warning counts.

5. **Shows "no issues" when diagnostics empty** — empty array → "✓ no issues" in output.

6. **Arrow key navigation changes selected file** — simulate ↓ key → selectedFileIdx increments. Verify render output changes (selection indicator on different row).

7. **Enter toggles file expansion** — selectedFileIdx at 0, press Enter → expandedFileIdx = 0, inline diagnostics appear. Press Enter again → collapsed.

8. **Escape calls done()** — simulate Esc → done callback fires.

9. **Caches render output by width** — same width → same output reference. Different width → recomputed.

10. **Shows capabilities section** — semantic ready, structural ready, refactor available. Verify labels.

11. **Shows "unavailable" for missing capabilities** — structural unavailable with reason → reason appears.

12. **Tools section shows code_* tools** — filter works, comma-joined list appears.

## Data shape (test fixtures)

Use the same types as the real component:
```ts
import type { ProjectServerInfo, OutstandingDiagnosticSummaryEntry } from "@mrclrchtr/supi-lsp/api";
```

Mock servers:
```ts
const mockServers: ProjectServerInfo[] = [
  { name: "typescript", root: "/project", status: "running", fileTypes: ["ts","tsx","js","jsx"], supportedActions: ["hover","definition"], openFiles: ["src/index.ts","src/utils.ts"] },
  { name: "bash", root: "/project", status: "running", fileTypes: ["sh","bash"], supportedActions: ["hover"], openFiles: [] },
];
```

Mock diagnostics:
```ts
const mockDiagnostics: OutstandingDiagnosticSummaryEntry[] = [
  { file: "src/index.ts", total: 3, errors: 2, warnings: 1, information: 0, hints: 0 },
  { file: "src/utils.ts", total: 1, errors: 1, warnings: 0, information: 0, hints: 0 },
];
```

## Verification
- Run: `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-overlay.test.ts`
- All tests should FAIL (RED phase) because the component doesn't exist yet
- Ensure failures are for "module not found" or import errors, not assertion mismatches
