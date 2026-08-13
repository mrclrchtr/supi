# supi-code-runtime

Shared workspace context, capability contracts, and canonical types for the code-understanding stack. Infrastructure package consumed by `supi-code-intelligence`.

See also: `packages/supi-code-intelligence/CONTEXT.md` and root `CONTEXT.md` (Infrastructure Package).

## Language

**Code query result**:
The typed outcome of a read-only provider request: completed with possibly empty data, partial with usable data and a limitation reason, or unavailable with no established result. Protocol-level empty responses are completed observations; routing, transport, and provider failures are unavailable.
_Avoid_: nullable query result, inferring availability from method presence, treating empty data as failure

**Code request control**:
Optional request metadata with the caller Abort Signal and an absolute Unix-epoch deadline. Provider, adapter, and workspace-runtime interfaces preserve the same value. In the expansion stage, substrates do not interpret it or start cancellation behavior.
_Avoid_: workflow control, relative timeout, provider client access
