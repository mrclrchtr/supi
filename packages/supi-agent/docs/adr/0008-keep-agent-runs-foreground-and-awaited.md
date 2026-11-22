---
status: superseded by ADR-0010
---

# Keep Agent Runs foreground and awaited

Superseded by [ADR 0010](0010-own-background-delegation-in-the-containing-session.md).

Every Agent Run must settle and undergo bounded disposal before `supi_agent_run` returns; aborting the tool or shutting down the session stops all active runs. Fire-and-forget execution is deferred because Pi custom messages cannot carry nested Usage, so detached completion would under-report cost and require unresolved persistence, restart, notification, and ownership semantics.
