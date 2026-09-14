# Issue 407 follow-ups

**Status:** Work items 1 and 2 implemented; the follow-up 1 regression and final diagnostic return race are corrected; default-parallel focused checks passed; full workspace verification, Kotlin rerun, and parent live Pi verification pending
**Overall baseline:** `b6bf5209`
**Work item 2 baseline:** `52315e0c`
**Scope:** Input freshness and server-requested diagnostic refresh only for this implementation slice

## Approved policy

- Complete all four follow-ups, with one owned work item per slice.
- Keep the engine LSP-agnostic.
- Keep existing public `code_*` input schemas.
- Keep manager/client boundaries private.
- Keep current caller budgets.
- Add no public adapter registry.
- Add no dependency graph.
- Add no continuous filesystem watcher.
- Apply one shared freshness check to every semantic evidence request:
  - diagnostics
  - hover
  - definitions
  - references
  - workspace-symbol queries
  - refactor planning
- Keep structural-only work outside the Semantic input barrier.
- Invalidate evidence immediately after reported changes.
- Synchronize on demand, not after every edit.
- Cover reported workspace changes from Pi write, edit, and refactor operations, and source/sentinel notifications.
- Detect disk changes to already-open documents when evidence is requested.
- Do not claim a complete workspace snapshot or detection of all unreported closed-file changes.
- Use the conservative input scope: open documents on each Required LSP route.
- Synchronize changed input text only. Never resend unchanged text only to confirm diagnostics.
- Keep evidence and result scope equal to the caller's scope.
- Share pending synchronization between concurrent requests.
- Known input changes during an operation must not allow stale semantic or diagnostic results to return as completed/current.
- Failed reads, deletion, changed lifecycle, cancellation, and deadline exhaustion fail closed with existing typed partial/unavailable semantics.
- Keep owned diagnostic transport settlement and bounded scheduling intact.

## Implementation choices for this slice

- Ordinary diagnostic refresh keeps its own read, classification, and budget path. It does not run a second input-barrier preflight, so unchanged text is not resent.
- Server-requested refresh uses diagnostic-only invalidation. It keeps the semantic input generation and unchanged open-document synchronization, then collects applicable native pull or TypeScript request evidence. A real disk change uses normal synchronization.
- Server refresh demand shares one active pass and one newer generation. A newer generation invalidates the active evidence, but the owned diagnostic transport remains active until settlement before queued work can start.

## Work items

| ID | Work item | Status |
| --- | --- | --- |
| 1 | Shared Semantic input barrier for semantic evidence freshness | Implemented and verified in this slice |
| 2 | Native server-requested diagnostic refresh without pretending source text changed | Implemented and verified in this slice |
| 3 | Mixed-language diagnostic filtering | Later; pending |
| 4 | Scope labels that separate maintenance scope from result coverage | Later; pending |

## Approved test seams

1. Actual Pi tool and event handling plus public tool behavior.
2. Public `WorkspaceLspRuntime` interface.

Use real TypeScript/Pyright where useful and controlled server responses for races and failures. Protocol traffic may be observed. Private client maps are not a test contract. Tests must reproduce actual Pi edit completion followed by the next semantic query. Use `createPiMock` and `makeCtx`; do not define custom Pi mock factories. Do not skip or weaken Kotlin integration tests.

## Required regressions

- Edit an open dependency through the actual Pi edit flow, then query dependent diagnostics.
- Edit an open dependency on disk without a reported workspace change, then query semantic evidence.
- Query hover, definitions, references, workspace symbols, refactor planning, and diagnostics before a diagnostic request.
- Cover concurrent synchronization and read-failure cases.
- Preserve unchanged-document synchronization behavior.
- Preserve cancellation, deadline, deletion, and lifecycle fail-closed behavior.

## Later-work constraints

- Keep `tsconfig`/`jsconfig` filtering for TypeScript/JavaScript-family files only.
- Retain automatic path exclusions and other diagnostic suppressions.
- Omit irrelevant Tsconfig labels for other languages.
- Retain broad maintenance if required and label its scope separately from result coverage.
- Do not claim that root-cause or baseline attribution for all live failures is proved.
- Items 3 and 4 remain pending and are outside this slice.

## Verification record

