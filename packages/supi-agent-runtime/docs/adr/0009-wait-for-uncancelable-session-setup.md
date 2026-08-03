# Wait for uncancelable session setup

PI's resource reload and AgentSessionRuntime creation APIs accept no AbortSignal, so stopping during setup marks the Agent Run canceled, suppresses its initial prompt, and waits for setup to return before bounded disposal. Optional run timeouts begin only after the Session Readiness Check, immediately before the initial prompt, because setup cannot be forcibly timed out. The runtime does not detach late cleanup or claim a bounded startup stop, which would let resource creation outlive the foreground Agent Run Handle.
