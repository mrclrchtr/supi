# Prompt improver package

`@mrclrchtr/supi-prompt-improver` registers `/supi-improve`. It prepares a replacement draft for user review. It does not run the task in the draft.

## Required references

- Before changes to input, context, requests, UI, or lifecycle behavior, read the relevant sections of [SPEC.md](SPEC.md). It defines the behavior contract and acceptance criteria.
- Before changes to diagnostics, read [Opt-in diagnostics](SPEC.md#opt-in-diagnostics) for capture limits, provider-field rules, access controls, and retention.
- Use [CONTEXT.md](CONTEXT.md) for domain terms and [README.md](README.md) for user instructions.

## Design rules

- Keep this package separate from prompt suggestions. Do not replace the main editor.
- Use only the dedicated `promptImprover.model` setting. Do not fall back to the session model.
- Read loaded guidance from command context. Read conversation text from `buildSessionProjection()`.
- Do not scan files, inspect repository state, call tools, or make a summary request.
- Use `completeSimpleModelRequest()` with the stable `prompt-improver` request identity.
- Keep model requests cancellable without a feature timeout or a main-agent abort.
- Use the reusable `@mrclrchtr/supi-ask-user/api` form. Do not call its registered tool or import its private files.
- Use `overlay: true` for every local screen. Cleanup must not write to the main editor.
- Transfer a draft only after confirmation and ownership checks. Apply a proposal only after a second synchronous ownership check.
- Keep private content out of message content and logs by default. Optional debug capture must follow the diagnostics contract: bounded sanitized `data` through the public `@mrclrchtr/supi-core/debug` API, never `rawData` or an access-control bypass.
- Keep text-only support. Do not add attachment handling, feature undo, shortcuts, retries, or automatic submission.

## Package checks

- `pnpm vitest run packages/supi-prompt-improver/`
- `pnpm exec tsc -b packages/supi-prompt-improver/tsconfig.json packages/supi-prompt-improver/__tests__/tsconfig.json`
- `pnpm exec biome check packages/supi-prompt-improver/`