- Implementation evidence: `ClientDiagnostics` uses one bounded asynchronous full-content read barrier for semantic and exact diagnostic requests. `LspClient` checks the barrier before and after semantic requests. The barrier keeps verified disk observations separate from explicitly supplied document content; a selected override does not replace the disk baseline. Ordinary refresh reports detected content changes through the same input and evidence revision, updates the verified disk observation, and does not resend unchanged text.
- Follow-up correction evidence: `SemanticInputBarrier` stores and shares one mutable pending owner, waits for incompatible owners to settle before replacement, stops dispatch after abandonment, and drains all in-flight readers before settlement. Public-runtime regressions cover cancellation, deadlines, input generations, concurrent callers, and same-size edits with preserved mtimes. Unit tests use a controlled `node:fs/promises` seam and `vi.runAllTicks()` instead of extra reads or fixed Promise-microtask loops.
- Baseline red evidence: in an isolated worktree at `b6bf5209`, with the new recovery test and its controlled LSP fixture copied into the worktree, this command failed:

  ```bash
  pnpm exec vitest run packages/supi-code-intelligence/__tests__/integration/substrate/lsp/recovery-public-tool.integration.test.ts --testTimeout=30000 --reporter=verbose
  ```

  Result: `expected 4 to be greater than 6`. The baseline sent `textDocument/didChange` after `textDocument/hover`.
- Occupancy probe evidence: the baseline reported `{"configuredReadBound":1,"startedBeforeFirstReadSettled":2,"maximumActiveReads":2}` and exited 1. The probe release loop was updated to drain a replacement that starts after the first read settles. The after-fix command reported `{"configuredReadBound":1,"startedBeforeFirstReadSettled":1,"maximumActiveReads":1}` and exited 0.
- Focused green evidence: this command passed with 11 test files and 105 tests:

  ```bash
  ./node_modules/.bin/vitest run packages/supi-lsp/__tests__/unit/diagnostic-sync.test.ts packages/supi-lsp/__tests__/unit/client-diagnostic-freshness.test.ts packages/supi-lsp/__tests__/unit/client-diagnostic-request.test.ts packages/supi-lsp/__tests__/unit/client-diagnostic-push-regression.test.ts packages/supi-lsp/__tests__/unit/client-refresh-reuse.test.ts packages/supi-lsp/__tests__/unit/client-refresh.test.ts packages/supi-lsp/__tests__/unit/client-refresh-request.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.barrier.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.semantic.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.typescript.test.ts packages/supi-code-intelligence/__tests__/integration/substrate/lsp/recovery-public-tool.integration.test.ts --testTimeout=30000
  ```

  Result: `Test Files 11 passed (11)` and `Tests 105 passed (105)`. The operator repeated this focused run after the final cleanup and confirmed the count. This includes 5 public-runtime barrier regressions and 54 diagnostic freshness/request tests after deterministic I/O coordination changes.
- Focused Biome evidence: `pnpm exec biome check` passed for all 16 changed TypeScript files with no remaining diagnostics.
- TypeScript evidence: this command passed with exit code 0 and no output:

  ```bash
  ./node_modules/.bin/tsc -b --pretty false packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
  ```

- Operator race red evidence: before the refresh correction, this command exited 1:

  ```bash
  pnpm exec jiti /tmp/supi-debug-issue407/refresh-consumer-cache-race.mjs
  ```

  Result: `initial.completed[]`, `during.completed[]`, and `after.completed[dependency-error]`. The exact consumer request reused confirmed clean evidence while the broad refresh was pending.
- Operator race green evidence: after the correction, the same command exited 0 with `initial.completed[]`, `during.completed[dependency-error]`, and `after.completed[dependency-error]`.
- Final native-diagnostic return-race red evidence: before the final evidence gate, this command exited 1 with `initial.completed[]`, `during.completed[]`, and `after.completed[refresh-generation-1]`:

  ```bash
  pnpm exec jiti /tmp/supi-debug-issue407/diagnostic-invalidation-return-race.mjs
  ```

