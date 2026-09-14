# Make model calls from an extension

## PI request authority

Use `ctx.modelRegistry.complete(model, context, options)` for a completion outside the agent loop. PI resolves the current provider, authentication, OAuth refresh, headers, environment, and credential-specific endpoint for that request.

The installed PI example `examples/extensions/summarize.ts` uses this public registry method. `ExtensionAPI` (`pi`) does not expose `callModel()`.

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
- `complete()` uses the full provider options. It is not identical to compat `completeSimple()`, which supplies model-derived output limits and other simple-option mappings.
- A standalone registry call does not inherit the active AgentSession's session identity or SDK attribution transform.

## SuPi direct completions

Use the shared `completeModelRequest()` module for SuPi direct completions:

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
| PI model registry | Provider dispatch, request auth, OAuth refresh, effective endpoint, auth headers, environment |
| `completeModelRequest` | Stable separate request identity and PI 0.85.1 OpenCode header defaults |
| Calling feature | Model selection, prompt, output limits, cancellation, retries, validation, error presentation |

Choose a stable scope for each distinct feature prompt stream. Do not put prompt text, turn numbers, retry counts, credentials, or project paths into that scope. The helper derives an opaque identity from the scope, PI session, provider, and model. Repeated calls in the same stream retain that identity without using the primary agent's identity.

The helper does not change provider cache retention defaults or guarantee a cache hit rate. Explicit configured session headers retain precedence and can remove the default separation.

## OpenCode compatibility on PI 0.85.1

PI's SDK supplies OpenCode session headers for AgentSession requests. Direct registry completions need their own transform on this version.

The shared helper adds defaults for `opencode`, `opencode-go`, or the exact model URL hostname `opencode.ai`:

- `x-opencode-session`: separate request identity;
- `x-opencode-client`: `pi`.

Configured header values and deletion markers retain precedence, with case-insensitive header matching. Other providers do not receive OpenCode headers.

The public `transformHeaders` option runs after auth/model/explicit headers are merged and before provider dispatch. Use this option instead of resolving auth a second time. Source: installed pi-ai `README.md`, **Transforming Request Headers**.

## Child sessions

Agent Runs in `supi-agent-runtime` retain their private PI runtime and borrowed Provider Authority. They do not use the direct-completion helper. PI already forwards each child's SessionManager ID; preserve it across child turns and continuation.

When a borrowed provider delegates to the current parent provider, it must preserve the prepared model's effective endpoint. Replacing the prepared model with an unmodified catalog entry can lose a Copilot credential-specific endpoint.

## Evidence and decisions

Verified against installed PI and pi-ai 0.85.1:

- PI `docs/extensions.md`: model registry and provider auth.
- PI `examples/extensions/summarize.ts`: public registry completion.
- PI `dist/core/model-runtime.js`: auth and endpoint preparation.
- PI `dist/core/sdk.js` and `provider-attribution.js`: session ID and OpenCode headers.
- pi-ai `README.md`: auth ownership, request header ordering, and compat migration.

Related: [request decision](../adr/0023-pi-owned-model-requests.md), [issue #402 plan](../ops/issue-402-model-requests.md), and [context architecture](context-architecture.md).
