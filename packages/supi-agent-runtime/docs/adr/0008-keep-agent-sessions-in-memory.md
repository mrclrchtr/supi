# Keep Agent Run sessions in memory

Agent Runs use `SessionManager.inMemory()` and never create resumable child JSONL sessions. Only the bounded Agent Run Outcome and adapter-owned Conversation View enter the containing session, avoiding a second hidden history store and keeping resume, fork, retention, and raw-transcript privacy outside the runtime's scope.