- Final native-diagnostic return-race green evidence: after the correction, the same command exited 0 with `initial.completed[]`, `during.partial[]`, and `after.completed[refresh-generation-1]`. The partial result used the existing honest cached-data reason without extending the caller budget; the later request returned the new server diagnostics.
- Public-runtime return-race evidence: this command passed with 1 file and 2 tests. It holds the final `node:fs/promises` read and observes a controlled native server refresh for both cached and newly collected candidates. Both cases reject the old candidate and a later public-runtime request returns `refresh-generation-1` without document lifecycle traffic:

  ```bash
  pnpm exec vitest run packages/supi-lsp/__tests__/integration/workspace-runtime.integration.diagnostic-return-race.test.ts --testTimeout=30000 --reporter=verbose
  ```

  Result: `Test Files 1 passed (1)` and `Tests 2 passed (2)`.
- Race regression evidence: this command passed with 1 test file and 2 tests:

  ```bash
  pnpm exec vitest run packages/supi-lsp/__tests__/integration/workspace-runtime.integration.refresh-race.test.ts --reporter=verbose
  ```

  Result: `Test Files 1 passed (1)` and `Tests 2 passed (2)`. It covers clean-to-error and error-to-clean overlap through `WorkspaceLspRuntime`, and checks that the broad refresh still reports `confirmed: 2`.
- Final default-parallel unit evidence: this exact command passed with 152 files and 1348 tests. It ran in the default parallel mode; `--no-file-parallelism` was not used. The earlier 1347-pass run had one timing-test failure.

  ```bash
  pnpm exec vitest run packages/supi-lsp/__tests__/unit packages/supi-code-intelligence/__tests__/unit --reporter=dot
  ```

  Result: `Test Files 152 passed (152)` and `Tests 1348 passed (1348)`.
- New integration evidence: this command passed with 5 files and 20 tests:

  ```bash
  pnpm exec vitest run packages/supi-lsp/__tests__/integration/workspace-runtime.integration.barrier.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.semantic.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.typescript.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.refresh-race.test.ts packages/supi-code-intelligence/__tests__/integration/substrate/lsp/recovery-public-tool.integration.test.ts --testTimeout=30000 --reporter=verbose
  ```

  Result: `Test Files 5 passed (5)` and `Tests 20 passed (20)`.
- Follow-up 1 regression attribution: the overall baseline `b6bf5209` passed the unchanged direct-client TypeScript test in 385 ms. The work item 2 baseline `52315e0c` failed the same command after the 10-second inner wait, returning `completed[]` instead of the expected error. The retained logs are `/tmp/supi-debug-issue407/ts-attribution-original.log` and `/tmp/supi-debug-issue407/ts-attribution-current.log`. The failure was introduced by the follow-up 1 barrier interaction; it was not pre-existing.
- Follow-up 1 regression correction: the same command passed after the disk-observation correction. The corrected run is retained at `/tmp/supi-debug-issue407/ts-attribution-corrected.log`; it reports the selected test passed in 424 ms. The full TypeScript diagnostic integration file also passed unchanged: all 3 tests passed. The correction stores the fingerprint of the verified disk read, while explicit `didChange` content stays in the open document and does not replace that observation.
- Review correction evidence: controlled filesystem mocks preserve actual module exports and override only `readFile`; the `ClientDiagnostics` setup now uses one private synchronization helper; and non-authoritative tracked diagnostic input waits for the verified barrier read. The public-runtime regressions are `packages/supi-lsp/__tests__/integration/workspace-runtime.integration.barrier.test.ts` — it expects one `didChange` carrying only the verified `consumer-v3` text — and `packages/supi-lsp/__tests__/integration/workspace-runtime.integration.failed-refresh-recovery.test.ts`.
- Occupancy green evidence: `pnpm exec jiti /tmp/supi-debug-issue407/input-barrier-occupancy.mjs` reported `{"configuredReadBound":1,"startedBeforeFirstReadSettled":1,"maximumActiveReads":1}` and exited 0.
- Source and test typecheck evidence: this command exited 0 with no output:

  ```bash
  pnpm exec tsc -b --pretty false packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
  ```
- Focused Biome evidence: this check passed for all changed or new TypeScript files and the controlled fixture, and `git diff --check` passed:

  ```bash
  files=$( { git diff --name-only HEAD -- '*.ts'; git ls-files --others --exclude-standard -- '*.ts'; } | sort -u ); pnpm exec biome check $files && pnpm exec biome check packages/supi-lsp/__tests__/fixtures/lsp-diagnostic-refresh-server.mjs && git diff --check
  ```

  Result: `Checked 11 files` and `Checked 1 file`, with no diagnostics.
