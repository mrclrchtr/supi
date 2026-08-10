# Run direct reviewers in frozen Review Workspaces

> **Status: Partially superseded.** The frozen Review Workspace and Inspection-only protocol remain current. ADR 0014 defines the current Review Target and Review Mode contract. ADR 0015 removes the separate direct execution path. Direct and Working-Tree Review terms below are historical only.

Reviewer Sessions run inside an externally supplied Sandboxed Pi Environment with Pi's built-in read and shell tools, the headless Code Intelligence inspection profile, and structured `submit_review`; the five package-specific inspection tools are removed. The Review Engine still pins and hashes every target, then verifies and freezes its after-state in one visible linked Review Workspace shared by concurrent tasks—Working-Tree Reviews stage the canonical patch over the baseline. The interactive Planner flow revalidates its transient snapshot before reviewers start.

This trades enforced target-aware reads for ordinary agent inspection and dependency bootstrap. A configured `review.bootstrapCommand` runs once before fan-out; without it, duplicate setup avoidance remains prompt policy rather than access control. The outer sandbox is the security boundary; the source worktree may change after materialization, and workspace cleanup is best-effort with explicit recovery through `/supi-review-cleanup`.
