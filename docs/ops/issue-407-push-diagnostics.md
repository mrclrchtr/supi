# Issue 407: TypeScript diagnostics and request-based confirmation

## Question and result

- Issue: [#407](https://github.com/mrclrchtr/supi/issues/407).
- Investigation date: 2026-09-13.
- Repository revision: `2588896e45816b0586ac40d880a1369e334d9ded`.
- Environment: `typescript-language-server` 6.0.0, TypeScript 6.0.3, Node.js 24.20.0, macOS ARM64.
- **Historical investigation scope:** The measurements below were collected before the issue 407 implementation. No diagnostic policy or runtime code changed during that investigation. This statement describes that phase, not the current repository state.

**Historical root cause: the client required a second publication that the server did not guarantee.** The server combines diagnostic phases into one publication and suppresses repeated empty phases. A longer wait cannot correct this rule. Standard pull diagnostics were not available on this server version. A separate synchronization error let a close-clear publication count toward the next open synchronization. [S1, S2, S3]

**Historical recommendation:** Use explicit TypeScript diagnostic requests for confirmation. Keep ambient push results as observations. Do not infer semantic completion from publication count, an empty result, or a quiet interval. Keep the current time limits until representative measurements support a change.

## Implementation status

This section records the current implementation. The measurements and recommendation above are the historical investigation baseline. See [ADR 0022](../adr/0022-request-confirmed-lsp-agnostic-diagnostics.md) for the current diagnostic policy.

### Current implementation

- The shared engine selects native document pull, then an eligible TypeScript request adapter, then ambient push observation. Native pull needs a valid static or dynamic provider for the file.
- The TypeScript adapter was verified with `typescript-language-server` 6.0.0 and TypeScript 6.0.3. It uses the running tsserver through `workspace/executeCommand` and `typescript.tsserverRequest`, and collects syntax, semantic, and suggestion phases in order. It applies one complete, validated, normalized report only when the document synchronization and evidence revision are still current.
- A request result is file-scoped. It does not prove all files in a TypeScript program, a workspace, or another language. Ambient push is observation or tentative evidence only. Non-empty push data can be partial; an empty push cannot confirm clean. A version, publication count, quiet interval, or later republish is not a completion proof.
- One client route has one active request and at most 32 pending jobs. Duplicate requests share work. The result wait and the owned transport lifetime are separate: caller cancellation or deadline ends only that caller's wait; supersession drops queued jobs and stops future adapter phases but does not cancel an active protocol request. The route is not reused until actual settlement or connection disposal. The owner timeout attempts protocol cancellation but does not prove that the backend stopped. The owner bound is at least 30 seconds (or a larger collection budget).
- Refreshes use shared freshness checks and return exact `requested`, `confirmed`, `unconfirmed`, `failed`, and `removed` coverage. Ordinary refreshes retain unchanged documents, resynchronize changed or invalidated documents, and do not reopen a document to obtain diagnostic confirmation. A server-requested refresh invalidates diagnostic evidence without changing the semantic input generation, then uses the applicable native pull or TypeScript request adapter. It sends no no-op document synchronization; push-only routes remain partial or unconfirmed. Overlapping server refresh demand uses one active pass and one newer pending demand, and active diagnostic transport stays owned until settlement. Diagnostic timing records the request source; publication counts remain observation telemetry.

### Test evidence

The implementation test set includes `unit/client-diagnostic-request.test.ts`, `unit/client-diagnostic-scheduler.test.ts`, `unit/client-diagnostic-typescript.test.ts`, `unit/client-diagnostic-scale.test.ts`, `unit/client-diagnostic-push-regression.test.ts`, and `integration/client.integration.typescript-diagnostics.test.ts`. These tests cover request source selection, phase conversion, response validation, request sharing and settlement, push-only observations, bounded large-workspace collection, and TypeScript lifecycle and refresh behavior.

Final operator checks:

- `pnpm verify:ai`: WASM, lint, typecheck, and skill checks passed. Tests: 3,353 passed, 2 skipped, and 1 failed.
- The failed test is the installed Kotlin diagnostic type-error integration test, which receives an empty diagnostic list. The implementation agent reproduced the same failure on an isolated clean HEAD. Full verification therefore remains unsuccessful.
- `pnpm pack:verify`: all 21 packages passed.
- The original TypeScript reproduction now passes: 1 requested, 1 confirmed, and no push publication needed.
- Standards and Spec reviews found no blocking issues. All confirmed findings were corrected, and focused checks were repeated after the last corrections.
- Live Pi verification passed after `/reload`: the exact issue file returned 1 requested and 1 confirmed. Timing showed a TypeScript request at 31.3 ms, then confirmed cache reuse at 0.1 ms. A directory-scoped refresh also returned 1 requested and 1 confirmed with 0 restarts. This remains tracked-file evidence, not proof that all workspace files are clean.

### Remaining limitations

- The TypeScript request adapter is verified only for the supported TypeScript route and its advertised custom command. No custom request adapter was added for another server. Existing integration tests still exercise other available servers.
- Generic push-only routes have no request-confirmed clean result. The sync-moment gate rejects some stale unversioned messages, but it does not confirm completion.
- An owned custom diagnostic request may continue after its caller stops waiting. The local scheduler bounds and serializes this work, but caller cancellation does not prove that the server stopped computing.
- The measurements use small projects and synthetic scale cases. They do not establish production latency percentiles for complex large workspaces.

## Historical measured behavior

### Method

Temporary probes used the real `LspClient` and the installed server. Each small project had `strict: true`, `noEmit: true`, an ES2022 target, and an ESNext module setting. The probes set the TypeScript server path explicitly. Cold-open runs used separate projects and server processes.

Recorded fields: ordered synchronization and publication methods, relative times, fixture file names, versions, diagnostic counts, request result shapes, and existing `diagnostics.timing` / `diagnostics.publication` summaries. No source text or diagnostic messages were captured in the traces.

Commands used during the investigation:

```bash
pnpm exec jiti /tmp/issue407-repro.mjs
WAIT_MS=10000 pnpm exec jiti /tmp/issue407-repro.mjs
pnpm exec jiti /tmp/issue407-matrix.mjs
pnpm exec jiti /tmp/issue407-scale.mjs
pnpm exec jiti /tmp/issue407-deterministic.mjs
```

These were temporary investigation probes, not repository test files. The probes and measurements are retained locally under `/tmp/supi-debug-issue407/`; use that directory prefix to repeat a command from the repository root. The first command asserted `confirmed === 1` and failed with `0 !== 1`. The extended-wait run and final 3 s rerun failed with the same result. This assertion identifies the reported symptom; it does not justify confirming the first push.

### Publication results

All observed TypeScript publications omitted `version`.

| Scenario | Samples | Publications | Client result |
| --- | ---: | --- | --- |
| Cold open, clean file | 5 | One empty publication per run | Unconfirmed after 3 s |
| Cold open, one type error | 5 | One non-empty publication per run | Unconfirmed after 3 s |
| Separate clean-file probe | 1 | One empty publication at 365 ms; no second publication within 10 s | Unconfirmed after 10 s |
| Refresh unchanged tracked file | 1 | None; no document-sync traffic | Unconfirmed after 3 s |
| Change clean file to different clean content | 1 | None | Unconfirmed after 3 s |
| Change clean file to a type error | 1 | One non-empty publication at 370 ms | Unconfirmed after 3 s |
| Correct that error | 1 | One empty publication at 369 ms | Unconfirmed after 3 s |
| Watched-file invalidation, then refresh | 1 | No publication after resync; close-clear plus open publication after fallback | Confirmed at 3,561 ms |
| Explicit close and reopen | 1 | Close-clear at 2.4 ms; open publication at 356 ms | Confirmed at 558 ms |
| Open two files with an import dependency | 1 | One empty publication per file | Both unconfirmed after 3 s |
| Change dependency to an incompatible type | 1 | One error publication for the unchanged dependent; none for the changed dependency | Dependent confirmed; dependency unconfirmed |

For the ten cold-open runs, first-publication latency was 358.9–477.6 ms. Nearest-rank sample p50 was 365.2 ms; sample p95 and p99 were both 477.6 ms. Ten small-project runs are not a production latency distribution. There is no measured second-publication percentile: none of these runs had a second publication within the observation window.

The dependent-file result is not evidence of completion either. Its old empty publication and later error publication shared the unchanged document synchronization, so the old counter reached two.

### Explicit request results

The server advertised `typescript.tsserverRequest` in `executeCommandProvider.commands`. A direct `textDocument/diagnostic` probe returned `-32601` (method not found). No standard diagnostic provider became available.

The following command worked through `workspace/executeCommand`: [S4, S5]

```json
{
  "command": "typescript.tsserverRequest",
  "arguments": [
    "semanticDiagnosticsSync",
    { "file": "file:///project/main.ts", "includeLinePosition": true },
    {
      "executionTarget": 0,
      "expectsResult": true,
      "isAsync": false,
      "lowPriority": true
    }
  ]
}
```

The probes requested `syntacticDiagnosticsSync`, `semanticDiagnosticsSync`, and `suggestionDiagnosticsSync` in sequence. They checked successful response envelopes and array bodies, not push counts.

| Request scope | Result | Total request time |
| --- | --- | ---: |
| Warm small-project clean file | All three arrays empty | 4.0 ms |
| Same file with one type error | Semantic array contained one error | 7.3 ms |
| Same file after correction | All three arrays empty | 4.4 ms |
| Dependent file after dependency change | Semantic request found the error | 2.0 ms |
| Cold real repository, issue file `packages/supi-code-intelligence/src/tool/code_health/spec.ts` | All three arrays empty | 2,125.2 ms |
| Synthetic 1,000-file import chain, all files open | Target requests found one semantic error and one suggestion | 762.3 ms |
| Subsequent sequential three-request collection for all 1,000 synthetic files | 1,000 files completed within a 3 s batch budget | 585.9 ms |

The real-repository probe opened only the exact issue file. The synthetic probe opened 1,000 files once. Neither sent `didChange` or `didClose` during collection. These results show that explicit collection is feasible. They do not establish worst-case performance for 1,000 complex repository files.

An asynchronous `geterr` request also completed, but returned no diagnostic array and caused no new clean publication. It is not a drop-in confirmation mechanism: the command completion does not identify which debounced LSP publication belongs to that request. TypeScript can also stop an asynchronous check after a document change. [S6, S7]

## Source explanation

### One publication is normal

`FileDiagnostics` stores syntax, semantic, and suggestion diagnostics separately. Every accepted update schedules a publication through a 50 ms debounce. Updates close together become one combined publication. An update from an empty array to another empty array is ignored for that diagnostic kind. Thus: [S1]

- A new clean or erroneous file can produce one combined publication.
- A clean-to-clean change can produce no publication.
- Separated phase updates can produce more than one publication.
- A second publication is not an explicit final-result marker.

The server's test helper waits for three diagnostic kinds. That helper is not a public protocol request. SuPi cannot use it through LSP. [S1]

LSP defines publications as replacement diagnostic sets. `version` is optional. It defines neither a minimum publication count nor a final-phase flag for this notification. [S2]

### The initial synchronization was accepted; the historical reopen identity was unsafe

For the minimal open, telemetry recorded synchronization `1`, `publications: 1`, and `confirmed: false`. The first publication was accepted. No later publication was lost to a client identity check in that trace.

However, the historical reopen path sent `didClose`, changed the local synchronization, and sent `didOpen` without waiting for the server. The server published an empty set when it handled the close. That notification could arrive after SuPi had installed the new open state. SuPi stamped the unversioned close-clear with the new synchronization and counted it as publication one. [S1, S3]

The receive-time check only establishes when the client received a notification. It cannot identify the computation or lifecycle operation that caused it. Receiving two publications therefore does not fix unversioned identity attribution.

A deterministic probe used the installed server's `FileDiagnostics` implementation with a controlled debounce scheduler and the historical `applyPushDiagnostics()` behavior:

1. Three empty diagnostic-phase updates produced one publication.
2. Repeating those empty updates produced no publication.
3. An old close-clear followed by a new syntax-only empty publication produced `publications: 2` in SuPi before any semantic result.
4. A later synthetic semantic error replaced that incorrectly confirmed empty entry.

At the investigation revision, this proved a false-clean path in the count rule. The live reopen trace confirmed that the close-clear sequence occurred. It did not measure a live false-clean duration under heavy load.

## Historical recommended design

### Internal diagnostic collection seam

Keep the change within the client diagnostic collection module in `supi-lsp`. Do not expose clients, custom commands, or mutable caches through `WorkspaceLspRuntime`. Existing collection and pull-result application provide the relevant internal seams. [S8]

Select an evidence source in this order:

1. Standard LSP document diagnostics when the server advertises them.
2. A TypeScript request adapter when the route is a supported `typescript-language-server` route and advertises `typescript.tsserverRequest`.
3. Push observations when neither request mechanism is available.

The TypeScript adapter must:

- Use the running semantic server (`executionTarget: 0`), not a second compiler process.
- Collect syntax, semantic, and suggestion results for the requested file. A semantic-only empty array does not establish absence of syntax errors.
- Validate every response. Missing bodies, unsupported commands, cancellation, failures, and partial phase collection cannot mean clean.
- Normalize TypeScript positions, severities, tags, and related information. Raw command results bypass the language server's push conversion. [S1, S5, S9]
- Associate the request with the file synchronization, client generation, and evidence revision. Reject results if any relevant state changes during collection.
- Record request-based provenance separately from standard LSP pull capability. Do not falsely advertise `diagnosticProvider`.
- Keep ambient unversioned pushes from inheriting request confirmation. During the investigation, the cache treated a push after a confirmed pull as confirmed; the implementation must not transfer that confirmation to an unrelated ambient payload. [S3]
- Keep evidence file-scoped. A successful file request is not a whole-workspace check or proof for all TypeScript programs that contain that file.

For generic push-only routes, retain useful errors as partial observations. Do not use notification count alone to establish confirmed clean. A route-specific rule needs an actual completion contract, not a server-name exception that trusts the first empty push. The current replacement decision is recorded in ADR 0022, not as a timeout adjustment. [S2, S10]

### LSP-agnostic collection

Use one shared evidence engine with optional request adapters. The engine is server-independent; only a non-standard request adapter contains server-specific behavior. Do not turn the TypeScript workaround into the default behavior for other servers.

| Route capability | Collection mechanism | Benefit |
| --- | --- | --- |
| Standard document diagnostics | `textDocument/diagnostic` | Generic request confirmation, with full or unchanged reports and result-ID reuse |
| A documented server-specific diagnostic request | A tested internal request adapter | Request confirmation without changing the shared engine |
| Push only, with no completion contract | Ambient diagnostic observations | Safe partial output and bounded waits; no unsupported confirmed-clean claim |

Standard document diagnostics already request evidence for the currently synchronized document. The protocol also defines related-document reports, `interFileDependencies`, optional workspace diagnostics, and dynamic registration. Prefer these capabilities to a list of server names. Preserve provider identifiers and applicable document selectors when selecting the request adapter. [S11]

At the investigation revision, `ClientDiagnosticsHost` exposed separate pull capability and collection methods. The current implementation replaces that binary choice with one internal request adapter. Its small interface collects a normalized report for one document under caller control and identifies the evidence source without changing the server's advertised capabilities. Standard LSP pull and the TypeScript command are the two implementations. No public adapter registry or command-template configuration is needed. [S12]

Shared engine responsibilities:

- Document synchronization and evidence-revision checks.
- Response application, result validation, confirmed-result reuse, and separation from ambient observations.
- Deadlines, cancellation policy, bounded scheduling, and duplicate-request sharing.
- Exact requested, confirmed, unconfirmed, failed, and removed coverage.
- Source-specific telemetry without source text or diagnostic messages.

Request adapter responsibilities:

- Capability eligibility and the concrete protocol request.
- Server-specific phase collection and diagnostic normalization.
- Response/result-ID rules and any limits on underlying request cancellation.

Adapters must not declare a document current on their own. The shared engine must check freshness and caller control again before it applies a completed report. A result from the correct request can still be obsolete when it arrives.

For a later optimization, use `workspace/diagnostic` only when the provider advertises workspace support. Do not equate that capability, a partial response, or an empty response with complete workspace coverage. Likewise, `interFileDependencies` signals the need for cross-file invalidation; it does not supply a dependency graph. Keep these optimizations separate from the first adapter implementation. [S11]

All servers can benefit from the common safety and scheduling rules. Only servers with a suitable request or another verified completion contract can gain request-confirmed clean results. Generic push LSP has no equivalent completion request. A hover response, progress end, document version, quiet interval, or second publication must not serve as a generic diagnostic completion barrier. [S2, S11]

Use a shared contract-test suite for every request adapter, plus separate tests for its protocol conversion. Test the push-only observation path separately. Other server binaries were not measured in this investigation; native pull support must be checked from each running route, not assumed from its language.

### Large-workspace controls

Preserve ADR 0020's document retention and protocol-stall-only restart policy. [S10]

- Start explicit TypeScript requests directly; do not first spend 3 s waiting for an absent second publication.
- Do not add no-op `didChange`, close/open, or restart traffic to obtain diagnostics.
- Share duplicate in-flight collection for the same route, file, and evidence generation.
- Use a bounded sequential or small-concurrency queue with one absolute operation deadline. Do not pass thousands of custom requests into an unbounded `Promise.allSettled` fan-out. [S8]
- Stop starting work when the caller cancels or the deadline expires. Report exact partial coverage for unfinished files.
- Reuse confirmed results while their evidence remains valid. Dependency and workspace invalidation must still invalidate affected evidence.
- Bound outstanding work after a caller stops waiting. The custom-command handler does not pass the LSP cancellation token into `executeCustom`; a local timeout does not prove that tsserver stopped computing. Use at most one active TypeScript collection per route, and do not start replacement work while a timed-out request is still outstanding. Test this behavior before release. [S6]

Upstream standard pull diagnostics would be the better long-term interface: the server could own result conversion, configuration, cancellation, and completion correlation. The existing custom command permits a bounded local adapter without a server fork. Neither approach should restore reopen-based confirmation.

### Historical time-limit recommendations

| Setting | Recommendation | Evidence |
| --- | --- | --- |
| `maxWaitMs` | Keep 3,000 ms as the initial request/collection budget | First pushes arrived well before it; 10 s did not create a second publication. The one cold real-file request took 2,125 ms. No evidence supports a global increase or decrease. |
| `quietMs` | Keep 200 ms for existing push settling; do not use it to confirm request results | The server's 50 ms debounce explains combined publications, not semantic completion. No quiet interval can prove an absent phase completed. |
| TypeScript secondary wait | None after explicit request collection | A completed response needs no reopen wait. Failed or timed-out collection remains partial/unconfirmed. |
| Other routes' secondary waits | Leave the current 1,000 ms single-file and `maxWaitMs` refresh-open limits unchanged | This investigation measured TypeScript only; it supplies no basis to retune other servers. |

These are conservative budget recommendations, not measured production p99 values. Before changing budgets, measure cold and warm request latency, deadline failures, queue depth, and completed-file coverage in representative large workspaces. The prior 30–60 s false-clean report is a safety regression case, not a proposed timeout. [S10]

## Historical implementation test requirements

- One combined clean publication never needs a second push when explicit requests complete.
- Repeated empty phases produce no push; an explicit refresh still returns bounded evidence.
- Close-clear plus syntax-only empty publication cannot establish confirmed clean before a delayed semantic error.
- Correct syntax errors, semantic errors, suggestions, and clean results through the request adapter.
- Cross-file changes invalidate dependent evidence; confirmed scope stays explicit.
- Reject missing, malformed, failed, cancelled, late, and superseded phase responses.
- Preserve diagnostic filtering, positions, tags, and related information.
- Ambient pushes cannot borrow earlier request confirmation.
- Unsupported custom commands leave the route usable with unconfirmed push observations.
- A 1,000-document refresh has bounded queue size, a shared deadline, exact partial counts, and no reopen or restart storm.
- A timed-out custom request cannot cause repeated callers to build an unbounded server queue.

### Historical verification during investigation:

```bash
pnpm exec vitest run \
  packages/supi-lsp/__tests__/unit/client-diagnostic-timing.test.ts \
  packages/supi-lsp/__tests__/unit/client-diagnostic-tentative.test.ts \
  packages/supi-lsp/__tests__/integration/client.integration.refresh-reuse.test.ts
```

Result: **3 test files, 23 tests passed**. These tests validated the policy that existed during the investigation. The integration test permitted either one publication or a later publication; it did not establish that the count rule was safe. No production fix was applied during that investigation, so the original reproduction still failed. Full verification was not required for that investigation.

## Historical investigation limits

The investigation had these limits:

- No production-scale latency percentile or complex 1,000-file cold-start benchmark.
- The request adapter was not implemented during the investigation; current implementation status is above.
- No standard pull support was observed in the tested server version; each future version needs a new capability check.
- No source-backed safe generic publication-count rule was found. Current policy distinguishes observed diagnostics from request-confirmed evidence.

## Sources

- **S1** — TypeScript language server 6.0.0, [`diagnosticsManager.ts`](https://github.com/typescript-language-server/typescript-language-server/blob/v6.0.0/src/diagnosticsManager.ts#L17-L159): debounce, empty-update suppression, close clear, filtering, and private test helper. [`document.ts`](https://github.com/typescript-language-server/typescript-language-server/blob/v6.0.0/src/document.ts#L453-L464): 300–800 ms document diagnostic scheduling delay.
- **S2** — [LSP 3.17 `publishDiagnostics`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_publishDiagnostics): replacement sets and optional document version.
- **S3** — [`client-diagnostic-cache.ts`](../../packages/supi-lsp/src/client/client-diagnostic-cache.ts), especially `acceptUnversionedPush()` and `buildPushCacheEntry()`; [`client-diagnostic-evidence.ts`](../../packages/supi-lsp/src/client/client-diagnostic-evidence.ts); [`client-document-sync.ts`](../../packages/supi-lsp/src/client/client-document-sync.ts); [`client-diagnostics.ts`](../../packages/supi-lsp/src/client/client-diagnostics.ts), `handlePublishDiagnostics()`. The historical reopen path is no longer part of the implementation.
- **S4** — TypeScript language server 6.0.0, [Send Tsserver Command](https://github.com/typescript-language-server/typescript-language-server/blob/v6.0.0/README.md#send-tsserver-command) and [`tsserverRequests.ts`](https://github.com/typescript-language-server/typescript-language-server/blob/v6.0.0/src/commands/tsserverRequests.ts): command arguments and execution target.
- **S5** — TypeScript 6.0.3, [`protocol.ts`](https://github.com/microsoft/TypeScript/blob/v6.0.3/src/server/protocol.ts): `SemanticDiagnosticsSyncRequest`, `SyntacticDiagnosticsSyncRequest`, `SuggestionDiagnosticsSyncRequest`, and `DiagnosticWithLinePosition`. Also checked in installed `node_modules/typescript/lib/typescript.d.ts:1844-1880`.
- **S6** — TypeScript language server 6.0.0, [`lsp-server.ts`](https://github.com/typescript-language-server/typescript-language-server/blob/v6.0.0/src/lsp-server.ts#L958-L961), [`ts-client.ts`](https://github.com/typescript-language-server/typescript-language-server/blob/v6.0.0/src/ts-client.ts#L555-L577), and [`tsServer/server.ts`](https://github.com/typescript-language-server/typescript-language-server/blob/v6.0.0/src/tsServer/server.ts#L165-L260): custom-command dispatch, response validation, request completion, and token handling.
- **S7** — TypeScript 6.0.3, [`session.ts`](https://github.com/microsoft/TypeScript/blob/v6.0.3/src/server/session.ts), `updateErrorCheck()`: syntax, semantic, and suggestion phases; change-sequence interruption. Also checked in installed `node_modules/typescript/lib/typescript.js:195796-195867`.
- **S8** — [`client-diagnostic-collection.ts`](../../packages/supi-lsp/src/client/client-diagnostic-collection.ts), [`client-diagnostic-pull.ts`](../../packages/supi-lsp/src/client/client-diagnostic-pull.ts), and [`client-diagnostic-refresh.ts`](../../packages/supi-lsp/src/client/client-diagnostic-refresh.ts): collection, final revision/deadline checks, bounded request scheduling, and budgets. [`supi-lsp/CLAUDE.md`](../../packages/supi-lsp/CLAUDE.md): private client ownership.
- **S9** — TypeScript language server 6.0.0, [`protocol-translation.ts`](https://github.com/typescript-language-server/typescript-language-server/blob/v6.0.0/src/protocol-translation.ts#L55-L108): push diagnostic conversion.
- **S10** — [ADR 0020](../adr/0020-lsp-diagnostic-recovery-and-debug-identity.md), [#344](https://github.com/mrclrchtr/supi/issues/344), and [#351](https://github.com/mrclrchtr/supi/issues/351): retention, recovery, publication policy, and the prior large-workspace false-clean report.
- **S11** — [LSP 3.17 pull diagnostics](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_pullDiagnostics): current synchronized document requests, full/unchanged reports, provider options, related documents, and workspace requests.
- **S12** — [`client-diagnostic-host.ts`](../../packages/supi-lsp/src/client/client-diagnostic-host.ts), [`client-diagnostic-request.ts`](../../packages/supi-lsp/src/client/client-diagnostic-request.ts), and [`client-diagnostic-capabilities.ts`](../../packages/supi-lsp/src/client/client-diagnostic-capabilities.ts): the request adapter seam, request control, and capability checks.
