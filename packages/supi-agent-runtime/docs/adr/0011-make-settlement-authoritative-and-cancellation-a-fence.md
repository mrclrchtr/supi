# Make settlement authoritative and cancellation a local fence

PI lifecycle events are evidence, not settlement authority. `agent_settled` can occur before a handled prompt's fire-and-forget extension send has completed. An Agent Run therefore settles only after:

1. the tracked `session.prompt()` promise succeeds;
2. extension sends started during prompt handling have settled;
3. PI's lower-level agent and `AgentSession` are idle;
4. steering and follow-up queues are empty across a stabilization microtask.

The runtime installs and tracks the public extension send actions before binding, so setup callbacks are covered too. Detached work started later is outside Agent Run Settlement by design.

The first stop or timeout claim is a synchronous Cancellation Fence. Before any await, the runtime closes extension-send admission, clears the session queues, and starts `AgentSession.abort()`. A steering call that is already inside PI is rechecked after the queue operation and clears any late queue write. This prevents queued steering/follow-up work and late `pi.sendMessage()` or `pi.sendUserMessage()` calls from starting new work. Completion resolution and late callback values cannot win after the fence.

Setup resource reload and session creation remain awaited because they cannot be canceled safely. Extension binding is also awaited when it has started, so a partial bind receives the normal bounded runtime shutdown attempt. If cancellation occurs before extension binding, the runtime disposes the unbound session directly and emits no unmatched `session_shutdown`. Observer and readiness callbacks share the abort grace; a late observer disposer still runs, but its value is inert and it may run after forced session disposal when the callback exceeds the bound. Completion and provider abort work are bounded by the same cancellation grace. Runtime shutdown receives a separate bounded grace, with synchronous session disposal as fallback. PI's runtime disposal emits `session_shutdown` before invalidating extension contexts; the local fence therefore guards sends immediately and leaves context invalidation to normal or forced PI disposal.

Normal finalization also closes extension admission before disposal. This keeps session shutdown cleanup from starting a new Agent Run turn. Diagnostics remain bounded and private, and final usage is collected after disposal from persisted entries plus identity-deduplicated live messages.
