# Issue 407 follow-ups

**Status:** The current first-access and source-label corrections are implemented. Full workspace checks retain only the known Kotlin failure; all 21 package checks passed. Parent live verification of these corrections remains pending after reload.
**Overall baseline:** `b6bf5209`
**Work item 2 baseline:** `52315e0c`
**Work item 3 baseline:** `eeafdcbe`
**Work item 4 baseline:** `0112cf38`
**Scope:** Input freshness, server-requested diagnostic refresh, mixed-language diagnostic filtering, and maintenance/result scope labels for this implementation slice

## Current fix 1: concurrent first access

**Baseline:** `e57f0808`
**Status:** Implemented. Automated verification is recorded below. Parent live verification remains pending after reload.

- The private semantic-input barrier now reports a typed cause for a superseded pass and records document enrollment separately from content changes, close, read failure, and lifecycle changes. Retry eligibility is monotonic: after any non-enrollment cause, a later enrollment cannot make the pass retryable.
- `ClientDiagnostics` can rejoin one superseded pass after a new document enrollment. It uses the original request control and deadline. It does not retry other failures, a closed or unreadable document, a stopped client, or an exhausted retry bound.
- The shared owner still drains its readers before replacement. Evidence is checked again before a result is completed. No manager or client state is exposed through the public runtime.
- The public-runtime first-access regressions have 7 tests across two files. They cover concurrent first access, continued enrollment, close, content-then-enrollment, enrollment-then-content, cancellation during enrollment rejoin, and deadline during enrollment rejoin.
- The registered public `code_health` regression has 2 parameterized tests. They cover explicit `refresh: true` and passive exact-file requests. Both concurrent calls return completed diagnostic observations with `1 requested, 1 confirmed, 0 unconfirmed, 0 failed, 0 removed`.
- No dependency or GitHub changes are part of this correction.

### Fix 1 retained evidence

- Baseline red evidence at `e57f0808`: the public-runtime first-access test and the registered `code_health` test both failed because one concurrent exact-file result was unavailable with the synchronization-change reason. The exact earlier logs are `/tmp/supi-debug-issue407/first-access-regression-red-1.log`, `/tmp/supi-debug-issue407/first-access-regression-red-2.log`, and `/tmp/supi-debug-issue407/first-access-operator-red.log`.
- Earlier fix1 focused logs are retained at `/tmp/supi-debug-issue407/fix1-focused-regressions.log`, `/tmp/supi-debug-issue407/fix1-adjacent-public-runtime.log`, `/tmp/supi-debug-issue407/fix1-lsp-code-intelligence-units.log`, `/tmp/supi-debug-issue407/fix1-source-test-typecheck.log`, and `/tmp/supi-debug-issue407/fix1-biome-diff-check.log`. Their counts predate this cleanup and are not current evidence.
- The red safety regression is retained at `/tmp/supi-debug-issue407/fix1-supersession-red.log`. With monotonic cause handling temporarily removed, `does not rejoin after content invalidation followed by enrollment` returned `completed` instead of `unavailable`; the production fix restores the expected fail-closed result.
- Earlier probe logs are retained at `/tmp/supi-debug-issue407/fix1-operator-input-barrier-occupancy.log`, `/tmp/supi-debug-issue407/fix1-operator-refresh-consumer-cache-race.log`, and `/tmp/supi-debug-issue407/fix1-operator-diagnostic-invalidation-return-race.log`. The current probe result is recorded below.
- The final operator run below supersedes the focused verification counts. The parent live first-access and `code_health` checks require an extension reload.
- Deferred: the push-only maintenance optimization for unchanged inputs with no expected publication remains out of scope. Keep the current budget and the no-false-confirmation rule.

## Current fix 3: truthful automatic source-tracking counts

**Baseline:** `e57f0808`
**Status:** Implemented. The earlier live Pi pass at `e57f0808` did not load this correction. Automated verification is recorded below; parent live verification remains pending after reload.

