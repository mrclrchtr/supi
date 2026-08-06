# Use field-level overlays for Profile Directories

Agent Profiles are discovered as Profile Directories with a `profile.json` manifest rather than stored in shared SuPi configuration. User profiles live under `~/.pi/agent/supi/agents/`; the nearest `.pi/supi/agents/` from cwd through the Git root supplies project profiles only when PI project trust is active. Outside Git, only the exact cwd project directory is considered.

Sources keep package, global, and trusted-project entries separately. Precedence is project → global → package for each manifest field. A user `profile.json` may contain only the fields it overrides, such as `{ "model": "provider/id" }`; omitted fields use the next available source. Lists are replaced as fields and are never merged element by element. Prompt assets follow the source that provides the selected `systemPrompt` field.

A malformed source is unavailable as a whole. Its Profile Diagnostic is retained, and resolution falls through to lower-precedence sources. The final merged manifest must contain `description`, `tools`, `systemPrompt`, and `instructionScopes`; this completeness check happens when a task is preflighted, not while the catalogue stores source entries.

The `supi-agent` extension contributes one `/supi-settings` subsection per discovered Profile ID. The subsection can persist only `model` and `thinking` overrides in the global or trusted-project Profile Directory. Settings use read-modify-write and delete an empty partial manifest after the last override is inherited.
