# Task 1: Extend HealthData interface and renderer with code action support

## Goal

Add `codeActions` field to the `HealthData` interface and render code action titles in the detailed diagnostics section of `code_health` output.

## Files

- `packages/supi-code-intelligence/src/presentation/markdown/health.ts`

## Changes

1. Add `CodeActionSuggestion` interface:
```ts
interface CodeActionSuggestion {
  file: string;
  line: number;
  title: string;
  kind?: string;
}
```

2. Extend `HealthData` with optional `codeActions` field:
```ts
codeActions: CodeActionSuggestion[] | null;
```

3. In `renderDiagnosticDetails`, after rendering per-file diagnostic counts, render a "### Code Actions" subsection when `data.codeActions` is non-null and non-empty:
```markdown
### Code Actions

Available fixes (suggestions only — not applied):

- `file.ts:12` — "Remove unused import" (quickfix)
- `file.ts:42` — "Add missing return type" (quickfix)
```

4. Import `CodeActionSuggestion` in the health executor.

## Verification

- Unit test: render with code actions produces the "Code Actions" subsection
- Unit test: render without code actions (null or empty) does NOT produce the subsection
- TypeScript compiles clean
