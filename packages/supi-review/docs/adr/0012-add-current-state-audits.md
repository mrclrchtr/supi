# Add Current-State Audit as a one-state review target

> **Status: Superseded.** ADR 0014 replaces this target with Review Target and required Review Mode. ADR 0015 defines the one Review path. This ADR records old Current-State Audit behavior only.

Current-State Audit freezes the complete current filesystem, including unstaged, uncommitted, and non-ignored untracked work, and evaluates that one state against Review Criteria without Git attribution. It accepts an optional advisory Review Scope of existing workspace-relative paths, allows inspection and criterion-relevant findings anywhere, and uses fixed `criteria-only` Finding Scope. The Review Engine may reuse its canonical patch internally to materialize and verify the frozen state, but reviewers receive no before-side instructions, changed-path manifest, or diff evidence; this avoids replacing proven freeze mechanics with an error-prone directory copy.
