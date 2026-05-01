## Why

`before_agent_start` currently injects LSP diagnostic context from the cached `diagnosticStore` without first giving active LSP servers a chance to refresh or settle. This can mislead the agent with stale cross-file diagnostics, missing newly-created diagnostics, or intermediate diagnostic snapshots from the previous turn.

## What Changes

- Refresh diagnostics for all currently open LSP documents before building pre-turn diagnostic context.
- Block the next agent turn for a bounded period while LSP diagnostics settle, preferring correctness over immediate turn start.
- Track diagnostic cache freshness and document versions so delayed diagnostics cannot overwrite newer state when version information is available.
- Keep existing non-blocking resilience: LSP failures or timeouts must not prevent the agent from running.
- Prepare for capability-aware LSP 3.17 diagnostic pull support where servers advertise `diagnosticProvider`, while retaining push-diagnostic fallback behavior.

## Capabilities

### New Capabilities

### Modified Capabilities
- `lsp-diagnostic-context`: Pre-turn diagnostic context must be generated only after a bounded refresh/settle pass over active LSP diagnostics.
- `lsp-diagnostics`: Diagnostic storage and waiting behavior must account for freshness/versioning and bounded multi-file refreshes.
- `lsp-client`: LSP client capabilities and diagnostic handling must support version-aware diagnostics and optionally advertised pull-diagnostic capabilities.

## Impact

- Affected code: `packages/supi-lsp/lsp.ts`, `packages/supi-lsp/manager.ts`, `packages/supi-lsp/client.ts`, `packages/supi-lsp/capabilities.ts`, `packages/supi-lsp/types.ts`, and related tests.
- Runtime behavior: `before_agent_start` may wait briefly, up to a bounded timeout, before injecting diagnostic context.
- API surface: likely adds internal manager/client methods for refreshing open diagnostics and inspecting diagnostic freshness.
- Dependencies: no new package dependencies expected.
