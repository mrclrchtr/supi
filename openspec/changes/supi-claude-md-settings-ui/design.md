## Context

`supi-claude-md` exposes configuration through textual subcommands (`interval`, `subdirs`, `compact`). Users must remember syntax, valid values, and scope flags (`--global`). There is no visual confirmation of the current effective configuration without running `status`. The `ask_user` extension demonstrates that `ctx.ui.custom()` overlays can provide structured, keyboard-driven interaction that replaces the command input area — this is the interaction model we want for settings.

## Goals / Non-Goals

**Goals:**
- Provide a single-command entry point (`/supi-claude-md settings`) that opens an interactive overlay
- Display all effective config values at a glance
- Allow toggling booleans, editing the numeric interval, and viewing file names
- Support switching persistence scope between Project and Global
- Apply changes immediately via the existing `supi-core` config API
- Keep the implementation testable without requiring a full pi TUI environment

**Non-Goals:**
- Drag-and-drop file name reordering or a multi-select file picker
- Validation of whether `fileNames` entries exist on disk
- Replacing the non-settings commands (`status`, `refresh`, `list`)
- Backward-incompatible changes to the config schema or persistence format

## Decisions

**1. Overlay instead of widget**
Settings are edited infrequently and benefit from a focused, modal interaction. A full-screen or centered overlay via `ctx.ui.custom()` with `{ overlay: true }` matches the `ask_user` pattern and avoids competing with the chat history for screen space.

**2. `SettingsList` for booleans, custom row for interval**
`SettingsList` from `@mariozechner/pi-tui` handles the 90% case (on/off toggles). `rereadInterval` is a hybrid value (number, 0, or reset-to-default) so it gets a dedicated editable row with an inline numeric input. `fileNames` is read-only in the overlay (displayed as comma-separated) because inline list editing adds significant complexity for a rarely-changed setting; users can still edit the JSON file directly.

**3. Scope toggle inside the overlay**
A scope selector (Project / Global) is shown at the top of the overlay. Changing the scope reloads the displayed values from that scope's config. This is clearer than a `--global` CLI flag and matches modern settings UIs.

**4. Immediate persistence**
Values are written to config as soon as the user confirms a change (toggle or input submit). This provides instant feedback and avoids a separate "Save" step. If the user presses Escape, already-applied changes remain applied (there is no transaction/rollback).

**5. Extraction to `settings.ts`**
All overlay code lives in a new `settings.ts` module. `commands.ts` gains a thin `case "settings":` branch that calls `openSettingsOverlay(ctx)`. This keeps command routing separate from TUI rendering, mirroring how `ask-user` splits `flow.ts` from `ui-rich*.ts`.

## Risks / Trade-offs

- **[Risk]** `SettingsList` only supports string value cycling; interval input needs custom handling.
  **Mitigation**: Use a lightweight state machine inside the overlay component. When the interval row is selected, switch to an `Input` component and handle Enter/Escape manually. The custom input code is isolated to `settings.ts`.
- **[Risk]** TUI overlay testing requires mocking `ctx.ui.custom()` and the component contract.
  **Mitigation**: Extract pure helper functions (build items from config, persist changes) that are unit-testable without the TUI. Overlay integration is covered by a single smoke test with a mocked `ctx`.
- **[Risk]** `fileNames` being read-only may frustrate power users.
  **Mitigation**: The overlay shows the exact JSON path (`~/.pi/agent/supi/config.json` or `.pi/supi/config.json`) so users know where to edit manually.

## Migration Plan

No migration required. Existing subcommands continue to work. The new `settings` subcommand is additive.
