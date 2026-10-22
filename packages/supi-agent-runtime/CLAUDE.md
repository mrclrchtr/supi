# CLAUDE.md

## Scope

`@mrclrchtr/supi-agent-runtime` is a library-only package. It owns Agent Run session mechanics, the shared session-local run registry, and temporary transcripts. Callers own resources, capabilities, completion, and evidence policy.

## Guidelines

- Keep Agent Runs context-isolated but permission-shared; this package is not a sandbox.
- Never expose the owned `AgentSession` or its lifecycle controls through callback views.
- Keep startup cancellation uncancelable but awaited: do not detach late resource/session setup.
- Keep the lifecycle state machine in one audited closure; prefer targeted state-machine edits over a generic coordinator abstraction that would obscure teardown ordering.
- Keep normal diagnostics bounded and free of conversation, tool arguments/results, and raw errors.
- Usage aggregation must include nested tool and summary calls.
- Keep the package library-only. It may provide `registerAgentsCommand()` for extension callers, but it must not add a PI extension entry.
- Keep Agent Profile pages optional and caller-owned. Do not move profile policy or Review audit into the runtime.
- Test through `startAgentRun()` and its returned Handle; use controlled PI session factories and fake timers.
