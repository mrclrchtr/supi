# Use caller-owned completion resolvers

A settled Agent Run invokes one caller-owned Completion Resolver, which returns the required domain value or no value when completion is missing. `supi-agents` resolves PI's final assistant text while `supi-review` resolves its structured submission holder, allowing one runtime outcome and lifecycle implementation without teaching the runtime about text, review tools, or future completion formats.
