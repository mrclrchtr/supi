# CLAUDE.md

## Scope

`@mrclrchtr/supi-core` is a pure library package. It provides shared config, context, settings, project-root helpers, and prompt-surface resolution. There is no pi extension. `@mrclrchtr/supi-settings` owns the `/supi-settings` command and its TUI.

Prefer domain subpath imports; use `@mrclrchtr/supi-core/api` when importing from three or more domains.

## Ownership

- Settings modules own data and persistence; `supi-settings` owns the UI. Keep the shared API deliberate and small.
- Reuse core path/URI normalization, themed report helpers, and normalized-cwd registry storage across packages rather than copying them. Package-specific state unions and wait semantics stay with their owners.
- Debug producers own event meaning; `supi-debug` owns retention and display policy. `startDebugTimer()` is a no-op when Debug is disabled; pass a factory to `finish()` to avoid building event data on disabled hot paths.
- Both model-completion paths share stable affinity and OpenCode header policy. The provider-neutral simple path delegates output limits to PI.

## Config gotchas

- Resolution order is `defaults <- global <- project`.
- `loadSupiConfigForScope()` is for settings UIs that need raw scope values; `loadSupiConfig()` is for effective merged runtime config.
- Config merges are shallow per section; do not assume nested objects deep-merge.
- Pass `homeDir` in tests rather than mocking `os.homedir()` or mutating `process.env.HOME`; `defineConfigSettings()` forwards it through scoped loads and writes.

## Shared behavior gotchas

- The settings registry lives on `globalThis` with `Symbol.for("@mrclrchtr/supi-core/settings-registry")` so registrations survive jiti/symlinked duplicate module instances.
- Use `createSessionStateRegistry()` for workspace-keyed session state; share only the normalized-cwd storage plumbing.
- Call `registerSettings()` during the extension factory function. Reads and writes happen later through the registered module.
- `settings-schema.ts` adapts fixed SuPi config to `SettingsModule`; it owns source resolution (`project`/`global`/`default`), typed parsing, scoped writes, Unset deletion, and structured `afterPersist` notifications.
- `modelPicker` fields include `disabled` by default; use `staticOptions` for host-owned sentinels and `includeDisabled: false` when disabling is not valid.
- `ScopedFieldValue.displayValue` includes the source badge for rendering; use `editValue` for editor prefills and concrete-choice comparisons. Do not parse the badge back out of display text.
- When public exports change, audit mocks for the entrypoints consumers import; missing mocked exports cause "No X export is defined on the mock" errors.
- `walkProject()` intentionally skips `node_modules`, `.git`, and `.pnpm`.

