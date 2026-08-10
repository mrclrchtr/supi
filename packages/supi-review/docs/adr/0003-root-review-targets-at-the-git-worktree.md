# Root review targets at the Git worktree

> **Status: Partially superseded.** Canonical repository-root resolution remains current. ADR 0014 defines Review Target and advisory Review Scope. ADR 0015 defines the one Review path. The future path filter in this ADR is now the advisory Review Scope, not a target field.

Review target identity and all reviewer paths are relative to the canonical path returned by `git rev-parse --show-toplevel`, not Pi's launch directory. Target resolution captures that root once and keeps it inside the engine-owned snapshot; public snapshot summaries omit the absolute path. The same commit or working tree therefore produces the same target from every repository subdirectory. Narrowing by launch cwd is intentionally unsupported; a future path filter must be explicit in the target contract.
