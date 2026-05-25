# Code Runtime Architecture (historical)

The `supi-code-runtime` package was deleted as part of the code-intelligence stack redesign (TNDM-7V57EE). Its contents were merged into `supi-code-intelligence`:

| Former location (`supi-code-runtime`) | New location (`supi-code-intelligence`) |
|--------------------------------------|----------------------------------------|
| `src/types.ts` (canonical types) | `src/types.ts` |
| `src/provider/types.ts` (provider contracts) | `src/provider/types.ts` |
| `src/project/model.ts` (ArchitectureModel) | `src/model.ts` |
| `src/session/service-registry.ts` | (deleted, use `@mrclrchtr/supi-core/session` directly) |
| `src/session/workspace-session.ts` | (deleted, unused) |

The unified `CodeProvider` interface lives in `src/provider/code-provider.ts` and extends both `SemanticProvider` and `StructuralProvider`. The session-scoped registry is in `src/provider/registry.ts`.

For the full redesign rationale, see the ticket archive at `.tndm/tickets/TNDM-7V57EE/archive.md`.
