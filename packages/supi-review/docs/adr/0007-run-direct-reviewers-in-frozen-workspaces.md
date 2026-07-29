# Run direct reviewers in frozen Review Workspaces

Reviewer Sessions run inside an externally supplied Sandboxed Pi Environment with Pi's built-in read and shell tools, the headless Code Intelligence inspection profile, and structured `submit_review`; the five package-specific inspection tools are removed. The Review Engine still pins and hashes every target, then verifies and freezes its after-state in one visible linked Review Workspace shared by concurrent tasks—Working-Tree Reviews stage the canonical patch over the baseline—and invalidates stale Prepared Review Plans before reviewers start.

This trades enforced target-aware reads for ordinary agent inspection and dependency bootstrap. Inspection-only behavior and duplicate setup avoidance are prompt policy rather than access control, while the outer sandbox is the security boundary; the source worktree may change after materialization, and workspace cleanup is best-effort with explicit recovery through `/supi-review-cleanup`.
