# Task 5: Update docs for bounded discovery and explicit empty-test evidence

## Goal

Document the user-visible behavior changed by this plan without adding the broader recipe/cheatsheet documentation bundle.

## Files

- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`

## Changes

1. In the `code_graph`, `code_context`, and `code_impact` docs, describe bounded package/tool-aware test discovery as part of deterministic conventions.
2. Mention that exact candidates are generated for package layouts and `src/tool/execute-<name>.ts` source files, but no broad search or fuzzy matching is performed.
3. Document that `code_impact({ includeTests: true })` renders an explicit empty-test note when bounded test discovery completes and finds no likely tests.
4. Preserve existing provenance wording: `semantic+conventions` means semantic evidence contributed; `conventions-only` means deterministic candidates only.

## Test exemption

Docs-only task. No RED phase is required.

## Verification

Run:

```bash
RTK_DISABLED=1 pnpm exec biome check packages/supi-code-intelligence/README.md packages/supi-code-intelligence/CLAUDE.md
```

Expected result: Biome reports no formatting or lint errors for the edited docs.
