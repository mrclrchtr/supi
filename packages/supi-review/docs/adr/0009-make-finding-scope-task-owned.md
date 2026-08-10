# Make Finding Scope task-owned

> **Status: Superseded.** ADR 0014 removes Finding Scope and defines required Review Mode. ADR 0015 defines the one Review path. This ADR records the removed Finding Scope behavior only.

Each Review Task may select `change-only` or `boy-scout` Finding Scope, with `change-only` as the default. Per-task selection lets independent review objectives use different eligibility policies: change-only findings must be attributable to the Review Target, while Boy Scout review may also surface pre-existing issues in changed files or reviewer-judged directly affected symbols without letting purely pre-existing debt block acceptance. We chose an explicit task field over freeform instructions or a run-level setting so the policy is provider-visible, structured, and local to the verdict it shapes.
