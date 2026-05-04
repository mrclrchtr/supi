# supi-review

## Reviewer subprocess design

- Spawn pi in tmux with `--print` (not `--mode json`). The tmux pane shows human-readable conversation; structured results come from a TypeBox `submit_review` tool that writes JSON to a temp file.
- `buildPiArgs()` must include `--print` so the subprocess exits after the tool loop instead of starting an interactive TUI session.
- Do not pass synthetic `--models` scopes to the reviewer. Use one explicit review model from settings when configured, otherwise inherit the active session model via `--model`.
- The `submit_review` temp tool writes to `/tmp/supi-review-<id>.json`. The runner script tees stdout/stderr to `-pane.log` and writes exit status to `-exit.json`.
- `readStructuredOutput()` validates the full `ReviewOutputEvent` shape (all four fields) before accepting. Malformed tool output should fall through to warning + pane-log fallback, not silently succeed.
- The parent should settle when `-exit.json` appears; do not rely on the tmux session disappearing because user tmux settings may keep panes alive.
- Non-interactive mode announces the tmux session via `process.stderr.write` so headless users can `tmux attach` or `tmux kill-session` immediately.
- Temp file paths: `{tmpdir()}/supi-review-<id>{-tool.ts, .json, -pane.log, -runner.mjs, -exit.json}`.
- Session name collision handling: append `-1`, `-2`, etc. until `tmux has-session` returns non-zero.
