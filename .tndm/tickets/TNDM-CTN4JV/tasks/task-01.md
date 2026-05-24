# Task 1: Add CodePosition and CodeLocation to supi-core

## RED: Write failing test

Create `packages/supi-core/__tests__/unit/substrate-types.test.ts`:

- Import `CodePosition`, `CodeLocation` from `@mrclrchtr/supi-core/api`
- Test that `CodePosition` is constructable with `{ line: 0, character: 0 }`
- Test that `CodeLocation` is constructable with `{ uri: "file:///x.ts", range: { start: { line: 0, character: 0 }, end: { line: 1, character: 5 } } }`
- Test that both types are exported from `@mrclrchtr/supi-core/api`

Verify this test fails (import errors — file doesn't exist yet).

## GREEN: Implement

Create `packages/supi-core/src/substrate-types.ts`:

```ts
export interface CodePosition {
  line: number;
  character: number;
}

export interface CodeLocation {
  uri: string;
  range: { start: CodePosition; end: CodePosition };
}
```

Export from `packages/supi-core/src/api.ts`:

```ts
export type { CodeLocation, CodePosition } from "./substrate-types.ts";
```

Export from `packages/supi-core/src/index.ts` (re-export from api):

```ts
export type { CodeLocation, CodePosition } from "./api.ts";
```

Verify test passes. Run `pnpm vitest run packages/supi-core/` to ensure no regressions across all supi-core tests.
