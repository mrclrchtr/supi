# Issue 407 follow-ups

**Status:** Work item 1 implemented; refresh race correction and broader focused checks passed; full `pnpm verify` and live Pi verification pending
**Baseline:** `b6bf5209`
**Scope:** Input freshness only for this implementation slice

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
- Native server-requested diagnostic refresh remains in a later slice. Its forced resynchronization policy stays separate; it shares only the actual-content-change invalidation callback because every path that applies changed text must advance the same input and evidence revision.

## Work items

| ID | Work item | Status |
| --- | --- | --- |
| 1 | Shared Semantic input barrier for semantic evidence freshness | Implemented and verified in this slice |
| 2 | Native server-requested diagnostic refresh without pretending source text changed | Later; pending |
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

- Native server-requested diagnostic refresh must collect fresh evidence without claiming that source text changed.
- Keep `tsconfig`/`jsconfig` filtering for TypeScript/JavaScript-family files only.
- Retain automatic path exclusions and other diagnostic suppressions.
- Omit irrelevant Tsconfig labels for other languages.
- Retain broad maintenance if required and label its scope separately from result coverage.
- Do not claim that root-cause or baseline attribution for all live failures is proved.

## Verification record

- Implementation evidence: `ClientDiagnostics` uses one bounded asynchronous full-content read barrier for semantic and exact diagnostic requests. `LspClient` checks the barrier before and after semantic requests. Ordinary refresh reports detected content changes through the same input and evidence revision, updates the barrier content baseline, and does not resend unchanged text.
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
- Race regression evidence: this command passed with 1 test file and 2 tests:

  ```bash
  pnpm exec vitest run packages/supi-lsp/__tests__/integration/workspace-runtime.integration.refresh-race.test.ts --reporter=verbose
  ```

  Result: `Test Files 1 passed (1)` and `Tests 2 passed (2)`. It covers clean-to-error and error-to-clean overlap through `WorkspaceLspRuntime`, and checks that the broad refresh still reports `confirmed: 2`.
- Broader unit evidence: this exact operator command passed with 152 files and 1347 tests:

  ```bash
  pnpm exec vitest run packages/supi-lsp/__tests__/unit packages/supi-code-intelligence/__tests__/unit --reporter=dot
  ```

  Result: `Test Files 152 passed (152)` and `Tests 1347 passed (1347)`.
- New integration evidence: this command passed with 5 files and 20 tests:

  ```bash
  pnpm exec vitest run packages/supi-lsp/__tests__/integration/workspace-runtime.integration.barrier.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.semantic.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.typescript.test.ts packages/supi-lsp/__tests__/integration/workspace-runtime.integration.refresh-race.test.ts packages/supi-code-intelligence/__tests__/integration/substrate/lsp/recovery-public-tool.integration.test.ts --testTimeout=30000 --reporter=verbose
  ```

  Result: `Test Files 5 passed (5)` and `Tests 19 passed (19)`.
- Review correction evidence: the four `node:fs/promises` test seams preserve actual module exports and override only `readFile`; the `ClientDiagnostics` setup now uses one private synchronization helper; and non-authoritative tracked diagnostic input waits for the verified barrier read. The public-runtime regression is `packages/supi-lsp/__tests__/integration/workspace-runtime.integration.barrier.test.ts` — it expects one `didChange` carrying only the verified `consumer-v3` text.
- Occupancy green evidence: `pnpm exec jiti /tmp/supi-debug-issue407/input-barrier-occupancy.mjs` reported `{"configuredReadBound":1,"startedBeforeFirstReadSettled":1,"maximumActiveReads":1}` and exited 0.
- Source and test typecheck evidence: this command exited 0 with no output:

  ```bash
  pnpm exec tsc -b --pretty false packages/supi-lsp/tsconfig.json packages/supi-lsp/__tests__/tsconfig.json packages/supi-code-intelligence/tsconfig.json packages/supi-code-intelligence/__tests__/tsconfig.json
  ```
- Focused Biome evidence: this check passed for 19 changed or new TypeScript files, and `git diff --check` passed:

  ```bash
  files=$( { git diff --name-only -- '*.ts'; git ls-files --others --exclude-standard -- '*.ts'; } | sort -u ); pnpm exec biome check $files
  ```

  Result: `Checked 19 files` with no diagnostics.
- Full verification: not run, as requested. Live Pi verification: not run. Reload the extension before live verification.
