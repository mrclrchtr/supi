# Expose one Agent Run Handle

`startAgentRun()` returns one Agent Run Handle containing `result`, `subscribe`, `steer`, and `stop`; callers do not receive a second Promise-only entry point or the owned AgentSession. This keeps lifecycle and disposal authority inside the runtime while giving future interactive adapters the controls they need and letting `supi-review` simply await `run.result`.
