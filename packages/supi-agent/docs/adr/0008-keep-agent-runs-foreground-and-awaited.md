# Keep Agent Runs foreground and awaited

Every Agent Run must settle and undergo bounded disposal before `supi_agent_run` returns; aborting the tool or shutting down the session stops all active runs. Fire-and-forget execution is deferred because PI custom messages cannot carry nested Usage, so detached completion would under-report cost and require unresolved persistence, restart, notification, and ownership semantics.
