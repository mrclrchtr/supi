# Task 1: supi-core: add withRetry to new src/llm.ts

## Goal
Create `packages/supi-core/src/llm.ts` and move `withRetry` from `supi-insights/src/utils.ts`. Enhance with AbortSignal support and debug logging callbacks.

## Files
- **Create:** `packages/supi-core/src/llm.ts`
- **Test:** `packages/supi-core/__tests__/unit/llm.test.ts` (new)

## API design
```ts
export interface WithRetryOptions {
  retries?: number;        // default: 2
  baseDelayMs?: number;    // default: 1000
  signal?: AbortSignal;
  logger?: (attempt: number, error: unknown) => void;
  onRetry?: (attempt: number, delayMs: number) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: WithRetryOptions,
): Promise<T | null> {
  const { retries = 2, baseDelayMs = 1000, signal, logger, onRetry } = options ?? {};
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) return null;
    try {
      return await fn();
    } catch (err) {
      logger?.(attempt, err);
      if (attempt < retries && !signal?.aborted) {
        const delayMs = baseDelayMs * 2 ** attempt;
        onRetry?.(attempt, delayMs);
        await new Promise((r, reject) => {
          const t = setTimeout(r, delayMs);
          signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
        });
      }
    }
  }
  return null;
}
```

## TDD
- RED: Write tests for success on first try, success after retry, exhaustion, abort, and logger/onRetry callbacks.
- GREEN: Implement `withRetry`.
- REFACTOR: Clean up.

## Verification
- `pnpm vitest run packages/supi-core/__tests__/unit/llm.test.ts` passes
- `pnpm exec tsc -b packages/supi-core/tsconfig.json` passes

