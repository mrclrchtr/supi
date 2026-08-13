# supi-code-runtime

Shared workspace context, capability contracts, and canonical types for the code-understanding stack. Infrastructure package consumed by `supi-code-intelligence`.

See also: `packages/supi-code-intelligence/CONTEXT.md` and root `CONTEXT.md` (Infrastructure Package).

## Language

**Code query result**:
The typed outcome of a read-only provider request: completed with possibly empty data, partial with usable data and a limitation reason, or unavailable with no established result. Protocol-level empty responses are completed observations; routing, transport, and provider failures are unavailable.
_Avoid_: nullable query result, inferring availability from method presence, treating empty data as failure

**Code request control**:
Optional request metadata with the caller Abort Signal, an absolute Unix-epoch deadline, and an opaque Debug Operation ID when one public Tool call directly owns the work. Provider, adapter, and workspace-runtime interfaces preserve the same value. Cooperative substrates use the canonical interruption helpers. The Debug Operation ID does not change cancellation semantics.
_Avoid_: workflow progress, relative timeout, provider client access, raw Pi Tool-call ID
