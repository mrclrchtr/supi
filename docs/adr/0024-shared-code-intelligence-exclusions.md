# One configured exclusion list for automatic code intelligence

**Status:** Accepted and implemented.

Use `code-intelligence.exclude` as the single configured exclusion list for automatic LSP work and broad AST searches. Replace `lsp.exclude` rather than keep a second LSP-only list or a compatibility alias. This keeps fixture projects out of normal workspace work without requiring users to maintain different lists for the two analysis methods.

## Consequences

- An explicitly selected fixture file or directory remains available for inspection. Exclusion is not an access restriction.
- Keep existing built-in safeguards; do not use this change to unify every implicit scan rule.
- The project list replaces the global list. Removing the project value restores inheritance.
- Apply changes on reload or restart, not during an active request.
- An old `lsp.exclude` value produces a migration error before automatic work silently loses that rule. Do not automatically edit personal configuration.
- Compiler, lint, and test-discovery exclusions remain separate concerns.

## Trade-off

A separate LSP-only list would preserve more control and reduce migration work. We reject it because the extra policy would make configured exclusions differ between LSP and AST work and would require users to determine which list caused the difference.

See the [LSP configuration reference](../../packages/supi-lsp/README.md#automatic-workspace-path-policy) for pattern syntax, inheritance, and migration.
