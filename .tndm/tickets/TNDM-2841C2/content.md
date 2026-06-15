# Implementation overview — code_find evidence strictness

## Scope
This plan covers a single subsystem: the public `code_find` contract in `packages/supi-code-intelligence`.

No split is needed. The change is coherent, bounded, and testable as one implementation plan.

## Detail level
Use a focused executable plan: the change is multi-file and intentionally behavioral, but narrow enough that four ordered tasks are sufficient.

## Contract to implement
Implement the approved strict `code_find` matrix exactly:

- omitted `mode` → allowed only when `kind` is omitted; default text search
- `mode: "text"` → allowed only when `kind` is omitted
- `mode: "regex"` → allowed only when `kind` is omitted
- `mode: "semantic"` → allowed only when `kind` is omitted; fail if semantic/LSP capability is unavailable; succeed with a no-results result when capability is available but no symbols match; no text fallback
- `mode: "ast"` → requires `kind`; supported kinds are only `definition`, `import`, `export`; fail if structural capability is unavailable; succeed with a no-results result when the search executes but finds nothing
- every unsupported combination or explicit-mode capability miss is a real tool failure signaled by throwing from tool execution

## File map
- `packages/supi-code-intelligence/src/tool/execute-find.ts` — enforce the strict mode/kind matrix, remove soft fallbacks, and keep successful no-results results only for valid executed searches.
- `packages/supi-code-intelligence/src/tool/tool-specs.ts` — update `code_find` description and prompt guidance so the public tool contract matches the runtime behavior and PI tool-guidance conventions.
- `packages/supi-code-intelligence/src/workflow/schemas.ts` — tighten `code_find` parameter descriptions for `mode` and `kind` so the registered schema advertises the same supported combinations.
- `packages/supi-code-intelligence/__tests__/unit/code-find-tool.test.ts` — lock the runtime contract with failing-then-passing tests for invalid combinations, capability-unavailable failures, and valid no-results behavior.
- `packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts` — lock the registered metadata surface for `code_find` so descriptions and prompt guidance reflect the strict matrix.
- `packages/supi-code-intelligence/README.md` — update user-facing `code_find` documentation to the strict matrix and remove stale fallback/heuristic claims.
- `packages/supi-code-intelligence/CLAUDE.md` — update maintainer-facing contract notes to the same strict matrix.

## Constraints
- Do not change any public behavior for `code_context`, `code_graph`, `code_impact`, or test discovery.
- Do not add new search capability; this is a contract-shrinking hardening pass.
- Do not expose AST `call`, `type`, or `test` as supported combinations in this phase.
- Keep all public contract surfaces aligned: runtime behavior, schema descriptions, tool description, prompt guidance, README, CLAUDE.md, and tests.

## Execution strategy
1. Write failing tests first for the strict runtime and metadata contract.
2. Implement the strict runtime behavior and metadata/schema wording until the targeted tests pass.
3. Update README and CLAUDE.md to match the exact matrix and remove stale claims.
4. Run package-level tests, typecheck, lint, and full-repo verification.

## Verification strategy
- RED/GREEN gate: targeted `code_find` and registration tests
- package verification: unit tests, package TypeScript build, package Biome check
- integration gate: full repo `pnpm verify:ai`
