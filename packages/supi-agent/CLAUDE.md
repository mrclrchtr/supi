# CLAUDE.md

## Scope

`@mrclrchtr/supi-agent` owns Agent Profile discovery, validation, resource policy, and the fixed child capability catalogue. It is an installable PI extension; Agent Run lifecycle mechanics belong to `@mrclrchtr/supi-agent-runtime`.

## Guidelines

- Keep profile sources self-contained: package, global, and trusted-project directories retain partial manifests by Profile ID and resolve fields project → global → package.
- Preserve invalid source diagnostics and skip that source as a whole; lower-precedence fields may supply the effective profile.
- Keep catalogue choices fixed until the next `session_start`/reload. Apply the 32-ID limit after excluding disabled and invalid profiles; retain all discovered profiles in settings.
- Treat project profile discovery as trust-gated policy, not as a second confirmation flow.
- Keep prompt selection separate from global/project instruction scopes. Exclude ambient extensions, skills, prompt templates, themes, PI `SYSTEM.md`, and `APPEND_SYSTEM.md` resources.
- Keep unrestricted `bash`, `edit`, and `write` mutation-capable. New capabilities default to mutation-capable until explicitly classified.
- Resolve explicit profile models against the containing session's authenticated scoped-model policy before any Agent Run starts.
- Use the existing headless Code Intelligence profile only; do not load the full interactive extension into children.
- Keep diagnostics bounded and omit profile prompt contents, credentials, and raw filesystem errors.
- Keep background batches session-owned and branch-owned. Parent abort cancels active background work; normal settlement does not. Never detach startup or cleanup from the shared registry.
- Commit background Usage receipts only from stored tool results. Do not infer accounting from a prepared or delivered notice.
- Register the Agent Run setting in the factory. Register Enabled, Model, Thinking, and Instructions profile settings at session start; profile settings write only partial user `profile.json` manifests and never package profile files. Enabled and Instructions changes require reload; Model and Thinking apply to the next run.
