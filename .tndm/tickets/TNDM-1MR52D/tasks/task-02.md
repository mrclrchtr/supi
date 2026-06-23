# Task 2: Implement CiStatusDialog overlay component

## Goal
Implement `CiStatusDialog` in `packages/supi-code-intelligence/src/ui/code-intelligence-status-overlay.ts` — a pi-tui Component class plus a factory function for use with `ctx.ui.custom()`.

## Implementation

### Imports
- `DynamicBorder` from `@earendil-works/pi-coding-agent`
- `Container`, `Spacer`, `Text`, `truncateToWidth`, `visibleWidth`, `matchesKey`, `Key` from `@earendil-works/pi-tui`
- Types: `ProjectServerInfo`, `OutstandingDiagnosticSummaryEntry` from `@mrclrchtr/supi-lsp/api`

### Data interface
```ts
export interface CiStatusData {
  servers: ProjectServerInfo[];
  diagnostics: OutstandingDiagnosticSummaryEntry[];
  capabilities: {
    semantic: { kind: string; reason?: string; providerAvailable: boolean };
    structural: { kind: string; reason?: string; providerAvailable: boolean };
    refactorAvailable: boolean;
  };
  activeTools: string[];
}
```

### CiStatusDialog class
- Implements Component interface: `render(width): string[]`, `handleInput(data): void`, `invalidate(): void`
- Constructor: `(data: CiStatusData, theme: any, done: () => void, tui: { requestRender: () => void })`
- State: `selectedFileIdx: number` (0), `expandedFileIdx: number | null` (null)
- `render(width)` builds Container with:
  1. DynamicBorder top
  2. Header: `"◆ Code Intelligence       /ci-status toggles · esc"`
  3. Summary line (aggregate counts)
  4. Spacer(1)
  5. Servers section (if servers.length > 0)
  6. Spacer(1)
  7. Problems section (diagnostics, with expand)
  8. Spacer(1)
  9. Capabilities section
  10. Spacer(1)
  11. Tools section (if activeTools.length > 0)
  12. Spacer(1)
  13. DynamicBorder bottom
- Caching: `cachedWidth`/`cachedLines`, invalidate clears
- `handleInput(data)`: ↑↓ navigate, Enter/Space toggle expand, Esc done(). Calls `invalidate()` + `tui.requestRender()` after state change
- Private helpers: `renderSummaryLine`, `renderServerSection`, `renderProblemsSection`, `renderCapabilitiesSection`, `renderToolsSection`
- Theme: accent headers, success status, error/warning counts, dim hints
- Every line wrapped in `truncateToWidth()`

### Factory
```ts
export function createCiStatusDialog(
  data: CiStatusData, theme: any, done: () => void, tui: { requestRender: () => void }
): CiStatusDialog
```

## Verification
- Run: `pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-intelligence-status-overlay.test.ts`
- All 12 tests from Task 1 should now PASS
