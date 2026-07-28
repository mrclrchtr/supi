# supi-code-runtime

Shared workspace context, capability contracts, and canonical types for the code-understanding stack. Infrastructure package consumed by `supi-code-intelligence`.

See also: `packages/supi-code-intelligence/CONTEXT.md` and root `CONTEXT.md` (Infrastructure Package).

## Language

**Code query result**:
The typed outcome of a read-only provider request: completed with possibly empty data, partial with usable data and a limitation reason, or unavailable with no established result. Protocol-level empty responses are completed observations; routing, transport, and provider failures are unavailable.
_Avoid_: nullable query result, inferring availability from method presence, treating empty data as failure
