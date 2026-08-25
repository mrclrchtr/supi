# Require republished evidence before confirming push diagnostics

Push-only language servers can publish an early result and a later semantic result for one document synchronization. SuPi therefore distinguishes fresh, tentative, and confirmed diagnostic evidence. Every push synchronization, including `didOpen`, `didChange`, and reopen operations, needs a later valid publication for the same synchronization before SuPi confirms it; each publication restarts the quiet period. Pull responses remain sufficient confirmation. The existing `maxWaitMs` bounds each settle phase. If no republish arrives, SuPi shows non-empty tentative diagnostics as partial evidence. An empty tentative publication stays unavailable and cannot establish a clean result. Late publications promote the retained cache, and recovery does not start another reopen storm.

## Considered options

- Confirming the first publication after `quietMs` was rejected because an empty publication can be intermediate.
- Requiring a server-specific final marker was rejected because no common marker exists for push-only servers.
- Reopening again after a tentative timeout was rejected because it can recreate the large-workspace storm addressed by ADR 0020.
- Adding a public grace-period setting was rejected because the policy is internal and server timing is not a stable user configuration contract.

## Consequences

This prevents confirmed-clean claims without a republish. It keeps tentative errors visible while a clean result stays unconfirmed. Maintenance actions use only confirmed diagnostic entries, so a tentative error cannot start a reopen cycle. Publication telemetry records one bounded per-synchronization summary and a separate ambient event for late publications. Debug telemetry may include the bounded workspace-relative file and synchronization identifier, but never diagnostic payloads or source content.
