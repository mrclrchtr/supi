# Archive

## Verification evidence

### Ticket and task status
- Reviewed `TNDM-CFD6SE` overview in `.tndm/tickets/TNDM-CFD6SE/content.md`.
- Confirmed all planned tasks are marked done in the task manifest.

### Task 1 — noisy test-name regressions / graph + context cleanup
Fresh verification command:
- `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts --reporter=verbose`

Result:
- Passed fresh: `3` test files, `41` tests passed, `0` failed.
- Confirms recognized test names still render when available and helper fallback names are no longer surfaced in user-facing `code_graph` / `code_context` markdown.

### Task 2 — changedFiles impact is structural-only
Fresh verification command:
- `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts --reporter=verbose`

Result:
- Passed fresh: `1` test file, `24` tests passed, `0` failed.
- Confirms changed-files impact ignores semantic-only test references, still finds convention-based test companions, and retains the `**Evidence: structural**` footer.

### Task 3 — inspect guidance and docs alignment
Fresh automated verification command:
- `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/code-inspect-tool.test.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts --reporter=verbose`

Result:
- Passed fresh: `2` test files, `25` tests passed, `0` failed.

Fresh manual doc audit:
- Reviewed `packages/supi-code-intelligence/README.md` public-contract sections.
- Reviewed `packages/supi-code-intelligence/CLAUDE.md` maintainer contract sections.
- Verified docs now match the runtime contract:
  - `code_inspect` follow-up guidance uses `code_context` with `scope`, not unsupported `file`-style public usage.
  - stale public-surface mentions like `path` / `exportedOnly` were removed from the shared input contract section.
  - test-list behavior now documents `_(no recognized test blocks)_` instead of implying helper fallback names are shown or always filtered by a different rule.
  - changed-files test labeling is documented as `Likely Tests (conventions-only)`.

### Task 4 — focused regressions, full verification, and smoke checks
Fresh focused regression command:
- `RTK_DISABLED=1 pnpm vitest run packages/supi-code-intelligence/__tests__/unit/analysis/relations-tests.test.ts packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts packages/supi-code-intelligence/__tests__/unit/code-context-tool.test.ts packages/supi-code-intelligence/__tests__/unit/code-impact-tool.test.ts packages/supi-code-intelligence/__tests__/unit/code-inspect-tool.test.ts packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts --reporter=verbose`

Result:
- Passed fresh: `6` test files, `90` tests passed, `0` failed.

Fresh full verification command:
- `RTK_DISABLED=1 pnpm verify:ai`

Result:
- Passed fresh.
- `biome ci`, `tsc -b`, workspace Vitest suite, and `pack:verify` completed successfully.
- Non-blocking existing Biome warnings were emitted elsewhere in the repo and in unrelated pre-existing files; no verification errors remained.

Fresh manual smoke check:
- Ran a fresh-process smoke script against the current working tree’s public tool registration surface with mocked structural outline data for `packages/supi-code-intelligence/__tests__/unit/tool/execute-graph.test.ts`.
- Observed:
  - `code_graph` tests output showed the companion test file and `_(no recognized test blocks)_`, with no helper fallback names.
  - `code_context` tests output showed the same cleaned behavior.
  - `code_impact` with `changedFiles` found the convention-based likely test and showed `## Likely Tests (conventions-only)` plus the `**Evidence: structural**` footer.

### Diff/doc review
Reviewed `git diff` for the real delta across `packages/supi-code-intelligence` and verified the docs changed are the ones affected by this work:
- `packages/supi-code-intelligence/README.md`
- `packages/supi-code-intelligence/CLAUDE.md`

No additional doc updates were required after verification.

### Final closeout summary
The implemented delta matches the approved design:
- user-facing test listings no longer surface helper fallback names
- discovered tests with no recognized blocks render `_(no recognized test blocks)_`
- changed-files impact is now truly structural-only and documented consistently
- inspect follow-up guidance and public docs are aligned with the current public tool contract
