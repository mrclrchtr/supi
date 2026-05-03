## Why

SuPi extensions currently debug failures through ad-hoc counters, notifications, or manual inspection. RTK fallbacks exposed by `/supi-context` show that users and agents need a shared, privacy-aware way to inspect recent extension behavior and collaborate on debugging without automatically leaking raw commands into model context.

## What Changes

- Add a shared SuPi debug event registry for extensions to record structured, session-local debug events.
- Add a new `supi-debug` extension with settings, a `/supi-debug` command, and an agent-callable `supi_debug` tool.
- Provide sanitized-by-default event exposure, with explicit raw-data access controlled by settings/tool parameters.
- Integrate RTK fallback/rewrite diagnostics with the shared registry so fallbacks include reason, cwd, duration, timeout, and redacted command information.
- Surface lightweight debug summaries through existing context-provider reporting without injecting raw debug payloads automatically.

## Capabilities

### New Capabilities
- `debug-registry`: Shared debug event recording, redaction, settings, user command, and agent tool access for SuPi extension diagnostics.

### Modified Capabilities
- `rtk-bash-rewrite`: RTK SHALL record detailed rewrite/fallback debug events through the shared debug registry while preserving normal fallback behavior.

## Impact

- Affected packages: `packages/supi-core`, new `packages/supi-debug`, `packages/supi-rtk`, and `packages/supi` meta-package wiring.
- New exported APIs from `supi-core` for recording and querying debug events.
- New agent-callable tool for fetching sanitized or explicitly authorized raw debug information.
- New SuPi settings section for enabling/disabling debugging, agent access level, max retained events, and notification threshold.
- No intended breaking changes to existing extension behavior or public commands.
