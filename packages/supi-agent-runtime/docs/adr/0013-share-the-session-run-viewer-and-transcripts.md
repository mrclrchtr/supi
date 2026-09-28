# Share the session run viewer and transcripts

## Status

Accepted

## Context

Agent and Review create managed Agent Runs in the same containing PI session. Both packages need a way to show run status, transcript output, steering, and Stop controls. Agent Profile policy and Review audit policy belong to their owner packages. Review audit can be disabled or retained for seven days, but the user needs the shared run transcript until the containing session ends.

## Decision

- The runtime owns one session-local `AgentRunRegistry` for runs that register through its public API.
- Agent and Review call `registerAgentsCommand(pi)` to register `/agents`. A handshake over the Pi extension event bus identifies the containing runtime. A shared global key lets bundled runtime copies find the same registry and command state for that event bus.
- The registry shows neutral run metadata. It accepts steering only when the handle reports that the initial prompt is active. Stop affects only the selected run.
- The runtime owns one temporary transcript store for every registered run. It removes transcript files at containing-session shutdown. Review audit settings do not change transcript retention.
- Agent supplies optional Profile and Profile Diagnostics pages. The runtime viewer has no Agent Profile policy. Review keeps its audit store and Review policy.
- The runtime remains library-only. It does not expose its own PI extension entry.

## Consequences

- One `/agents` viewer can show Agent and Reviewer runs, even when each extension bundles its own runtime copy.
- Different Pi runtimes in one process use separate registries. Session shutdown removes the runtime's shared state.
- Review transcripts remain available in `/agents` when Review audit is off, and they are removed with the containing session.
- Agent and Review keep their own result, policy, capability, and audit behavior.
- Consumers that do not call `registerAgentsCommand()` do not register `/agents`.
