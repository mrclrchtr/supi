# @mrclrchtr/supi-agent-runtime

[![GitHub stars](https://img.shields.io/github/stars/mrclrchtr/supi)](https://github.com/mrclrchtr/supi/stargazers)

Neutral lifecycle management for one context-isolated, permission-shared in-process Pi Agent Run.

The package is library-only. Use `@mrclrchtr/supi-agent-runtime/api` to start a run with caller-owned resources, provider authority, completion, readiness, and evidence policy:

```ts
import {
  createAgentRunProviderAuthority,
  startAgentRun,
} from "@mrclrchtr/supi-agent-runtime/api";

const providerAuthority = createAgentRunProviderAuthority(ctx.modelRegistry);
const run = startAgentRun({
  inputs: {
    cwd,
    model,
    providerAuthority,
    thinkingLevel,
    tools,
    customTools,
    resourceLoader,
    settingsManager,
  },
  prompt,
  readinessCheck: (session) => requiredTools.every((name) => session.getActiveToolNames().includes(name)),
  completionResolver: (session) => session.messages.at(-1)?.role === "assistant" ? session.getLastAssistantText() : undefined,
});

const outcome = await run.result;
```

Agent Runs share the containing process's permissions and external sandbox; context isolation is not filesystem or security isolation.

## Isolated resources

`createIsolatedAgentResources()` builds `resourceLoader` and `settingsManager` for a context-isolated child. Delegation and Review both use it:

```ts
const { resourceLoader, settingsManager, agentDir } = createIsolatedAgentResources({
  cwd,
  projectTrusted,
  systemPrompt, // undefined keeps Pi's native prompt
  instructionFiles, // default: none
  codemode: true,
  webTools: { provision, toolNames },
  extensions: [{ name: "supi-code-intelligence-headless", factory: headlessInspectionProfile }],
});
```

- The child loads no ambient extensions, skills, prompt templates, themes, context files, `SYSTEM.md`, or `APPEND_SYSTEM.md`.
- Every child gets shell hints and a `<tool_rules>` section with its active tools' `promptGuidelines`. Pi builds that section only for its native prompt.
- Compaction and retries are on. Compaction is a safety net for a full context window; each compaction of a registered run records a Debug event.
- Callers own the prompt, the instruction files, and capability-bearing extensions such as headless Code Intelligence.

## Auxiliary model authority

Only callers that explicitly enable Pi codemode for an invocation should grant its classifier and image-model access. Capture the containing session's available catalogue once per top-level invocation, then pass the same frozen snapshot to each child run in that invocation:

```ts
import {
  captureAgentRunAuxiliaryModels,
  createAgentRunProviderAuthority,
  startAgentRun,
} from "@mrclrchtr/supi-agent-runtime/api";

const providerAuthority = createAgentRunProviderAuthority(ctx.modelRegistry);
const authorizedAuxiliaryModels = await captureAgentRunAuxiliaryModels(providerAuthority);
const run = startAgentRun({
  inputs: {
    cwd,
    model,
    providerAuthority,
    authorizedAuxiliaryModels,
    thinkingLevel,
    tools: ["read", "codemode"],
    resourceLoader,
    settingsManager,
  },
  prompt,
  completionResolver,
});
```

Omit `authorizedAuxiliaryModels` for children that did not opt in; their auxiliary catalogue stays empty. The snapshot contains the model catalogue available when captured, not resolved credentials, and does not expand if the parent catalogue changes mid-run. Pi codemode omits model headers when exposing that catalogue to scripts. Capture a new snapshot for a later invocation. Auxiliary requests resolve through the containing Pi registry at request time, so model-specific headers and endpoints remain scoped to the requested model. An empty or unavailable catalogue does not disable codemode's tool scripting.

## Restored conversation context

Callers can set `captureContext: true` on a run to receive finalized native Pi entries and their active leaf in `outcome.context`. Pass that plain data as `inputs.context` on a later run. Each run creates and disposes its own session; the runtime does not keep an idle worker or persist the context itself.

- `cloneAgentRunContext()` copies and validates context before admission. Invalid entry payloads, ancestry, and references are rejected rather than replaced with fresh context.
- Current caller-owned model, tools, prompt, and resource policy apply to the new run. Saved history does not grant permissions.
- Native compaction and context-edit entries remain part of the restored history. Run Usage excludes imported history and includes only newly billed work.
- Capture is opt-in and can be absent when no valid context is available. Failure, cancellation, and timeout can return valid captured context; no interrupted action is replayed automatically.
- Context can contain source text, tool data, and other sensitive content. Known assistant transport diagnostics are omitted; arbitrary conversation content is not redacted.
- Callers own storage, retention, branch selection, and result delivery. `supi-agent` stores checkpoints in parent task results. Reviewer Runs retain their existing policy.

## Finite continuation

A package can add a bounded same-session continuation for a required structured result. The caller supplies declarative steps through `continuation.resolveNext()`. Each step specifies a prompt, an exact active-tool set, a thinking level, and an optional pre-authorized model. The runtime performs all prompts, model switches, tool changes, usage snapshots, cancellation checks, and final disposal.

Pi must report `"started"` for the initial prompt before continuation can start. SuPi fails the Agent Run with `prompt-rejected` if Pi reports `"handled"` or `"queued"`, if the prompt rejects before `"started"`, or if it resolves without a disposition. This code means that the Agent Run did not start. It does not mean that Pi rejected input that it handled or queued. SuPi does not call the completion resolver or start continuation after one of these failures. A continuation step is settled only when Pi reports `"started"`. SuPi does not call the completion resolver for another disposition, a rejection, or a missing disposition. Continuation can handle `missing-completion` and an accepted `unexpected-runner-failure`. `AgentRunSessionView` and `AgentRunHandle` do not expose session controls. The runtime disposes the session once after the final outcome.

## Optional post-result retrospectives

Enable **Debug → Enabled** and **Debug → Agent Run Retrospectives** in `/supi-settings` to collect assessments from Delegation and Reviewer Runs. The shared setting is `debug.agentRunRetrospectivesEnabled`, off by default. Collection also requires the loaded Debug extension's persistence sink and the caller's run registry; Planner Drafts are excluded.

- `handle.taskResult` returns the frozen task outcome, task-only Usage, and optional follow-up context before the retrospective.
- `handle.result` remains terminal: it waits for disposal and includes Usage from both phases. For registered runs it also waits for transcript writes.
- The same child performs one tool-free assessment with no retry, repair, or custom token/time budget. The task timeout ends at readiness; normal cancellation and session ownership remain in force.
- The Debug event uses category `agent-run-retrospective`, with assessment prose and separately measured Usage in sanitized `data`. Its `metrics` field measures the assessed task: duration, turns, tool executions and errors, executions per tool name, the names of the tools active when the task started (`availableTools`), and task-only Usage. Retrospective costs are not retroactively added to the parent tool's task Usage.
- Retrospective messages never enter saved follow-up context or task-only Review audit evidence. Failures or cancellation after result readiness cannot invalidate task success.

Runtime consumers opt in explicitly through `createDebugAgentRunRetrospective()` or a caller-owned `retrospective` policy. A retained Handle remains stoppable until disposal; `retrospecting` is active but cannot be steered. See the [retrospective contract](../../docs/conventions/agent-run-retrospectives.md).

## Compaction Debug events

When **Debug → Enabled** is on, every finished compaction of a registered Agent Run (Delegation or Reviewer) records one Debug event with category `agent-run-compaction`. Its `data` holds the run correlation (`runKey`, `batchId`, `taskId`, `kind`, `label`, `modelId`), the compaction `reason`, `aborted`, `willRetry`, the context size before and the estimate after (`contextBefore`, `contextAfterEstimate`), and a sanitized error text. It never contains the summary or conversation content. Failed or aborted compactions use level `warning`.

## Shared `/agents` viewer

Agent and Review call `registerAgentsCommand(pi)` from the public API. The helper finds one shared registry for the containing Pi runtime through `pi.events`. Bundled runtime copies use the same registry and register one `/agents` command for that runtime. The runtime package does not register itself as a Pi extension.

The runtime owns temporary human-only transcripts for registered runs until the containing session ends. This retention is separate from Review audit settings. Agent can supply optional Profile and Profile Diagnostics pages; the runtime does not own Agent Profile policy. Steering is available only while the initial prompt is active. The handle and registry preserve Pi's `"queued"` or `"handled"` result. The viewer reports each result, and it records only queued input as steering. Stop affects only the selected run.

In Conversation or Details, Alt+Left and Alt+Right cycle through the filtered runs in the current Agents or Reviews section. The viewer keeps the current view. Esc returns to the run list.

If the Ask User tool opens a form while `/agents` is open, the viewer closes so the form is visible. This does not cancel the agent turn. Run `/agents` again to reopen the viewer.

`startRegisteredAgentRun()` returns one handle. `stop()` waits for bounded Agent Run disposal, not transcript writes. `result` resolves after final transcript writes finish. A storage failure marks the transcript incomplete and does not change the Agent Run outcome. Without a registry, the runtime does not create a transcript. A closed registry stops the run.

## Background Run Batches

An owner package that lets its caller continue while runs are active hands each admitted Run Batch to the runtime ([ADR 0014](docs/adr/0014-own-background-run-batches-and-result-collection.md)). Call `registerRunBatchOwner(pi, options)` on every `session_start`; it returns the owner's access to the batches of the containing session. Bundled runtime copies share one set of batches, like the run registry.

The owner supplies admission, a `RunBatchHandle` for its started runs, the launch call identity (`findLaunch()`), a Completion Notice builder with its own custom message type, and its Result Collection (`collection`). The runtime then owns:

- session and launch-branch ownership: a batch whose launch leaves the active branch stops;
- Completion Notices, sent only after Pi stores the successful launch result and removed from model context once stale. `noticeGranularity: "task"` (default) sends one notice for the tasks that became ready since the last one; `"batch"` sends a single notice once every task is terminal;
- parent abort: every active batch stops and notices pause until the next input that is not from an extension; normal parent completion leaves batches running;
- Usage receipts and spill-file cleanup (`retainOutput()`);
- close on session shutdown, which stops owned runs and suppresses late delivery.

### Result Collection tools

The first owner that supplies `collection` registers `agent_result` and `agent_cancel` once per Pi runtime, as `registerAgentsCommand()` does for `/agents`. Both tools serve every owner. For each call the runtime:

1. resolves the addressed batch and rejects unknown, expired, other-session, and off-branch handles for every owner;
2. for `agent_result`, waits when `wait: true` (streaming the owner's `progress()`), then revalidates the handle;
3. lets the owner assemble the result (`collect()`), which is where owner records such as checkpoints are prepared;
4. reserves the unreported Usage of finalized tasks for that result.

`agent_cancel` lets the owner format the result (`cancel()`) and then requests the stop of active runs. The owner renders its own results (`renderResult()`, `renderCancel()`) and may set model-facing cancellation text (`canceledMessages`). The runtime renders errors and the call header.

An owner states whether it needs both tools in the current session with `setCollectionToolsActive(active)`, for example from its own tool setting. They stay active while any collection owner needs them; an owner that never states a demand counts as needing them. Review turns its demand off with its **Agent tools** setting; Agent never does.

Usage counts as reported only after Pi stores the `agent_result` result that carries it. The collection result's `details` must carry `batchId` and `tasks[].taskId`; `readResultCollection()` reads them back. The runtime reserves the `details` keys `runBatchOwner` and `usageReceipt` and the result's `usage`.
