# CLAUDE.md

## Scope

`@mrclrchtr/supi-agent-runtime` is a library-only package. It owns one in-memory PI Agent Run's session lifecycle; callers own resources, capabilities, completion, and evidence policy.

## Key files

- `src/api.ts` — explicit public API
- `src/run.ts` — `startAgentRun()` state machine and bounded teardown
- `src/types.ts` — Agent Session Inputs, Handle, Outcome, Progress, and callback contracts
- `src/usage.ts` — complete usage aggregation, including nested tool and summary calls
- `src/diagnostics.ts` / `src/lifecycle-trace.ts` — bounded redacted failure diagnostics

## Guidelines

- Keep Agent Runs context-isolated but permission-shared; this package is not a sandbox.
- Never expose the owned `AgentSession` or its lifecycle controls through callback views.
- Keep startup cancellation uncancelable but awaited: do not detach late resource/session setup.
- Keep the lifecycle state machine in one audited closure; prefer targeted state-machine edits over a generic coordinator abstraction that would obscure teardown ordering.
- Keep normal diagnostics bounded and free of conversation, tool arguments/results, and raw errors.
- Test through `startAgentRun()` and its returned Handle; use controlled PI session factories and fake timers.

## No pi extension

This package must remain pure library surface: no `pi.extensions`, no `src/extension.ts`, and no tool or command registration.
