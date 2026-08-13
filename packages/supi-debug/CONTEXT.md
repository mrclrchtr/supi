# supi-debug

Debug surface for SuPi: session-local diagnostic event inspection via `/supi-debug` command and `supi_debug` tool. Consumes events from the Debug Registry.

See also: `packages/supi-core/CONTEXT.md` (Debug Registry, Debug Event Producer, Debug Operation ID, Debug Surface).

The surface displays and filters an optional Debug Operation ID by exact equality in live and persisted events. The identity means explicit direct request ownership. It does not mean time overlap, security identity, raw Pi Tool-call identity, or a distributed trace.
