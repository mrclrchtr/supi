# Own finite same-session continuation

Some package protocols need one bounded delivery turn after an accepted Agent Run settles without its required structured result. The runtime must keep lifecycle authority while the package keeps domain policy.

`startAgentRun()` therefore accepts an optional finite continuation policy. The policy selects declarative steps with a prompt, an exact active-tool set, a thinking level, and an optional model that was authorized in `AgentSessionInputs`. The runtime performs the tool replacement, model switch, prompt, settlement, usage delta, cancellation fence, and final disposal in the same owned session.

Continuation can start only after Pi accepts the initial prompt. It can handle missing completion and accepted provider or runner failure. Session setup, readiness, preflight rejection, cancellation, and timeout remain terminal. The read-only session view and Agent Run Handle do not expose mutable session controls.
