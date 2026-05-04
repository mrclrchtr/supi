## Context

The `supi-flow-slop-detect` skill recommends using `grep -P` for scanning documentation files. On macOS, the default `grep` is BSD grep which does not support the `-P` (Perl-compatible regex) flag.

During the archive phase of a recent change, this caused errors:
```
grep: invalid option -- P
usage: grep [-abcdDEFGHhIiJLlMmnOopqRSsUVvwXxZz] ...
```

The skill is located at:
`/Users/mrclrchtr/Development/mrclrchtr/supi/packages/supi-flow/skills/supi-flow-slop-detect/SKILL.md`

## Goal

Replace `grep -P` with a macOS-compatible alternative in the slop-detection scan commands. `rg -P` (ripgrep) or `perl -nle` are viable options already available in the SuPi toolchain.

## Acceptance

- [ ] All `grep -P` occurrences in the slop-detect skill are replaced
- [ ] Replacement works on both macOS (BSD) and Linux (GNU)
- [ ] The skill still detects the same slop patterns accurately

## Verification (challenge the value)

Before marking done: confirm that macOS users actually run the slop-detect skill manually, or whether it's primarily used by the agent itself (which runs in a Linux-like environment). If the failure only affects manual runs and the workaround (using `rg`) is already known, the fix may be lower priority than it appears.
