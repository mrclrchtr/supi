---
description: Migrate one SuPi package to native structured tool results for codemode
argument-hint: "<package path>"
---

# Migrate structured tool results

Migrate the tools owned by `$1` to PI's native `outputSchema` + `structuredContent` support. Implement the migration, not just a plan. If the package argument is missing or invalid, ask for it before editing.

## Scope and baseline

1. Read installed PI documentation first, starting at `docs/index.md`, then the relevant sections of `docs/extensions.md` and `docs/codemode.md`. Verify the installed types or implementation when the documented contract leaves uncertainty.
2. Read `docs/INDEX.md`, `docs/pi/tool-guidance.md`, `docs/conventions/tool-architecture.md`, and the package instructions. Follow linked references relevant to result assembly, rendering, and tests.
3. Inventory every tool the package owns, including indirect or dynamic registration. Trace schemas, execution, result assembly, renderers, result-transforming hooks, and existing tests. Distinguish owned tools from tools forwarded from dependencies.
4. Identify which tools already support structured results and which need changes. Finish the inventory only when every owned tool is accounted for.
5. If open questions, uncertainties, or design trade-offs remain, load and follow `@.agents/skills/grill-with-docs/SKILL.md`. Resolve factual questions through documentation and code inspection; use its interview and documentation workflow to settle decisions requiring user input before implementing the affected behavior.

Keep implementation changes scoped to this package and strictly necessary consumers or shared contracts. Preserve tool names, inputs, execution behavior, and direct-call usability. Use one execution path with two result representations; rely on PI's native routing rather than adding a format argument, codemode-specific tool, or execution mode. Avoid unrelated refactors and speculative shared infrastructure.

## Result contract

For each owned tool:

- Declare an accurate `outputSchema` and return matching `structuredContent` on every returned final-result path. Keep the schema, TypeScript types, registration, and result assembly aligned using existing repository patterns.
- Expose meaningful domain fields or operation outcomes. Text belongs in structured data when it is the actual payload; a rendered Markdown summary is not a substitute for a data contract.
- Build structured data and concise model-facing `content` from the same canonical facts. Keep `details` serving UI and state reconstruction; it is not the codemode return contract. Preserve useful direct-call content without dumping the full structured payload into it.
- Return serializable data rather than mutable providers, caches, runtime objects, or private state. Review fields for sensitive or internal information before exposing them.
- Represent applicable status, provenance, completeness, pagination, truncation, and omitted-result information structurally. Preserve the distinction between zero matches, partial evidence, and failure. Keep metadata proportional to the tool's actual behavior rather than imposing a universal envelope.
- Follow the installed PI failure contract. When failure data must reach scripts, use a schema-defined failure discriminator and the appropriate `isError` result flag. Do not assume the outer result's `isError` becomes part of `structuredContent`. Preserve thrown errors and cancellation where appropriate; do not convert them into successful empty results.
- Check wrappers and `tool_result` hooks that transform or redact results: they must preserve or consistently transform both representations, without leaking data through `structuredContent`.

Account for every tool in the final report. If meaningful structured support is blocked or inappropriate for a tool, explain why instead of silently skipping it or attaching an empty schema.

## Verification

Add focused regression tests at the existing registration and execution seams:

- Validate actual returned `structuredContent` against the registered `outputSchema`, covering representative success and applicable empty, partial, paginated, and returned-failure outcomes.
- Check that direct-call `content`, rendering, and state behavior remain useful and consistent with the structured facts.
- Verify a representative call through PI's default codemode path: `await tools.<name>(args)` must resolve to the structured value, and a script must be able to select its fields without parsing Markdown. Use existing integration facilities or a runtime probe; a mock returning a hand-built object does not establish PI routing behavior.
- Cover distinct result-assembly patterns and meaningful risks rather than repeating constant assertions for every tool. Update affected consumers, mocks, and guidance that assume string results.

Run focused package tests and typechecks, then `pnpm verify:ai` as required by repository instructions. Report unavailable runtime verification or failing checks explicitly; do not claim codemode integration was verified from schema tests alone.

## Completion report

Summarize:

- Every owned tool, its migration status, and its structured result shape.
- Changed files and any necessary cross-package changes.
- Tests and checks run, including evidence for default codemode delivery.
- Remaining blockers or exceptions, if any.

Note that active PI sessions require `/reload` or a restart to load extension changes.
