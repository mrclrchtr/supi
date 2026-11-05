# Changelog

## [11.3.0]

- Added package-specific release notes for bounded agent consultations.
- Consultations now use an explicit read-only Antigravity tool selection for web search, direct URL reading, and workspace inspection, with structured completion and observed source evidence.
- Follow-ups that ask the agent not to use tools no longer fail with an unverifiable answer.
- Reading cached web pages no longer reports workspace use or a misleading workspace warning.
- Requires Antigravity CLI `1.4.9` or newer. Start a new Consultation after upgrading: existing default-agent Conversation Handles cannot gain the new tools; they are rejected before process startup, retired, and recorded as `info`-level `consultation.rejected` Debug events instead of errors.
