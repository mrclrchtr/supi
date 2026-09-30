# CLAUDE.md

## Scope

`@mrclrchtr/supi-consulting` owns `consulting_run`, Consulting Agent availability, evidence classification, and Conversation Handle state. Antigravity is the only agent adapter. There is no `supi-agent-runtime` integration.

## Design rules

- Keep agent-specific models, authentication, process code, protocol parsing, and tool-activity classification in `src/agents/antigravity/`. Shared workflow uses the private interface in `src/agents/types.ts`.
- Keep each Model Catalogue immutable until the next session start or reload. Register `consulting_run` only after agent discovery succeeds.
- Require explicit agent, model, and Workspace Access for a new Consultation. Keep `new` and `continue` exact-one; follow-ups inherit all selections and their working directory.
- Acquire a handle before process work. Report process start, including hook probes, through the adapter interface. Reject overlap before startup; retire only after a started follow-up fails or is canceled.
- Keep raw conversation IDs opaque to shared policy. Persist only new consulting handle records and results; old Antigravity state has no migration or legacy read path.
- Use `<PI agent dir>/supi/consulting/antigravity/` for Antigravity state. Leave the old `supi/antigravity/` tree untouched.
- Use the Isolated Antigravity Home for every `agy` process. On macOS, create and unlock its private keychain, exposed as the login keychain, before startup. Do not copy the normal profile, credentials, or PI provider environment.
- Spawn `agy` directly with an argument array. Keep raw stdout, stderr, tool parameters, tool output, and transcripts out of PI state.
- Treat the Inspection Permission Set as an Antigravity policy, not an operating-system sandbox. Project hooks and accepted `read_url(*)` targets remain explicit limitations.
- Build model-visible results in `tool/consulting_run/result.ts`. Renderers use structured details; they never parse result content for presentation.
- Keep sources and workspace paths bounded. Distinguish observed references from claimed references.

## Verification

Use focused tests and source/test typechecking during changes. Run `pnpm verify:ai` before completion. The live probe requires separate approval and `SUPI_CONSULTING_LIVE=1`; it must not run in normal tests or CI.
