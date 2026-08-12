# @mrclrchtr/supi-agent-runtime

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

Continuation can start only after Pi accepts the initial prompt. It can handle `missing-completion` and an accepted `unexpected-runner-failure`. It does not run after creation, readiness, preflight, cancellation, or timeout failures. `AgentRunSessionView` and `AgentRunHandle` remain control-free. The runtime disposes the owned session one time after the final outcome.
