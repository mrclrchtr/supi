# Codemode for Agent Runs and Review

Status: implemented. The sections below record the approved contract and implementation checks.

## Scope and decisions

| Area | Approved behavior |
| --- | --- |
| Consumers | Agent Runs and Reviewer Sessions |
| Availability | Explicit opt-in; default behavior remains unchanged |
| Functionality | PI codemode scripting, tool discovery, storage, classifier APIs, and image-model APIs |
| Tool access | Existing permitted child tools only; no ambient extensions or inherited MCP servers |
| Presentation | PI codemode mode `on`: direct tools remain available |
| Settings inheritance | Do not inherit parent codemode settings |
| Auxiliary models | All parent classifier/image models available at invocation startup |
| Model catalogue lifetime | One snapshot per top-level invocation, shared by its children |
| Review phases | Reviewer investigation only; exclude Planner Drafts and submission recovery |
| Cost controls | Existing PI/runtime controls and reported Usage; no new spending cap |

Opt-in authorizes auxiliary provider requests, transmission of supplied model inputs (which may include repository evidence), and their costs. It does not grant additional tool permissions. Parent model availability does not guarantee provider entitlement or successful execution.

## Configuration

### Agent Profiles

- Add `codemode` to the fixed Agent Capability Set and manifest validation.
- Opt in by including `codemode` in the existing Agent Profile `tools` array.
- Leave package-provided profiles unchanged by default.
- Preserve whole-field list replacement when resolving profile sources; adding a tool requires retaining the other desired tools in that array.
- A Delegation Follow-Up uses current profile policy, including whether codemode is enabled.

Example partial profile manifest:

```json
{
  "tools": ["read", "code_orientation", "code_find", "codemode"]
}
```

### Review

- Add `review.reviewerCodemodeEnabled`, default `false`.
- Expose it through the existing Review configuration/settings surfaces.
- Apply it to Reviewer investigation only, for both tool-driven and interactive Review.
- Keep Planner Drafts submit-only and submission recovery restricted to its existing terminal tools.

## Ownership and implementation seams

| Owner | Responsibility | Starting points |
| --- | --- | --- |
| `supi-agent` | Profile opt-in, capability classification, child resources, batch snapshot request | `src/types.ts`, `src/capabilities.ts`, `src/profile-validation.ts`, `src/resources.ts`, `src/tool/agent_run/` |
| `supi-review` | Review setting, Reviewer tools/resources, phase restrictions, invocation snapshot request | `src/config.ts`, `src/tool/review_run/child-resources.ts`, `runner.ts`, `execution.ts`, `system-prompt.ts`, `recovery.ts` |
| `supi-agent-runtime` | Scoped provider bridge, model authorization mechanics, session lifecycle and Usage | `src/provider-authority.ts`, `src/types.ts`, `src/run.ts`, `src/context.ts`, `src/usage.ts` |

Caller packages retain capability/resource policy. The shared runtime must not infer codemode permission from ambient settings or independently enable it.

## Child tool boundary

- Explicitly register PI's `createCodemodeExtension()` only for opted-in children, with model APIs enabled.
- Explicitly activate the tool; the SDK does not load or activate codemode automatically.
- Retain the isolated resource loader and the existing headless Code Intelligence profile.
- Bound script calls and discovery helpers to the child's permitted tools.
- Verify indirect tool exposure as well as active direct-tool selection. Registered `codemode`/`deferred` tools can have different reachability rules from direct tools.
- Do not add MCP or tool-search extensions as part of this feature.
- Treat inline-description budgets and codemode presentation modes as presentation, never authorization.
- Keep `bash`, `edit`, and `write` mutation-capable. Codemode itself does not make a Read-Only Profile mutation-capable, provided its callable tools remain bounded to that profile's permissions.
- Preserve Reviewer Protocol restrictions. Review already permits shell inspection; Inspection-only remains behavioral, not a filesystem sandbox.
- Disable codemode during submission recovery and prove that investigation capabilities cannot be reached through scripts in that phase.

## Auxiliary model authorization

The child provider bridge supports separately authorized chat and auxiliary models. Registering codemode alone does not grant classifier/image access.

Authorization contract:

1. Before starting opted-in children, capture the containing session's available classifier and image-model catalogue.
2. Share one immutable authorization snapshot across a Delegation Batch or Review invocation.
3. Extend the scoped child provider bridge to support authorized classifier/image discovery and dispatch through the containing Provider Authority.
4. Resolve credentials at request time; do not copy secrets into profile configuration, model-facing catalogues, or persisted conversation state.
5. Restrict enumeration, provider/model-ID lookup, and execution to the snapshot. Filtering only an availability-list method is insufficient.
6. Preserve current chat-model scope and routing. Codemode does not introduce script-invoked chat completion.
7. Refresh the snapshot for each subsequent invocation, including Delegation Follow-Ups. Mid-run additions do not expand an existing run's authority.
8. Do not grant auxiliary-model access to children that did not opt in.

An empty available catalogue does not prevent tool scripting. Do not substitute an unrestricted parent model registry to make unavailable model calls succeed.

## Lifecycle, continuation, and Usage

- Reuse PI's codemode worker pool and model-call concurrency controls; do not introduce a second scheduler.
- Preserve Agent Run cancellation, settlement, and bounded disposal semantics, including calls waiting for a codemode worker.
- Forward cancellation through nested tool and model requests. Completed side effects are not rolled back.
- Preserve successful branch-specific `store()` entries in saved Delegation Checkpoints and restore them on follow-up.
- Do not keep live workers across Agent Runs or replay interrupted actions on continuation.
- Preserve reported classifier/image Usage through the ordinary codemode tool result and existing runtime collection.
- Verify foreground results, background result-collection receipts, and Review aggregation without double counting.
- Do not claim complete billing visibility when a provider omits Usage. No new auxiliary-model spending cap is part of this plan.

