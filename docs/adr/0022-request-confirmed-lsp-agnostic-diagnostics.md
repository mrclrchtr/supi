# Request-confirmed, LSP-agnostic diagnostics

**Status:** Accepted

SuPi uses one shared diagnostic engine with optional request adapters. The engine keeps diagnostic policy independent of any one language server: native LSP pull is preferred, a tested server-specific request adapter is next, and ambient push is last. This gives request-confirmed file results without treating push timing as completion.

## Decision

- **Native pull:** Use a valid static or dynamic `diagnosticProvider` that applies to the file. Validate full and unchanged reports, then apply them only when the document synchronization and evidence revision are current.
- **TypeScript requests:** For an eligible `typescript-language-server` route that advertises `typescript.tsserverRequest`, collect syntax, semantic, and suggestion diagnostics from the running tsserver through `workspace/executeCommand`. The adapter verified with `typescript-language-server` 6.0.0 and TypeScript 6.0.3 normalizes and validates all phases before it supplies file-scoped evidence. Native pull has priority when both sources apply.
- **Ambient push:** Accept only valid publications that pass the document and sync-moment gates. Keep every accepted push as observed or tentative. A document version, publication count, quiet interval, or later republish cannot confirm a clean result. Non-empty observations may be returned as partial evidence.
- **Shared control:** Check synchronization and revision again when a request finishes. Share duplicate work for one route, file, synchronization, and revision. Run one request at a time per client route and allow at most 32 pending jobs. Caller cancellation or deadline ends only that caller's wait. Supersession drops queued jobs before dispatch and stops future adapter phases; it does not cancel an active protocol request. The owned route stays occupied until the request actually settles or the connection is disposed. The owner timeout attempts protocol cancellation but does not prove that the backend stopped. The owner bound is at least 30 seconds, so a caller deadline does not prove settlement.
- **Coverage and recovery:** Report exact `requested`, `confirmed`, `unconfirmed`, `failed`, and `removed` file coverage. A diagnostic request never proves a workspace, every file in a TypeScript program, or every language. Do not close/open or send a no-op change to obtain diagnostic confirmation. Keep ADR 0020's retention and protocol-stall-only restart intent; a missing push does not start a restart.
- **Server-requested refresh:** Invalidate diagnostic evidence without changing the semantic input generation. Refresh tracked files with native pull or the verified TypeScript adapter when available. Keep unchanged document synchronization, synchronize only actual disk changes, and keep push-only results unconfirmed or partial. Coalesce overlapping server requests into one active pass and one newer pending pass; keep active transport owned until it settles.
- **Telemetry:** Record the request source in diagnostic timing data and retain bounded publication counts as observations. Do not use telemetry counts as evidence.

[ADR 0021](0021-push-diagnostic-republication-confirmation.md) is superseded. A publication count, republish, or quiet period does not prove completion. ADR 0020 is superseded only where it uses the sync-moment time gate or reopen-resync path to confirm push diagnostics. Its document retention and protocol-stall-only restart rules remain active; the sync-moment gate remains only an admission check for some stale publications.

## Consequences

- Pull-capable routes and the verified TypeScript adapter can return a completed clean file result.
- Generic push-only routes can show useful errors, but a silent or empty push stays unconfirmed or unavailable.
- Request adapters stay internal to `supi-lsp`; the public workspace runtime does not expose clients, transports, or adapter configuration.
- Other server binaries need their own capability or adapter verification. The TypeScript verification does not establish request support for another language.
