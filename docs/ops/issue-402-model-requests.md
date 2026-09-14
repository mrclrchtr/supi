# Issue #402: PI-owned model requests

Status: implemented and reviewed. Focused checks and packaging pass. Full verification is blocked by four LSP integration failures reproduced at the base commit.

Issue: <https://github.com/mrclrchtr/supi/issues/402>

## Verified findings

Pre-change evidence baseline: installed PI and pi-ai 0.85.1.

| Path | Finding |
| --- | --- |
| `packages/supi-prompt-suggestions/src/generation/client.ts` | Direct compat completion does not pass a session identity. The local request probe reproduced OpenCode `MissingSessionID`. |
| `packages/supi-prompt-suggestions/src/generation/model-resolution.ts` | Selected auth fields are copied, but the resolved endpoint is omitted. |
| `packages/supi-prompt-suggestions/src/session.ts` | Generation errors clear the spinner without a visible explanation. |
| `packages/supi-core/src/llm.ts` and `packages/supi-insights/src/extractor.ts` | Direct compat calls also copy selected auth fields and omit routing identity. |
| `packages/supi-agent-runtime/src/provider-authority.ts` | `resolveParentModel()` replaces the prepared child model with a catalog model. This can discard the auth-resolved endpoint. |

The Agent Run auth merge already spreads provider auth, including its endpoint. A missing `baseUrl` field in the model-specific auth type alone is not proof of endpoint loss.

PI's SDK already forwards each child SessionManager ID into request options and OpenCode attribution. The earlier claim that Agent Runs lacked session-ID forwarding was incorrect. No new parent-derived review identity is needed.

The Copilot comment does not establish an exact cause for all Copilot failures. The plan fixes the verified endpoint-loss paths and adds credential-specific endpoint coverage; it does not claim a live reproduction for every account type.

### Installed evidence

Paths below are relative to `node_modules/`:

- `@earendil-works/pi-coding-agent/docs/extensions.md`: model registry and provider auth.
- `@earendil-works/pi-coding-agent/examples/extensions/summarize.ts`: public registry completion.
- `@earendil-works/pi-coding-agent/dist/core/model-runtime.js`: auth resolution, header transform, and prepared model endpoint.
- `@earendil-works/pi-coding-agent/dist/core/sdk.js`: Agent session identity and request attribution.
- `@earendil-works/pi-coding-agent/dist/core/provider-attribution.js`: OpenCode matching and header precedence.
- `@earendil-works/pi-ai/README.md`: auth ownership and request header ordering.
- `@earendil-works/pi-ai/dist/api/simple-options.js`: simple-completion output defaults and context guard.

## Scope

1. Add shared direct request handling through `supi-core/llm` and public `ctx.modelRegistry.complete()`.
2. Migrate prompt suggestions, the JSON helper, and direct Insights completions.
3. Fix effective endpoint preservation in Agent Run provider delegation. This serves both `supi-review` and `supi-agent`.
4. Make actionable prompt-suggestion failures visible without repeated notifications.
5. Correct `docs/pi/model-call.md` and affected package guidance when the implementation is complete.

## Request ownership

- PI resolves auth for the request. Callers do not pre-resolve and forward selected credential fields.
- The shared module owns dispatch, direct-call affinity identity, and OpenCode compatibility.
- Features retain model selection, prompts, limits, cancellation, retries, output validation, and UI policy.
- Retain the existing Agent Run session lifecycle and Provider Authority. Do not route child sessions through the direct-completion helper.
- Do not add a dependency from `supi-core` to `supi-agent-runtime`.
- Keep existing feature behavior outside this scope. Do not introduce a common retry or notification policy for all packages.

## Cache and request identity

- Derive a stable, opaque, bounded identity from a feature prompt-stream namespace, PI session ID, provider, and model. Do not include prompts, project paths, credentials, or account secrets.
- Keep the value within provider key limits; OpenAI currently accepts at most 64 characters.
- Prompt suggestions reuse the identity across assistant turns, `/reload`, and resume of the same PI session. Do not include a turn number, timestamp, or retry number.
- Use separate Insights scopes for extraction, chunk summaries, report sections, and overview. Retries retain their scope.
- New PI sessions, different prompt streams, or different provider/model selections have distinct derived identities.
- Agent Runs retain PI's child session IDs. Each child ID remains stable through its requests and same-session continuation, and separate from the parent and sibling children.
- Leave prompt-suggestion cache retention unset so PI/provider defaults apply. Do not force long retention or copy the main agent's thinking settings.
- Do not alter the primary agent's prompt, tools, history, or request identity. Do not append suggestion requests, responses, or warnings to its conversation.
- Separation is a client-side routing property, not a guarantee of provider cache hit rate. Preserve explicit configured header overrides even if they remove the default separation.

## OpenCode compatibility

- Support PI 0.85.1 without requiring an upstream release.
- Match PI's built-in rule: provider `opencode` or `opencode-go`, or exact URL hostname `opencode.ai`. Do not use substring matching.
- Add `x-opencode-session` from the separate request identity and `x-opencode-client: pi` after PI resolves request headers.
- Treat these as defaults. Preserve explicit values and header deletion markers; compare names without case sensitivity.
- Do not resolve auth a second time just to add headers.
- Do not add OpenCode headers to unrelated providers. Do not duplicate header policy in each feature or in child sessions already handled by PI.
- Keep the fallback safe when PI supplies native handling. No PI peer dependency range change is planned.

