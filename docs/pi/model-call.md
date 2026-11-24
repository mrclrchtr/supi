# Make model calls from an extension

## Pi request authority

Use `ctx.modelRegistry.complete(model, context, options)` for API-specific options outside the agent loop. On Pi 0.86.0 or later, use `ctx.modelRegistry.streamSimple(model, context, options).result()` for provider-neutral options and Pi's simple output-limit handling. Both paths resolve the current provider, authentication, OAuth refresh, headers, environment, and credential-specific endpoint.

The installed Pi example `examples/extensions/summarize.ts` uses this public registry method. `ExtensionAPI` (`pi`) does not expose `callModel()`.

```typescript
const model = ctx.modelRegistry.find("openai", "gpt-5.2");
if (!model) return;

const response = await ctx.modelRegistry.complete(
  model,
  {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "Summarize this" }],
        timestamp: Date.now(),
      },
    ],
  },
  { signal: ctx.signal, maxTokens: 4096 },
);
```

- Select the model under the feature's model policy.
- Let the registry resolve auth at dispatch. Copying selected fields from `getApiKeyAndHeaders()` can lose the resolved endpoint and bypass the registered provider implementation.
- Handle both a rejected promise and an assistant response with `stopReason: "error"` or `"aborted"`.
- `complete()` uses the full provider options. The registry simple path supplies model-derived output limits and other simple-option mappings. Use the registry rather than compat `completeSimple()` so extension-registered providers remain available.
- A public Pi AI package subpath is not necessarily available through Pi's extension loader. Use the registry for model calls rather than importing helpers such as `@earendil-works/pi-ai/api/simple-options`. See the [Pi maintainer's loader guidance](https://github.com/earendil-works/pi/issues/4595#issuecomment-4468203851).
- A standalone registry call does not inherit the active AgentSession's session identity or SDK attribution transform.

## SuPi direct completions

Use `completeSimpleModelRequest()` for provider-neutral SuPi requests, including prompt suggestions. Use `completeModelRequest()` when a caller needs API-specific options. Both are exported from `@mrclrchtr/supi-core/llm` and share request identity and header policy:

```typescript
const response = await completeSimpleModelRequest(ctx, model, context, {
  affinityScope: "prompt-suggestions",
  signal: ctx.signal,
});
```

The simple helper requires Pi 0.86.0 or later. It delegates output limits to Pi without importing Pi AI subpaths. API-specific callers retain their current interface:

```typescript
import { completeModelRequest } from "@mrclrchtr/supi-core/llm";

const response = await completeModelRequest(ctx, model, context, {
  affinityScope: "feature:prompt-stream",
  signal: ctx.signal,
  maxTokens: 4096,
});
```

| Owner | Responsibility |
| --- | --- |
| Pi model registry | Provider dispatch, request auth, OAuth refresh, effective endpoint, auth headers, environment |
| Both SuPi completion helpers | Stable separate request identity, one-shot continuation default, and OpenCode header defaults |
| Pi simple path | Model-derived output limits and context guards for provider-neutral requests |
| Calling feature | Model selection, prompt, explicit limit overrides, cancellation, retries, validation, error presentation |

Choose a stable scope for each distinct feature prompt stream. Do not put prompt text, turn numbers, retry counts, credentials, or project paths into that scope. The helper derives an opaque identity from the scope, Pi session, provider, and model. Repeated calls in the same stream retain that identity without using the primary agent's identity.

The helper does not change provider cache retention defaults or guarantee a cache hit rate. Explicit configured session headers retain precedence and can remove the default separation.

Each direct request builds a fresh context, so it can never continue the previous call in its stream. Both helpers therefore default `disableContinuation` to `true`: providers neither use nor retain continuation state for the request, such as Anthropic message threads or a warm `claude-code` process per session ID. The session ID stays, so cache and routing affinity are unchanged; providers without continuation state ignore the option. Pass `disableContinuation: false` only for a feature that sends real follow-up turns ([issue #692](https://github.com/mrclrchtr/supi/issues/692)).

## OpenCode compatibility on Pi 0.85.1

Pi's SDK supplies OpenCode session headers for AgentSession requests. Direct registry completions need their own transform on this version.

The shared helper adds defaults for `opencode`, `opencode-go`, or the exact model URL hostname `opencode.ai`:

- `x-opencode-session`: separate request identity;
- `x-opencode-client`: `pi`.

Configured header values and deletion markers retain precedence, with case-insensitive header matching. Other providers do not receive OpenCode headers.

The public `transformHeaders` option runs after auth/model/explicit headers are merged and before provider dispatch. Use this option instead of resolving auth a second time. Source: installed pi-ai `README.md`, **Transforming Request Headers**.

## Child sessions

Agent Runs in `supi-agent-runtime` retain their private Pi runtime and borrowed Provider Authority. They do not use the direct-completion helper. Pi already forwards each child's SessionManager ID; preserve it across child turns and continuation.

When a borrowed provider delegates to the current parent provider, it must preserve the prepared model's effective endpoint. Replacing the prepared model with an unmodified catalog entry can lose a Copilot credential-specific endpoint.

## Evidence and decisions

Request handling was verified against Pi and pi-ai 0.85.1. Registry simple completion was added in Pi 0.86.0 and verified with 0.86.1:

- Pi `docs/extensions.md`: model registry and provider auth.
- Pi `examples/extensions/summarize.ts`: public registry completion.
- Pi `dist/core/model-runtime.js`: auth and endpoint preparation.
- Pi `dist/core/sdk.js` and `provider-attribution.js`: session ID and OpenCode headers.
- pi-ai `README.md`: auth ownership, request header ordering, and compat migration.
- pi-ai `dist/types.d.ts` (`StreamOptions.disableContinuation`), `README.md` (Anthropic message threads), and [pi#11545](https://github.com/earendil-works/pi/pull/11545): one-shot requests opt out of continuation state; verified with Pi 1.5.1.

Related: [request decision](../adr/0023-pi-owned-model-requests.md), [issue #402](https://github.com/mrclrchtr/supi/issues/402), and [context architecture](context-architecture.md).
