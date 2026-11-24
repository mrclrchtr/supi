# CLAUDE.md

## Scope

`@mrclrchtr/supi-agent-runtime` is a library-only package. It owns Agent Run session mechanics, the shared session-local run registry, temporary transcripts, Background Run Batches (`src/background/`), and the `agent_result` and `agent_cancel` tools (`src/tool/`). It also owns the isolation mechanics of child resources (`createIsolatedAgentResources()` in `src/isolated-resources.ts`): ambient-resource suppression, shell hints, tool rules, codemode and Web tool loading, and the retry/compaction defaults. Callers own the prompt, instruction files, capabilities, completion, and evidence policy. It also owns the Agent Workspace mechanics (`src/workspace/`, exported through `./workspace`): canonical worktree roots, disposable verified worktrees, `git worktree lock` leases with `supi-agent:<owner>:` markers, inventory, cleanup primitives, and the Dependency Bootstrap runner. Callers own which state to freeze and when to lease or clean up; the module knows no Review Targets, Agent Profiles, or Delegation policy.

## Guidelines

- Fix child isolation in `createIsolatedAgentResources()`, not in a caller. Keep capability-bearing extensions (such as headless Code Intelligence) injected by the caller; do not add a dependency on `supi-code-intelligence`.

- Keep Agent Runs context-isolated but permission-shared; this package is not a sandbox.
- Never expose the owned `AgentSession` or its lifecycle controls through callback views.
- Keep startup cancellation uncancelable but awaited: do not detach late resource/session setup.
- Keep the lifecycle state machine in one audited closure; prefer targeted state-machine edits over a generic coordinator abstraction that would obscure teardown ordering.
- Keep normal diagnostics bounded and free of conversation, tool arguments/results, and raw errors.
- Usage aggregation must include nested tool and summary calls.
- Keep the package library-only. It may provide `registerAgentsCommand()` for extension callers, but it must not add a Pi extension entry.
- Keep Agent Profile pages optional and caller-owned. Do not move profile policy or Review audit into the runtime.
- Background Run Batches hold no admission, Profile, conversation, or checkpoint policy. Owners reconcile their own claims through `RunBatchOwnerOptions.reconcile`. Test them through an artificial owner (`__tests__/helpers/run-batch-owner.ts`).
- `/supi-agent-cleanup` is registered once per Pi runtime by the first owner that calls `registerAgentCleanupCommand()`, like `/agents`. It never touches a worktree whose owner is active or unknown; for an absent owner it removes disposable workspaces and only unlocks caller-provided worktrees.
- `agent_result` and `agent_cancel` are registered once per Pi runtime by the first owner that supplies `RunBatchOwnerOptions.collection`, like `/agents`. The runtime owns their names, schemas, guidance, handle checks, and collection ordering; owners supply results, rendering, and model-facing cancellation text. Keep Delegation text unchanged.
- Test through `startAgentRun()` and its returned Handle; use controlled Pi session factories and fake timers.
