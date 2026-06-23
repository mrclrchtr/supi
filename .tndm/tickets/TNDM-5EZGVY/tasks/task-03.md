# Task 3: supi-core: add loadSectionConfig shorthand to config

## Goal
Add `loadSectionConfig` shorthand to `packages/supi-core/src/config/config.ts`. This is a thin typed wrapper around the existing `loadSupiConfig` — reduces boilerplate for the common case where defaults provide the type.

## Files
- **Modify:** `packages/supi-core/src/config/config.ts`
- **Test:** `packages/supi-core/__tests__/unit/config/config.test.ts` (add test block)

## API design
```ts
export function loadSectionConfig<T extends Record<string, unknown>>(
  section: string,
  cwd: string,
  defaults: T,
  options?: { homeDir?: string },
): T {
  return loadSupiConfig(section, cwd, defaults, options);
}
```

## TDD
- Test that it delegates to `loadSupiConfig` with the same arguments.
- Test with mocked `loadSupiConfig` using vi.mock.

## Verification
- `pnpm vitest run packages/supi-core/__tests__/unit/config/config.test.ts` passes
- `pnpm exec tsc -b packages/supi-core/tsconfig.json` passes
