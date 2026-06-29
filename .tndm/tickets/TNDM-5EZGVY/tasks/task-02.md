# Task 2: supi-core: add callWithJsonResponse to src/llm.ts

## Goal
Add `callWithJsonResponse` to `packages/supi-core/src/llm.ts`. This helper wraps the duplicated pattern:
1. Resolve model + auth from ExtensionContext
2. Call `complete()` via `withRetry`
3. Extract text content blocks
4. JSON regex match and parse
5. Validate with TypeBox schema
6. Return typed result or null

## Files
- **Modify:** `packages/supi-core/src/llm.ts`
- **Test:** `packages/supi-core/__tests__/unit/llm.test.ts` (add test block)

## API design
```ts
import { type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { complete } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface CallWithJsonResponseOptions<T extends TSchema> {
  prompt: string;
  schema: T;
  dataContext?: string;
  maxTokens?: number;
  systemPrompt?: string;
  retries?: number;
}

export async function callWithJsonResponse<T extends TSchema>(
  ctx: ExtensionContext,
  options: CallWithJsonResponseOptions<T>,
): Promise<{ parsed: Static<T> } | null> {
  const { prompt, schema, dataContext, maxTokens = 4096, systemPrompt = "", retries = 2 } = options;
  const model = ctx.model ?? ctx.modelRegistry.getAvailable()[0];
  if (!model) return null;
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok || !auth.apiKey) return null;

  const fullPrompt = dataContext ? `${prompt}\n\nDATA:\n${dataContext}` : prompt;

  const response = await withRetry(
    async () => {
      return complete(
        model,
        {
          systemPrompt,
          messages: [{ role: "user", content: [{ type: "text", text: fullPrompt }], timestamp: Date.now() }],
        },
        { apiKey: auth.apiKey, headers: auth.headers, signal: ctx.signal, maxTokens },
      );
    },
    { retries, baseDelayMs: 1000, signal: ctx.signal },
  );

  if (!response) return null;

  const text = response.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Value.Check(schema, parsed)) return null;
    return { parsed: parsed as Static<T> };
  } catch {
    return null;
  }
}
```

## TDD
- The core logic (JSON extraction + TypeBox validation) is testable without LLM. Test: valid JSON passes, invalid JSON returns null, schema mismatch returns null.
- The LLM integration path (model resolution + complete() call) is test-exempt (requires live LLM). Verify through the supi-insights integration tests in Task 7.

## Verification
- `pnpm vitest run packages/supi-core/__tests__/unit/llm.test.ts` passes (json parsing tests)
- `pnpm exec tsc -b packages/supi-core/tsconfig.json` passes
