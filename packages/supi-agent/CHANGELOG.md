# Changelog

## [11.4.0]

- Agent Run retrospectives (opt-in via `debug.agentRunRetrospectivesEnabled`) now also ask about Code Intelligence (`code_*`) results that were incomplete, oversized, ambiguous, or failed, and record a `promptRevision` so older and newer reports can be told apart.

## [11.3.0]

- Agent Profiles can allow `supi-web` tools individually; `explore` and `general` allow all four. Runs receive them only when the loaded Web extension provides them, without a bundled dependency.
- Added package-specific release notes for Agent Run delegation and saved conversations.
