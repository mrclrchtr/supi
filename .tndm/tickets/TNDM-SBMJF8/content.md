## Context

When writing tests for `supi-code-intelligence` that involve git operations (e.g., `git-context.ts`), the test must create temporary git repositories. The host environment may have pre-commit hooks and GPG signing configured, which cause `git commit` to fail in tests.

During the recent implementation of git context support, this caused commit failures that required trial-and-error to resolve:
- `.pre-commit-config.yaml` not found → skipping pre-commit
- `fatal: either user.signingkey or gpg.ssh.defaultKeyCommand needs to be configured`

The fix was configuring git in test setup:
```ts
execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir });
execFileSync("git", ["config", "core.hooksPath", "/dev/null"], { cwd: dir });
```

## Goal

Document this pattern in `packages/supi-code-intelligence/CLAUDE.md` under the Testing Patterns section so future contributors don't hit the same issue.

## Acceptance

- [ ] `CLAUDE.md` Testing Patterns section includes a note about git test setup
- [ ] Shows the exact `git config` commands needed
- [ ] Explains *why* (GPG signing + pre-commit hooks)

## Verification (challenge the value)

Before marking done: ask whether this is worth a CLAUDE.md line or whether the failure mode is obvious enough that developers will figure it out quickly. If the fix is trivial and self-evident, close as wontfix.