- Renamed the automatic bulk-tracking result and report bucket from `unsupported` to `skipped`. This is a breaking result-field rename with no legacy alias. The existing `missing` and `not-automatic-source` reasons, route checks, filters, and queue behavior remain unchanged.
- `skipped` covers policy-excluded, unsupported automatic-route, missing, and no-longer-regular candidates. It does not claim that an explicit request cannot serve the file. Unavailable paths remain queued; skipped paths are removed.
- Markdown and TUI source-tracking counts now use `skipped`. Markdown current and failed attempts use one standalone `Source discovery` label; previous/retained and compact/expanded views keep one label in their own projection.
- The registered public `code_health` regression uses a real `WorkspaceLspRuntime` and a controlled server. It confirms an exact diagnostic for a JavaScript file excluded by tsconfig, then reports `1` skipped, no `unsupported` field, and no JavaScript diagnostic entry in the automatic directory snapshot.

### Fix 3 retained evidence

- Earlier fix3 focused logs are retained at `/tmp/supi-debug-issue407/fix3-focused-regressions.log`, `/tmp/supi-debug-issue407/fix3-lsp-code-intelligence-units.log`, `/tmp/supi-debug-issue407/fix3-lsp-code-intelligence-units-first-run.log`, `/tmp/supi-debug-issue407/fix3-client-diagnostic-scale-retry.log`, `/tmp/supi-debug-issue407/fix3-source-test-typecheck.log`, and `/tmp/supi-debug-issue407/fix3-biome.log`. Their counts predate this cleanup and are not current evidence.
- The final operator run below supersedes the focused verification counts. Reload before the new source-label live check.

## Current operator verification

- `pnpm verify:ai` passed WASM, lint, source/test typecheck, and skill checks. Vitest reported 405 files passed and 1 failed; 3,407 tests passed, 2 skipped, and 1 failed. There were no unhandled errors.
- The only failure was the unchanged Kotlin diagnostic test: 240,000 ms elapsed with empty diagnostics for `Main.kt`. Neither its assertion nor its timeout was changed. Full verification is not green.
- `pnpm pack:verify` ran separately because the failed test stage stops the combined command. All 21 packages passed.
- Logs: `/tmp/supi-debug-issue407/fixes-1-3-operator-verify.log` and `/tmp/supi-debug-issue407/fixes-1-3-operator-pack.log`.
- The old live pass at `e57f0808` is recorded in `/tmp/supi-debug-issue407/live-follow-ups-verification.md`. Current corrections still require reload and a new parent live check.
- The push-only maintenance wait remains unchanged, as requested.

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
- Keep diagnostic evidence and result scope equal to the caller's scope; label any broader maintenance operation scope separately.
- Share pending synchronization between concurrent requests.
- Known input changes during an operation must not allow stale semantic or diagnostic results to return as completed/current.
- Failed reads, deletion, changed lifecycle, cancellation, and deadline exhaustion fail closed with existing typed partial/unavailable semantics.
- Keep owned diagnostic transport settlement and bounded scheduling intact.

## Implementation choices for this slice

- Ordinary diagnostic refresh keeps its own read, classification, and budget path. It does not run a second input-barrier preflight, so unchanged text is not resent.
- Server-requested refresh uses diagnostic-only invalidation. It keeps the semantic input generation and unchanged open-document synchronization, then collects applicable native pull or TypeScript request evidence. A real disk change uses normal synchronization.
- Server refresh demand shares one active pass and one newer generation. A newer generation invalidates the active evidence, but the owned diagnostic transport remains active until settlement before queued work can start.
- Health output labels the maintenance operation scope and maintenance evidence separately from the diagnostic result scope and coverage. Broad workspace-runtime maintenance remains allowed for active routes and tracked documents; it is not a whole-filesystem scan or a whole-workspace proof.

## Work items

| ID | Work item | Status |
| --- | --- | --- |
| 1 | Shared Semantic input barrier for semantic evidence freshness | Implemented; current operator verification pending |
| 2 | Native server-requested diagnostic refresh without pretending source text changed | Implemented; current operator verification pending |
| 3 | Mixed-language diagnostic filtering | Implemented; current operator verification pending |
| 4 | Scope labels that separate maintenance scope from result coverage | Implemented; current operator verification pending |

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

