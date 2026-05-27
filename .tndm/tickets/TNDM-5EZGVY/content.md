# Cross-cutting refactoring: share utilities and standardize patterns

## Scope

6 refactoring items across supi-core, supi-insights, supi-review, and settings consumers (supi-cache, supi-bash-timeout, supi-claude-md, supi-rtk, supi-insights).

## New supi-core exports

| Export path | Contents |
|---|---|
| `supi-core/llm` (new) | `withRetry`, `callWithJsonResponse` |
| `supi-core/config` (extend) | `loadSectionConfig` shorthand |
| `supi-core/tool-framework` (extend) | `runWithProgressWidget` |

## Items

### 1. `withRetry` → `supi-core/llm`

Move `withRetry` from `supi-insights/src/utils.ts` to `supi-core/src/llm.ts`. Enhance with optional AbortSignal support and debug logging callbacks.

```ts
withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    retries?: number;        // default: 2
    baseDelayMs?: number;    // default: 1000
    signal?: AbortSignal;
    logger?: (attempt: number, error: unknown) => void;
    onRetry?: (attempt: number, delayMs: number) => void;
  }
): Promise<T | null>
```

### 2. `callWithJsonResponse` → `supi-core/llm`

New helper that wraps the duplicated LLM-call-then-JSON-parse pattern. Handles model resolution, retry, text extraction, JSON regex matching, TypeBox validation.

```ts
callWithJsonResponse<T>(
  ctx: ExtensionContext,
  options: {
    prompt: string;
    schema: TSchema;           // TypeBox schema
    dataContext?: string;
    maxTokens?: number;
    systemPrompt?: string;
    retries?: number;
  }
): Promise<{ parsed: Static<T> } | null>
```

Replaces 9 call sites in supi-insights and provides a reusable pattern for future packages.

### 3. Declarative `persistChange` in settings

Extend `ConfigSettingsOptions` with an auto-generated `persistChange` when all `SettingItem`s declare `configType`. Supported types: `"boolean"`, `"number"`, `"stringList"`.

Packages migrating to declarative:
- `supi-bash-timeout/src/settings-registration.ts` — 1 number setting
- `supi-cache/src/settings-registration.ts` — 2 boolean + 2 number settings
- `supi-claude-md/src/settings-registration.ts` — 1 boolean + 1 stringList setting
- `supi-rtk/src/rtk.ts` — 1 boolean + 1 number setting
- `supi-insights` — inline in extension.ts — 1 boolean + 2 number settings

### 4. `runWithProgressWidget` → `supi-core/tool-framework`

Extract the duplicated `ctx.ui.custom()` + `ReviewProgressWidget` + `supi:working:start/end` pattern from supi-review into a shared helper.

```ts
runWithProgressWidget<T>(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  title: string,
  runner: (signal: AbortSignal, onProgress: (p: ProgressUpdate) => void) => Promise<T>
): Promise<T | null>
```

Automatically emits `supi:working:start/end` events and handles widget lifecycle, abort, and error catching.

### 5. `loadSectionConfig` shorthand → `supi-core/config`

Simple typed wrapper around `loadSupiConfig` to reduce boilerplate in consumer packages.

```ts
loadSectionConfig<T>(section: string, cwd: string, defaults: T, options?: { homeDir?: string }): T
```

### 6. `supi:working:start/end` to supi-insights

Covered automatically by item 4 — when supi-insights uses `runWithProgressWidget` for its LLM phases, the working events fire.

## Files to change

### New files
- `packages/supi-core/src/llm.ts` — withRetry + callWithJsonResponse

### Modified files

**supi-core:**
- `packages/supi-core/src/config/config-settings.ts` — declarative persistChange support
- `packages/supi-core/src/config/config.ts` — add loadSectionConfig
- `packages/supi-core/src/tool-framework.ts` — add runWithProgressWidget
- `packages/supi-core/src/api.ts` — re-export llm module
- `packages/supi-core/package.json` — add llm subpath export

**supi-insights:**
- `packages/supi-insights/src/insights.ts` — use callWithJsonResponse + runWithProgressWidget
- `packages/supi-insights/src/generator.ts` — replace LLM calls with callWithJsonResponse
- `packages/supi-insights/src/extractor.ts` — replace LLM calls with callWithJsonResponse
- `packages/supi-insights/src/utils.ts` — remove withRetry (moved to core)

**supi-review:**
- `packages/supi-review/src/review.ts` — use runWithProgressWidget

**Settings consumers (migrate to declarative):**
- `packages/supi-bash-timeout/src/settings-registration.ts`
- `packages/supi-cache/src/settings-registration.ts`
- `packages/supi-claude-md/src/settings-registration.ts`
- `packages/supi-rtk/src/rtk.ts`
- `packages/supi-insights/src/insights.ts`

## Non-goals
- Not touching code-intelligence, LSP, or tree-sitter packages
- Not changing pi framework types
- Not splitting/merging packages
- Not adding test coverage (separate concern)
- Not changing api.ts/index.ts convention
