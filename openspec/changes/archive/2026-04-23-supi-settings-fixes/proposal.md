## Why

Post-implementation review of `supi-settings-registry` identified four correctness issues: the root install surface doesn't include the settings command, LSP `enabled`/`severity` settings don't take effect on `/reload`, the server allowlist submenu silently creates explicit allowlists when inspecting, and the settings registry is unsafe to common item ids like `enabled`. Each breaks the intended UX.

## What Changes

- **Fix**: Add `./packages/supi/settings.ts` to root `package.json` pi.extensions so local-path/git installs get `/supi-settings`
- **Fix**: Re-read `enabled`/`severity` in `session_start` instead of caching at factory time; remove the early `return` when disabled so enabling works without process restart
- **Fix**: Server submenu tracks whether any toggle changed; if not, return `undefined` so inspecting doesn't silently create an explicit allowlist
- **Fix**: Prefix SettingItem ids with section id internally (e.g., `lsp.enabled`) so the registry remains safe to extend with common ids

## Capabilities

### Modified Capabilities
- `settings-registry`: Prefix item ids with section id to prevent cross-extension collision
- `lsp-config`: Read `enabled`/`severity` dynamically in `session_start` instead of caching at factory time

## Impact

- **supi-core**: Update `settings-ui.ts` to prefix/resolve item ids with section id
- **supi-lsp**: Restructure `lsp.ts` factory to always register handlers, move `enabled`/`severity` checks into `session_start`
- **supi-lsp**: Update server submenu in `settings-registration.ts` to track changes
- **Root `package.json`**: Add settings extension entry
