# Remove persistent Review Plans

Review execution uses one Review path, so `supi_review_prepare`, Prepared Review, plan ids, leases, and cross-call plan drift checks are removed. `/supi-review` keeps a transient Planner Draft and stops if its selected target changes before execution. This accepts the loss of cross-call preview and one-shot execution to remove lifecycle code that no other package uses, and it supersedes ADR 0004.