- Final affected and new-test evidence: this command passed with 17 files and 131 tests:

  ```bash
  pnpm exec vitest run packages/supi-lsp/__tests__/unit/client-diagnostic-freshness.test.ts packages/supi-lsp/__tests__/unit/client-diagnostic-push-regression.test.ts packages/supi-lsp/__tests__/unit/client-diagnostic-request.test.ts packages/supi-lsp/__tests__/unit/client-pull-diagnostics.test.ts packages/supi-lsp/__tests__/unit/client-refresh.test.ts packages/supi-lsp/__tests__/unit/client-refresh-request.test.ts packages/supi-lsp/__tests__/unit/diagnostic-sync.test.ts packages/supi-lsp/__tests__/integration/client.integration.refresh-reuse.test.ts packages/supi-lsp/__tests__/integration/client.integration.python-refresh.test.ts packages/supi-lsp/__tests__/integration/client.integration.typescript-diagnostics.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.barrier.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.semantic.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.typescript.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.refresh-race.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.server-refresh.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.diagnostic-return-race.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.failed-refresh-recovery.test.ts --testTimeout=60000 --reporter=dot
  ```

  Result: `Test Files 17 passed (17)` and `Tests 131 passed (131)`. This includes the controlled server, real Pyright idle-loop, native TypeScript lifecycle, shared-barrier, failed-read recovery, cancellation, and cross-file race regressions.
- Controlled server evidence: `pnpm exec vitest run packages/supi-lsp/__tests__/integration/workspace-runtime.integration.server-refresh.test.ts packages/supi-lsp/__tests__/unit/client-refresh-request.test.ts --testTimeout=60000 --reporter=verbose` passed with 2 files and 8 tests. It observed fresh native diagnostics after a refresh with no document lifecycle notification, and two serialized diagnostic pulls for a burst of three refresh requests.
- Real Pyright evidence: `pnpm exec jiti /tmp/supi-debug-issue407/refresh-idle-baseline.mjs` reported one `textDocument/didOpen`, no idle `textDocument/didChange`/`didClose`, one `textDocument/diagnostic` request, `status: "running"`, and `hasProvider: true`. The earlier unfixed run reported repeated source changes and diagnostic pulls.
- Timing and affected-integration evidence: this command passed with 9 files and 76 tests. It includes the deterministic waiter-release timing test, the unchanged TypeScript diagnostic integration file, preserved-mtime and explicit-content barrier cases, the controlled native refresh races, and Pyright refresh coverage:

  ```bash
  pnpm exec vitest run packages/supi-lsp/__tests__/unit/client-diagnostic-timing.test.ts packages/supi-lsp/__tests__/unit/client-diagnostic-freshness.test.ts packages/supi-lsp/__tests__/unit/client-diagnostic-request.test.ts packages/supi-lsp/__tests__/unit/client-refresh-request.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.diagnostic-return-race.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.server-refresh.test.ts packages/supi-lsp/__tests__/integration/client.integration.python-refresh.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.barrier.test.ts packages/supi-lsp/__tests__/integration/client.integration.typescript-diagnostics.test.ts --testTimeout=60000 --reporter=dot
  ```

  Result: `Test Files 9 passed (9)` and `Tests 76 passed (76)`.
- Operator evidence: `pnpm exec jiti /tmp/supi-debug-issue407/refresh-consumer-cache-race.mjs` returned `initial.completed[]`, changed dependent diagnostics during refresh, and the same changed diagnostics after refresh. `pnpm exec jiti /tmp/supi-debug-issue407/diagnostic-invalidation-return-race.mjs` returned the partial stale-candidate result above. `pnpm exec jiti /tmp/supi-debug-issue407/input-barrier-occupancy.mjs` reported `{"configuredReadBound":1,"startedBeforeFirstReadSettled":1,"maximumActiveReads":1}`. All three probes exited 0.
- Full `packages/supi-lsp/__tests__/integration` evidence remains pending. The Kotlin integration test has not been rerun; a prior run timed out, and its test and assertion were not skipped or weakened. Full workspace verification and parent live Pi verification remain pending.
- Full verification: not run, as requested. Kotlin rerun: not run. Parent live Pi verification: not run. Reload the extension before live verification.