## Implementation sequence (completed)

1. Extend and test the runtime's scoped auxiliary-model authority without changing default child access.
2. Add Agent capability validation, resource wiring, and invocation-level catalogue capture.
3. Add Review configuration, Reviewer resource wiring, and invocation-level catalogue capture; preserve Planner/recovery restrictions.
4. Add lifecycle, continuation, tool-boundary, and Usage integration coverage.
5. Update user-facing configuration and protocol documentation; run full verification.

## Acceptance criteria

- [x] Existing Agent Profiles and Review settings remain codemode-free by default.
- [x] An opted-in Agent Profile can execute scripts over its selected tools.
- [x] An opted-in Reviewer can use scripts during investigation while direct tools remain available.
- [x] Discovery and nested calls cannot access excluded tools, including tools with indirect exposure.
- [x] No parent MCP/ambient extension inheritance occurs.
- [x] Read-only Agent batch admission remains valid; mutating profiles remain single-task only.
- [x] Classifier and image-model listing, lookup, and dispatch work through the scoped provider bridge.
- [x] Unauthorized model IDs are rejected; chat authorization and effective request routing are unchanged.
- [x] Sibling children share one model snapshot; subsequent invocations refresh it.
- [x] Empty auxiliary-model catalogues and provider-call failures are handled without widening authority.
- [x] Planner Drafts and submission recovery cannot execute codemode.
- [x] Cancellation works for active scripts, nested calls, and queued worker acquisition without starting new work after the Cancellation Fence.
- [x] Successful storage survives Agent continuation; failed/interrupted scripts do not commit new storage or replay actions.
- [x] Auxiliary Usage is accounted for once through foreground, background collection, and Review paths when reported.
- [x] Profile/configuration docs explain opt-in, list replacement, external-provider access, costs, and isolation limits.

Verification during implementation: package-focused Vitest and TypeScript checks, then `pnpm verify:ai`. Use controlled provider/tool fixtures for authorization and accounting; do not depend on paid live requests for regression coverage.

## Documentation follow-through

- Update Agent Profile capability/resource documentation and examples.
- Update Review configuration, Reviewer Protocol, and capability descriptions presented to planning/UI surfaces.
- Update runtime provider-authority documentation for classifier/image authorization.
- Revise existing glossary entries only where their definitions change (notably the Reviewer Extension Set); keep implementation details out of glossaries.
- Preserve the existing meanings of Read-Only Profile, Inspection-only, Context Isolation, and Provider Authority.

## Evidence and implementation risks

Executable regression coverage uses controlled providers and real PI codemode for auxiliary discovery/dispatch, tool reachability, reported Usage, worker-queue cancellation, and storage restoration across Agent Runs. Adapter tests cover default-off configuration, shared snapshots, background collection, and Review phase restrictions. Live provider entitlement and billing are not tested.

Catalogue discovery is not cancelable in PI. Invocation cancellation races that lookup, releases Agent admission reservations, and discards late results. The Agent controller retains settlement ownership and awaits pending discovery during shutdown while stopping existing children immediately. Review performs discovery before target/workspace creation, so canceled discovery cannot create later resources. A permanently stalled provider lookup can delay Agent session shutdown; it cannot start a canceled child.

The review identified and corrected request-auth-only chat authentication and pending-startup cancellation regressions. Request credentials remain resolved for the exact chat model; auxiliary calls do not receive prepared chat auth.

Primary regression evidence:

- `packages/supi-agent-runtime/__tests__/integration/auxiliary-model-authority.test.ts`
- `packages/supi-agent-runtime/__tests__/integration/provider-authority.test.ts`
- `packages/supi-agent-runtime/__tests__/unit/provider-authority.test.ts`
- `packages/supi-agent/__tests__/integration/codemode-policy.test.ts`
- `packages/supi-agent/__tests__/integration/auxiliary-model-batch.test.ts`
- `packages/supi-review/__tests__/integration/review-workflow.test.ts`
- `packages/supi-review/__tests__/unit/review-recovery.test.ts`
- `packages/supi-review/__tests__/unit/child-resource-loader.test.ts`

Repository references:

- [Agent capability policy](../../packages/supi-agent/src/capabilities.ts)
- [Agent resource policy](../../packages/supi-agent/src/resources.ts)
- [Scoped provider authority](../../packages/supi-agent-runtime/src/provider-authority.ts)
- [Reviewer resource policy](../../packages/supi-review/src/tool/review_run/child-resources.ts)
- [Background delegation](../../packages/supi-agent/docs/background-delegation.md)
- [Resumable Delegation Conversations](../../packages/supi-agent/docs/resumable-conversations.md)
- [Fixed child capability set](../../packages/supi-agent/docs/adr/0002-use-a-fixed-child-capability-set.md)
- [Runtime ownership](../../packages/supi-agent-runtime/docs/adr/0001-own-session-mechanics-not-resource-policy.md)

PI references, resolved under the installed dependency:

- `@earendil-works/pi-coding-agent/docs/sdk.md`, “Codemode and MCP”.
- `@earendil-works/pi-coding-agent/examples/sdk/14-codemode-mcp.ts`.
- `@earendil-works/pi-coding-agent/docs/codemode.md`, tool calls, models, storage, and limits.
- `@earendil-works/pi-coding-agent/docs/extensions.md`, tool exposure and nested execution.
- `@earendil-works/pi-coding-agent/docs/models.md` and `docs/providers.md`, classifier/image access and availability.
- `@earendil-works/pi-ai/dist/models.d.ts` and `dist/types.d.ts`, model-runtime/provider interfaces.
