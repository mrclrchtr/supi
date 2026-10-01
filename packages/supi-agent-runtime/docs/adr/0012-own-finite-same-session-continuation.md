# Own finite same-session continuation

Some package protocols need one bounded delivery turn after an accepted Agent Run settles without its required structured result. The runtime must keep lifecycle authority while the package keeps domain policy.

`startAgentRun()` therefore accepts an optional finite continuation policy. The policy selects declarative steps with a prompt, an exact active-tool set, a thinking level, and an optional model that was authorized in `AgentSessionInputs`. The runtime performs the tool replacement, model switch, prompt, settlement, usage delta, cancellation fence, and final disposal in the same owned session.

Pi must report `"started"` for the initial prompt before continuation can start. A `"handled"` or `"queued"` prompt, a rejection before `"started"`, or a missing disposition is terminal. SuPi reports `prompt-rejected` when the Agent Run does not start. This code does not mean Pi rejected input that it handled or queued. Continuation can handle missing completion and accepted provider or runner failure. A continuation step is settled only when Pi reports `"started"`. The read-only session view and Agent Run Handle do not expose session controls.
