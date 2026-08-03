# Expose one Agent Run Handle

`startAgentRun()` returns one Agent Run Handle containing `result`, `subscribe`, `steer`, and `stop`; callers do not receive a second Promise-only entry point or the owned AgentSession. This keeps lifecycle and disposal authority inside the runtime while giving `supi-agents` the controls its viewer needs and letting `supi-review` simply await `run.result`.
