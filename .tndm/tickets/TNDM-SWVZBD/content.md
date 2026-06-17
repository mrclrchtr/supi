# Support AST call search in `code_find`

## Problem

`code_find` has an inconsistent public contract for AST call search:

- `packages/supi-code-intelligence/src/workflow/schemas.ts` and `packages/supi-code-intelligence/src/tool/tool-specs.ts` expose `mode: "ast", kind: "call"`.
- `packages/supi-code-intelligence/src/tool/execute-find.ts`, `packages/supi-code-intelligence/README.md`, `packages/supi-code-intelligence/CLAUDE.md`, and at least one unit test still describe `call` as unsupported or omit it from supported AST kinds.
- `packages/supi-tree-sitter/src/tool/call-sites.ts` can extract call sites, but JS/TS/TSX currently returns leaf names such as `trim` for `params.query.trim()`, so qualified call queries such as `params.query.trim` cannot match.

## Scope

Officially support `code_find({ mode: "ast", kind: "call" })` and make JavaScript/TypeScript/TSX call-site extraction return full callee expressions without call arguments.

Examples for JS/TS/TSX:

- `params.query.trim()` → `params.query.trim`
- `obj.method()` → `obj.method`
- `new Thing()` → `Thing`
- outer call in `factory()()` → `factory()`
- tagged template `tagged\`x\`` → `tagged`

Non-TS grammars keep their existing call-site behavior in this change.

## File map

- `packages/supi-tree-sitter/src/tool/call-sites.ts` — tune JS/TS/TSX call-site queries and normalize captured callee text.
- `packages/supi-tree-sitter/__tests__/call-sites.test.ts` — new integration-like Tree-sitter tests for TypeScript-family full-expression call sites.
- `packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts` — update the strict contract test so `call` is supported, add `code_find` coverage for AST call mode with a structural provider.
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` — strengthen metadata assertions so description/guidance/schema all include `call` consistently.
- `packages/supi-code-intelligence/src/tool/execute-find.ts` — align comments and runtime error messages with `definition`, `import`, `export`, and `call` as supported AST kinds.
- `packages/supi-code-intelligence/README.md` — update user-facing `code_find` docs to include `call`.
- `packages/supi-code-intelligence/CLAUDE.md` — update maintainer/agent guidance to include `call`.

## Approach

Use a small red-green-refactor sequence:

1. First add failing tests that prove the desired contract and TypeScript full-expression behavior.
2. Implement the minimal structural extractor change in `supi-tree-sitter` for JS/TS/TSX only.
3. Align `code_find` runtime text and docs with the supported `call` kind.
4. Run focused tests and full repo verification.

## Constraints and non-goals

- Do not add public support for AST `type` or `test` kinds.
- Do not sweep or alter non-TS Tree-sitter grammar behavior.
- Do not change `code_find` text, regex, or semantic modes.
- Do not introduce a new result shape; continue using the existing call-site `name` string.
- Keep the implementation small and evidence-backed by tests.

## Verification strategy

- Run focused failing tests after writing RED tests to confirm the current implementation does not satisfy full-expression call search.
- Run focused passing tests after implementation.
- Run package-level typechecks for affected packages and tests.
- Finish with `pnpm verify:ai`.