# @mrclrchtr/supi-agent-runtime

[![GitHub stars](https://img.shields.io/github/stars/mrclrchtr/supi)](https://github.com/mrclrchtr/supi/stargazers)

Neutral lifecycle management for one context-isolated, permission-shared in-process pi Agent Run.

The package is library-only. Use `@mrclrchtr/supi-agent-runtime/api` to start a run with caller-owned resources, provider authority, completion, readiness, and evidence policy:

```ts
import {
  createAgentRunProviderAuthority,
  startAgentRun,
} from "@mrclrchtr/supi-agent-runtime/api";

const run = startAgentRun({
  inputs: {
    cwd,
    model,
    providerAuthority: createAgentRunProviderAuthority(ctx.modelRegistry),
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

## Finite continuation

A package can add a bounded same-session continuation for a required structured result. The caller supplies declarative steps through `continuation.resolveNext()`. Each step specifies a prompt, an exact active-tool set, a thinking level, and an optional pre-authorized model. The runtime performs all prompts, model switches, tool changes, usage snapshots, cancellation checks, and final disposal.

Pi must report `"started"` for the initial prompt before continuation can start. SuPi fails the Agent Run with `prompt-rejected` if Pi reports `"handled"` or `"queued"`, if the prompt rejects before `"started"`, or if it resolves without a disposition. This code means that the Agent Run did not start. It does not mean that Pi rejected input that it handled or queued. SuPi does not call the completion resolver or start continuation after one of these failures. A continuation step is settled only when Pi reports `"started"`. SuPi does not call the completion resolver for another disposition, a rejection, or a missing disposition. Continuation can handle `missing-completion` and an accepted `unexpected-runner-failure`. `AgentRunSessionView` and `AgentRunHandle` do not expose session controls. The runtime disposes the session once after the final outcome.

## Shared `/agents` viewer

Agent and Review call `registerAgentsCommand(pi)` from the public API. The helper finds one shared registry for the containing Pi runtime through `pi.events`. Bundled runtime copies use the same registry and register one `/agents` command for that runtime. The runtime package does not register itself as a Pi extension.

The runtime owns temporary human-only transcripts for registered runs until the containing session ends. This retention is separate from Review audit settings. Agent can supply optional Profile and Profile Diagnostics pages; the runtime does not own Agent Profile policy. Steering is available only while the initial prompt is active. The handle and registry preserve Pi's `"queued"` or `"handled"` result. The viewer reports each result, and it records only queued input as steering. Stop affects only the selected run.

In Conversation or Details, Alt+Left and Alt+Right cycle through the filtered runs in the current Agents or Reviews section. The viewer keeps the current view. Esc returns to the run list.

`startRegisteredAgentRun()` returns one handle. `stop()` waits for bounded Agent Run disposal, not transcript writes. `result` resolves after final transcript writes finish. A storage failure marks the transcript incomplete and does not change the Agent Run outcome. Without a registry, the runtime does not create a transcript. A closed registry stops the run.
