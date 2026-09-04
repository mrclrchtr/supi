# CLAUDE.md

## Scope

`@mrclrchtr/supi-antigravity` owns the `antigravity_run` PI tool, Antigravity CLI availability, the Isolated Antigravity Home, Consultation Workspace, evidence classification, and Conversation Handle state.

## Design rules

- Keep the Model Catalogue immutable until the next session start or reload.
- Register `antigravity_run` only after `agy` version and curated-model discovery succeeds.
- Use the Isolated Antigravity Home for every Antigravity process. On macOS, create and unlock its private keychain, exposed as the login keychain, before starting `agy`. Do not copy the normal Antigravity profile, credentials, or PI provider environment.
- Spawn `agy` directly with an argument array. Keep stdout, stderr, tool parameters, tool output, and transcript data bounded and out of PI state.
- Treat the Inspection Permission Set as an Antigravity policy, not an operating-system sandbox. Project hooks and accepted `read_url(*)` targets remain explicit limitations.
- Keep new and follow-up inputs exact-one. Follow-ups inherit model and workspace from their Conversation Handle.
- Reject same-handle overlap before process startup. Retire a handle only after a follow-up has acquired it and started process work.
- Build model-visible result content in `tool/antigravity_run/result.ts`; renderers use structured details and never parse result content for chrome.
- Keep sources and workspace paths bounded. Distinguish observed references from claimed references.

## Verification

Use focused tests and typechecking while changing this package. Then run `pnpm verify:ai` and package staging checks before completion. The live probe requires an explicit `SUPI_ANTIGRAVITY_LIVE=1` variable and must not run in normal tests or CI.