- Retain broad maintenance if required and label its scope separately from result coverage.
- Do not claim that root-cause or baseline attribution for all live failures is proved.
- Item 4 is implemented in this slice; keep its labels tied to typed operation scope and diagnostic result scope.

## Verification record

The records below are retained historical evidence from earlier working-tree states. Their test counts are not current evidence. The current focused results are in [Current focused checks](#current-focused-checks).

- Original e57f0808 live verification happened and is recorded in `/tmp/supi-debug-issue407/live-follow-ups-verification.md`. It predates the current working-tree fixes and cleanup.
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

  Result: `Test Files 11 passed (11)` and `Tests 105 passed (105)`. This is historical evidence from the retained log and is not a current count.
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
- Item 2 checkpoint: full LSP integration, workspace, and parent live Pi verification had not yet run. The prior Kotlin timeout remained unresolved; its test and assertion were unchanged. See the final verification result below.
- Follow-up 3 implementation: `isFileExcludedByTsconfig` now bypasses tsconfig/jsconfig filtering for non-TypeScript/JavaScript-family files. Single-file health omits the Tsconfig coverage label for those files, while automatic path exclusions, explicit-file routing, configured suppression, and JS `allowJs`/`checkJs` handling remain unchanged. Recovery scope telemetry counts only automatic-scope TypeScript/JavaScript-family files.
- Follow-up 3 public regression: `packages/supi-code-intelligence/__tests__/integration/substrate/lsp/mixed-language-public-tool.integration.test.ts` uses the public `WorkspaceLspRuntime` and `code_health` tool with a controlled native LSP server. A directory refresh under `src/tsconfig.json` (`include: ["*.ts"]`) returns the Python diagnostic with `3 requested, 3 confirmed` tracked-file evidence; an exact Python health request returns the same diagnostic without a `Tsconfig` label.
- Follow-up 3 focused evidence: the mixed-language/config/output tests and both public code-intelligence LSP integration tests passed with 6 files and 71 tests. Focused Biome passed for 13 TypeScript files and 1 controlled fixture file, `git diff --check` passed, and the focused LSP and code-intelligence source/test typecheck passed with no output.
- Follow-up 3 final default-parallel unit evidence: this command passed with 152 files and 1361 tests; `--no-file-parallelism` was not used:

  ```bash
  pnpm exec vitest run packages/supi-lsp/__tests__/unit packages/supi-code-intelligence/__tests__/unit --reporter=dot
  ```

- Follow-up 4 implementation: `code_health` now reports typed maintenance operation scope, maintenance evidence, diagnostic result scope, and diagnostic coverage as separate fields. Markdown and expanded TUI output use the same boundaries; passive calls do not claim a maintenance attempt; server-only calls show inventory scope without fabricating diagnostic result scope.
- Follow-up 4 public regression: `packages/supi-code-intelligence/__tests__/integration/substrate/lsp/mixed-language-public-tool.integration.test.ts` uses the public `code_health` tool and public `WorkspaceLspRuntime`. It verifies one broad workspace-runtime maintenance pass over 3 tracked files, a directory result over 2 files, a passive directory result without maintenance claims, an exact-file result, and server-only inventory output.
- Follow-up 4 focused evidence: the health/tool/render tests passed with 8 files and 107 tests; both public LSP tool integration files passed with 2 files and 3 tests; the default-parallel LSP and code-intelligence unit command passed with 152 files and 1361 tests. Source and test typechecks passed with no output. Biome passed for 10 changed TypeScript/fixture files and `git diff --check` passed.
- Barrier test failure attribution: three default-config runs of `workspace-runtime.integration.barrier.test.ts` failed in `keeps a longer-deadline caller on the shared slow read` after 2,000 ms. Before fake timers, the public `getProjectServers()` result was `[{"name":"fixture","status":"running","ready":false}]` after both controller start and `trackFile()`. `trackFile()` opens the file but does not wait for concrete readiness. The first semantic call therefore stayed in the public runtime's readiness path, so `reads.waitForCalls(1)` never completed and fake time never reached the 10 ms caller deadline. The old unawaited `expect(first).rejects` then observed `{ kind: "unavailable" }` during cleanup and raised one unhandled assertion. The public readiness probe measured 35.2 ms for start and 0.6 ms for tracking with the default fixture, so the 2,000 ms budget was not the cause.
- Controlled readiness red evidence: a temporary copy retained the old ordering and used the fixture's controlled `--readiness-delay=100` event. The default-config command failed with `1` failed and `5` passed tests at the same 2,000 ms timeout. This reproduces the failure without CPU load.
- Barrier harness fix: the fixture now accepts `--readiness-delay=<ms>`, and the failing test uses a 100 ms delay. It first awaits the public `waitUntilReadyForFile()` operation, using real asynchronous file reads for that operation's documented warm-up, then installs the controlled reader before fake timers. The controlled public readiness probe returned `startMs: 33.5`, `trackMs: 0.6`, `readinessMs: 113.4`, and `readiness.kind: "ready"`; its public server status was `ready: false` after start and tracking. The test keeps the 10 ms and 10,000 ms caller deadlines and the active-read and maximum-overlap assertions. It captures both operation outcomes with rejection handlers and awaits them, so cleanup cannot create an unhandled assertion. The passing path resolves the controlled reads and awaits the owned second operation before controller shutdown; no production code or caller budget changed.
- Barrier post-fix evidence: three default-config runs with no `--testTimeout` override each passed with `1` file and `6` tests. A repeat with the controlled readiness delay changed from 100 ms to 250 ms also passed with `1` file and `6` tests. The full barrier-file command passed with `1` file and `6` tests. The adjacent public runtime/Pi command passed with `4` files and `14` tests; the relevant unit command passed with `8` files and `126` tests. Source and test typechecks passed with no output. Biome passed for 12 changed TypeScript/fixture files, and `git diff --check` passed.
- Operator probes after the fix all exited 0: `refresh-consumer-cache-race.mjs` returned completed changed diagnostics during and after refresh; `diagnostic-invalidation-return-race.mjs` returned the expected partial current-generation result during refresh and completed fresh diagnostics after refresh; `input-barrier-occupancy.mjs` reported `{"configuredReadBound":1,"startedBeforeFirstReadSettled":1,"maximumActiveReads":1}`.

## Current focused checks

- Changed and adjacent public-runtime and Pi integration tests passed: `Test Files 13 passed (13)` and `Tests 39 passed (39)`. The run used the default config with no `testTimeout` override. Log: `/tmp/supi-debug-issue407/advisory-cleanup-public-integrations.log`.
- The registered public `code_health` first-access test has 2 cases: explicit `refresh: true` and passive exact-file access. Both cases preserve cold documents, controlled enrollment timing, and confirmed evidence. Log: `/tmp/supi-debug-issue407/advisory-cleanup-first-access-public.log`.
- LSP and code-intelligence unit tests passed: `Test Files 152 passed (152)` and `Tests 1361 passed (1361)`. The run used default parallelism and did not use `--no-file-parallelism`. Log: `/tmp/supi-debug-issue407/advisory-cleanup-lsp-code-intelligence-units.log`.
- Source and test typechecks passed with exit code 0. Log: `/tmp/supi-debug-issue407/advisory-cleanup-source-test-typecheck.log`.
- Biome checked 28 changed or new TypeScript and fixture files with no diagnostics. Log: `/tmp/supi-debug-issue407/advisory-cleanup-biome.log`.
- `git diff --check` passed. Log: `/tmp/supi-debug-issue407/advisory-cleanup-diff-check.log`.
- All three existing race and ownership probes passed. Log: `/tmp/supi-debug-issue407/advisory-cleanup-operator-probes.log`.
- The operator subsequently ran full verification and packaging. See the current operator verification section; only the parent live check remains pending.

## Earlier workspace verification (historical)

- `/tmp/supi-debug-issue407/follow-ups-verify-final.log` retains an earlier full verification with the unchanged Kotlin timeout. It predates the current working-tree fixes and cleanup.
- `/tmp/supi-debug-issue407/follow-ups-pack-final.log` retains the earlier package verification at `e57f0808`.
- Parent live Pi verification of the current fixes remains pending. Reload the extension before repeating the cross-file, idle-refresh, mixed-language, and scope-label cases.