## Prompt-suggestion behavior

- Keep the fixed system prompt and the last 8,000 characters of assistant text. No tools or primary conversation context are added.
- Keep model-default output limits rather than adding a 256-token cap. Registry `complete()` is not identical to compat `completeSimple()`; preserve the relevant model limit and context safety behavior during migration.
- Keep generation in the background, with existing cancellation, stale-result checks, and timeout. Do not add feature-level retries.
- Notify for unavailable selected models, missing auth, request failures, and timeout.
- Remain quiet for disabled suggestions, normal cancellation, stale results, and valid empty output.
- Show provider/model plus a bounded safe failure summary. Do not put raw provider bodies, credentials, prompts, or generated text into notifications or normal diagnostics.
- Notify on the first failure for the active provider/model/affinity stream. Suppress further failure notifications until a successful request, a configuration change, or a new PI session. A valid empty response is a successful request.
- Warning suppression is in memory. Session start, including reload or resume, starts a new warning cycle; the derived routing identity remains stable for the same PI session.
- Clear the spinner on every terminal path. Do not add persistent footer errors.
- Retain safe debug metadata for repeated failures.

## Verification criteria

Use controlled providers and captured requests without live credentials.

- [x] Direct callers dispatch through PI registry authority; they do not copy auth fields.
- [x] OpenCode built-ins and exact-host aliases receive the separate identity on PI 0.85.1.
- [x] Unrelated hosts receive no OpenCode headers; explicit header values and deletion markers retain precedence.
- [x] Derived IDs are stable across suggestion turns, reload, resume, and retries; distinct streams, sessions, providers, and models are separated.
- [x] Suggestion requests leave the primary context, session identity, and prompt bytes unchanged.
- [x] Copilot-style auth-resolved endpoints reach the final direct provider request.
- [x] Agent Run delegation preserves the effective endpoint and existing auth headers/environment for both stream methods.
- [x] Child requests retain their PI session ID through multiple turns and continuation; parent and sibling IDs remain separate.
- [x] Prompt-suggestion model limits and context safety remain valid after the completion migration.
- [x] Auth failures, thrown errors, error responses, and timeouts produce one safe notification; cancellation and stale results stay quiet.
- [x] Notification suppression resets after success, configuration change, and new session.
- [x] Existing Insights retries, JSON handling, and feature error behavior remain intact.
- [ ] `pnpm verify:ai` passes after implementation. Blocked by the baseline LSP failures listed below.

Existing prompt-suggestion checks passed before implementation: 22 tests and TypeScript checks. They do not cover all criteria above and are not proof of provider cache behavior.

## Verification record

| Check | Result |
| --- | --- |
| Final `pnpm biome:ai` | Passed |
| Final `pnpm typecheck:ai` | Passed across the workspace |
| Focused Vitest run for core, Insights, suggestions, Agent Runtime, review, and agent | 110 files passed; 821 tests passed, 2 skipped |
| `pnpm pack:verify` | All 21 packages passed |
| Full `pnpm verify:ai` before review fixes | 3,386 tests passed, 2 skipped, 4 failed; lint, types, WASM, and skills checks passed |
| Base-commit reproduction | The same four failures reproduced at `52315e0c613133a752913b1b9b6b797a37ee9cbb` in a separate detached worktree with an offline workspace install |

Baseline failures:

- `client.integration.typescript-diagnostics.test.ts`: dependent diagnostics timeout and refresh request-count mismatch.
- `workspace-runtime.integration.barrier.test.ts`: longer-deadline caller timeout and an unhandled assertion.
- `client.integration.kotlin.test.ts`: pull-diagnostics timeout.

The base and current focused LSP runs each had 4 failures and 8 passes. The temporary baseline worktree was removed. No live model requests or live credentials were used for verification.

## Review record

### Standards

Three low-impact, non-blocking findings:

- Auth retry delay: refuted by a real ModelRuntime test. PI returns an error response for unconfigured auth; the JSON helper returns null without retry delays.
- Credential option typing: confirmed for custom APIs with open-ended option types. Added explicit forbidden fields and compile-time coverage; runtime filtering remains.
- Duplicate label sanitization: confirmed and removed. Warning construction owns label sanitization.

### Spec

Three low-impact, non-blocking findings:

- Cancellation race: refuted. The generator checks its abort signal and generation ID after the race. A synchronous provider abort-response test stays quiet.
- Session-start warning reset: clarified as in-memory behavior and covered with the real generator and lifecycle. Routing identity remains stable across restart of the same session.
- Shared Insights chunk-summary scope: not a deviation. The approved scope separates prompt streams, not each chunk.

Additional red/green tests fixed warning suppression after configuration-file changes and classification of PI's `Provider is not configured` response. Model-limit tests now use fixed expected limits instead of recalculating the implementation's result.

## Documentation record

- Replaced obsolete direct compat-call guidance in `docs/pi/model-call.md` and its index description.
- Updated package documentation for shared request handling and suggestion warnings.
- Updated prompt-suggestion privacy wording: providers can receive an opaque routing identity outside the prompt.
- Marked superseded auth/error-policy parts of ADRs 0009 and 0010 without changing their unrelated decisions.
- Retained the Agent Run Provider Authority design and documented the effective-endpoint invariant in its package ADR 0010.

Related decision: [Keep model requests under PI provider authority](../adr/0023-pi-owned-model-requests.md).
