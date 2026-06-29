# Task 5: Update tests for removed code_brief registration

Update these test files:

- `__tests__/unit/extension-registration.test.ts` — Remove the "while keeping code_brief" test. Ensure `code_brief` is expected NOT to be registered. Update test that checks for all workflow names.
- `__tests__/unit/planner-routing.test.ts` — Remove `code_brief` routing tests (L33-45, L170-171).
- `__tests__/unit/brief.test.ts` — Update reference L78.
- `__tests__/unit/code-impact-tool.test.ts` — Update nextQueries expectations L121, L162.
- `__tests__/unit/presentation/relations-render.test.ts` — Update follow-up text expectations L103, L120.
- `__tests__/unit/details-metadata.test.ts` — Update if needed.
- `__tests__/unit/review-fixes.test.ts` — Update L107.
- `__tests__/unit/code-context-tool.test.ts` — Check for code_brief references.

Add a test that `code_context` (without `task`) returns orientation-style output matching what `code_brief` used to provide.
