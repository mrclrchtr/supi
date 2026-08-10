# supi-skills

Scoped skill controls and `$skill-name` input shortcuts.

## Package-specific gotchas

- PI settings own Skill Load. Scoped SuPi config owns Model Invocation overrides.
- Full load changes require `/reload`. Runtime-only skill contributions cannot be fully disabled.
- The skill catalog uses PI's resolved resources. Keep broad user filters and stale exact overrides intact.
- Project writes require PI project trust.
- Installed skill names for `$skill-name` are captured at `session_start`. Outside `$...` tokens, autocomplete delegates to the current provider.
- The package registers an asynchronous `SettingsModule` for `/supi-settings`; it does not bundle `supi-settings`, because two copies register numbered duplicate commands. Standalone users must install `@mrclrchtr/supi-settings` separately.
