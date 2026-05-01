## Context

Post-implementation review of the `supi-settings-registry` change identified four bugs that affect correctness and UX. These are fixes, not redesigns.

## Goals / Non-Goals

**Goals:**
- Fix root install surface missing settings command
- Fix LSP `enabled`/`severity` not responding to `/reload`
- Fix server submenu silently creating explicit allowlists
- Fix registry id collision across extensions

**Non-Goals:**
- Redesign the settings UI or registry API
- Add new features beyond these fixes
- Change the config format or persistence layer

## Decisions

### 1. Always register LSP handlers, gate in session_start

**Decision**: Remove the early `return` from `lspExtension()` factory. Always register all handlers. In `session_start`, read `enabled`/`severity` from supi config. If disabled, skip initialization (don't create LspManager, don't register tools). If enabled, create state with current severity.

**Rationale**: `/reload` re-runs `session_start`. If handlers are already registered, a settings change from disabled→enabled will take effect on the next reload. The state object can be recreated each session_start with fresh settings.

### 2. Server submenu tracks dirty state

**Decision**: Add a `dirty` flag to the server submenu. Only set it to `true` when the user actually toggles a server. On Escape, return `undefined` if not dirty, otherwise return the joined enabled list.

**Rationale**: `SettingsList` treats any defined result from `done()` as a change. Returning `undefined` signals no-op to the caller.

### 3. Internal id prefixing in settings-ui

**Decision**: In `buildFlatItems`, set `id: "${section.id}.${item.id}"`. In `findSectionAndId`, split on `.` to recover section and item id. Extensions keep using simple ids (`enabled`, `severity`); the UI layer handles namespacing.

**Rationale**: Zero API change for extensions. The collision risk is entirely in the flat list rendering, so fix it there.

## Risks / Trade-offs

- **State recreation on session_start** — Recreating `LspRuntimeState` each session means losing any in-memory cached data. Mitigation: LSP state is inherently per-session (servers are started/shutdown with the session). No meaningful state is lost.
