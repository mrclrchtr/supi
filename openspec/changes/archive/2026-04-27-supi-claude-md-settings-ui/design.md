## Context

This change originally proposed a dedicated extension-local settings command with extension-local overlay code. The implementation has since moved to SuPi's shared settings architecture:

- `packages/supi-core/settings-command.ts` registers a single `/supi-settings` command
- `packages/supi-core/settings-ui.ts` renders the shared overlay
- `packages/supi-claude-md/settings-registration.ts` contributes the Claude-MD settings section

The design should therefore describe Claude-MD as a participant in the shared settings UI rather than a standalone command surface.

## Goals / Non-Goals

**Goals:**
- Expose Claude-MD settings inside the shared `/supi-settings` overlay
- Show all relevant Claude-MD config at a glance for the selected scope
- Allow editing `subdirs`, `rereadInterval`, `contextThreshold`, and `fileNames`
- Support switching persistence scope between Project and Global
- Apply changes immediately through the existing `supi-core` config and settings-registry APIs
- Keep Claude-MD-specific logic isolated to settings registration and persistence helpers

**Non-Goals:**
- Reintroducing a dedicated extension-local settings command
- Building a one-off custom overlay just for Claude-MD
- Validating whether `fileNames` entries exist on disk
- Adding a separate transactional save/apply step
- Providing a special default-reset affordance for `rereadInterval` beyond direct config editing

## Decisions

**1. Use the shared `/supi-settings` command**
Claude-MD settings live inside the shared SuPi settings overlay. This keeps the user experience consistent across extensions and avoids per-extension command proliferation.

**2. Register settings instead of rendering a bespoke overlay**
Claude-MD contributes a `SettingsSection` via `registerClaudeMdSettings()`. The shared overlay is responsible for rendering sections, searching items, switching scopes, and routing persisted changes back to the owning section.

**3. Reuse `SettingsList` primitives**
`subdirs` and `contextThreshold` use normal `SettingsList` value cycling. `rereadInterval` and `fileNames` use `SettingItem.submenu` text inputs because they need free-form editing while still fitting the shared UI model.

**4. Keep `rereadInterval` simple: integer turns or `0`**
The current implementation treats `rereadInterval` as an integer value where `0` disables refresh/re-read behavior. This is simpler than introducing a separate “default” state in the shared UI and matches the underlying runtime semantics.

**5. Make `fileNames` editable**
The current implementation allows editing `fileNames` as a comma-separated list. This is more useful than a read-only display and remains simple enough for the shared settings UI. Clearing the input removes the scoped key so defaults apply again.

**6. Immediate persistence**
Values are written as soon as the user confirms a change. The shared settings overlay re-reads section values after persistence so the displayed state stays in sync with config.

## Risks / Trade-offs

- **[Risk]** Shared settings UX is less tailored than a dedicated Claude-MD-only overlay.
  **Mitigation**: Claude-MD-specific labels, descriptions, and submenu prompts live in `settings-registration.ts`, while generic UI behavior stays centralized.

- **[Risk]** `rereadInterval` does not expose an explicit “restore default” action in the UI.
  **Mitigation**: The common cases are covered by setting a concrete number or `0`; power users can still edit the JSON config directly if they need to remove the key entirely.

- **[Risk]** Editable `fileNames` can accept invalid or undesired values.
  **Mitigation**: This mirrors the underlying config format and keeps the UI lightweight; no extra filesystem validation is required.

## Migration Plan

No migration is required. Users now configure Claude-MD through the shared `/supi-settings` command. Existing config keys and file locations remain unchanged.
