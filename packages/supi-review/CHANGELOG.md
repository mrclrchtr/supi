# Changelog

## [12.0.0]

- Codemode now lists `review_output` and `review_audit` under a `review` namespace heading, so scripts can find them with `describeNamespace("review")` or `searchTools(query, { namespace: "review" })`. Every Review tool, including the Reviewer child tools, now declares audited `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` annotations, which permission extensions can read from `pi.getAllTools()` ([#582](https://github.com/mrclrchtr/supi/issues/582)).
- Reviewer child sessions use the bundled Code Intelligence 12.0.0, so AST lookups on large files are much faster and Java, Kotlin, Ruby, and JavaScript/TypeScript export and call results are more accurate. Reviewers call `code_find` with a `search` selector and `scopes`, and `code_inspect` with `anchor`.

## [11.4.0]

- Reviewer Run retrospectives (opt-in via `debug.agentRunRetrospectivesEnabled`) now also ask about Code Intelligence (`code_*`) results that were incomplete, oversized, ambiguous, or failed, and record a `promptRevision` so older and newer reports can be told apart.

## [11.3.0]

- Added opt-in `review.reviewerWebEnabled`: Reviewer investigation can use the Web tools the session provides, as untrusted support that never replaces Target Evidence.
- Added package-specific release notes for inspection-only code reviews.
