# Testing convention

## Test admission

Each test must protect an identifiable requirement against a plausible fault. Test names and assertions should make that protection clear; a justification comment is not required for every test.

1. **Protect behavior or a meaningful contract.** Test caller-relevant results, failures, state changes, required external effects, or independently required contracts. A copy of the current implementation is not a requirement.
2. **Use an independent expectation.** Choose expected outcomes from requirements, independently worked examples, or required relationships. Recomputing the implementation's calculation or reusing its own result as the sole oracle does not establish correctness. Literal values are appropriate when they specify the expected outcome independently.
3. **Exercise the relevant boundary.** Choose the least costly interface that detects the fault, including stable module interfaces, lifecycle handlers, and consumer-facing artifacts. Keep the subject under test real. Mocks may isolate collaborators at stable boundaries; assertions about test-local data or mock setup alone do not verify the subject.
4. **Assert the contract, not incidental structure.** Static checks must protect a required rule over the actual exported, serialized, configured, or shipped surface. Exact text, shape, presence, types, call counts, and call order need a contractual reason; prefer observable outcomes otherwise. Required outbound interactions are valid observations at a collaborator boundary.
5. **Keep distinct protection.** Consolidate tests that catch the same fault at the same boundary. Multiple layers are justified when they catch different faults, such as computation versus integration wiring. Presence-only or type-only checks add no value when existing behavior tests or typechecking already provide that protection.
6. **Make violations fail.** Assertions must fail when the claimed requirement is broken. Assert required preconditions and outcomes before narrowing or returning; missing handlers or unexpected result variants must not silently bypass the check. A no-throw assertion is sufficient only when successful completion is the requirement.
7. **Stay stable through refactoring.** Internal rearrangements that preserve the protected contract should not require test changes. Mocked private forwarding, internal storage layouts, and implementation-derived snapshots are not substitutes for contract coverage.

## Review checkpoint

When adding, changing, or reviewing tests, check:

- What requirement and plausible fault does each test protect?
- Which assertion would fail for that fault, and does the test exercise the relevant real subject or artifact?
- Is the expectation independent of the implementation, or is the relationship itself the required contract?
- Does existing coverage or static validation already catch the same fault at this boundary?

Use judgment rather than blanket bans on mocks, literals, static checks, or unit tests. Demonstrating a test failing for the target fault can resolve uncertainty; new mutation-testing infrastructure is not required.

## Cleanup

- Delete tests with no distinct protection; deletion does not automatically require a replacement test.
- Strengthen or consolidate weak tests when their claimed requirement still needs coverage.
- Preserve useful contract checks when replacing implementation-detail assertions. Improve the observation boundary rather than dropping the requirement.

Repository-specific test mechanics remain in [the root testing patterns](../../CLAUDE.md#testing-patterns). Package layout is defined in [the package layout convention](package-layout.md#test-layout-rules).
