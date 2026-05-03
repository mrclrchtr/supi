## Why

`code_intel pattern` currently passes the user-supplied `pattern` straight to ripgrep as a regex. That makes common literal searches containing regex metacharacters (for example `sendMessage({`) fail silently with a misleading "No matches found" response. The current renderer also repeats overlapping context lines for nearby matches in the same file, which wastes tokens and makes results harder to scan.

## What Changes

- Change `code_intel pattern` to treat `pattern` as a literal string by default instead of raw regex
- Add an explicit opt-in `regex` parameter for pattern searches that should use ripgrep regex semantics
- Improve `code_intel pattern` output rendering so overlapping context lines in the same file are shown once instead of repeated for each nearby match
- Update tool help and examples so agents can discover the literal-default behavior and the `regex` escape hatch

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `code-intelligence-search`: refine `action: "pattern"` so common literal searches succeed reliably, regex matching is explicitly opt-in, and grouped output avoids duplicated overlapping context

## Impact

- Modified package: `packages/supi-code-intelligence/`
- Likely touched files: `code-intelligence.ts`, `tool-actions.ts`, `actions/pattern-action.ts`, and related tests
- Tool surface change: `code_intel` gains an optional `regex` parameter for `action: "pattern"`
- Agent behavior improvement: fewer false "no matches" results for literal searches and lower-token pattern output in dense files
