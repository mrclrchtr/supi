# CLAUDE.md

This file provides guidance to Claude Code when working in `packages/supi-lsp/`.

## Scope

`@mrclrchtr/supi-lsp` provides Language Server Protocol integration for pi:
- type-aware hover / definition / references / rename / code actions / symbols
- a registered `lsp` tool
- inline diagnostics surfaced around `write` and `edit`
- agent guidance that nudges semantic tooling over raw text search

Entrypoint: `lsp.ts`

## Key files

- `lsp.ts` — extension registration and tool wiring
- `manager.ts` — client/server lifecycle and state
- `summary.ts` — formatting/relevance helpers; keep summary logic here to avoid bloating `manager.ts`
- `scanner.ts` — project scanning/guidance coverage logic
- `diagnostics.ts`, `diagnostic-summary.ts`, `ui.ts` — diagnostic shaping and presentation
- `config.ts` — `.pi-lsp.json` handling

## Behavior notes

- Per-project config lives in `.pi-lsp.json` at the project root. YAML is intentionally unsupported.
- The `lsp` tool advertises semantic-first guidance via `promptSnippet` / `promptGuidelines`.
- Runtime `before_agent_start` guidance is stateful and should stay mostly dormant:
  - activate only after qualifying source interactions (`read`, `edit`, `write`, `lsp`) on supported files
  - re-inject only when an activation hint is pending or tracked-file diagnostics changed
- Use `pi.on("tool_result")` to append diagnostics/context to tool output.

## Environment variables

- `PI_LSP_DISABLED=1` — disable all LSP functionality
- `PI_LSP_SERVERS=rust-analyzer,pyright` — allow-list active servers
- `PI_LSP_SEVERITY=1|2|3|4` — inline diagnostic threshold (`1` = errors only)

## Packaging/runtime gotchas

- `@sinclair/typebox` is a runtime import here, so keep it in `peerDependencies`.
- Avoid `@mariozechner/pi-ai`'s `StringEnum`; use `Type.Union(Type.Literal(...))` to keep the dep tree smaller.
- If a cleanup promise may reject, attach `promise.catch(() => {})` at creation time so vitest does not treat it as an unhandled rejection.

## Testing

Useful commands:
```bash
pnpm exec vitest run packages/supi-lsp/__tests__/guidance.test.ts
pnpm exec vitest run packages/supi-lsp/__tests__/scanner.test.ts
```

Testing gotchas:
- Integration tests use `describe.skipIf(!HAS_CMD)` and will auto-skip when required language servers are missing from `PATH`.
- Diagnostics can arrive late in TS integration tests; retry `syncFileAndGetDiagnostics()` before asserting.
- A temporary file like `packages/supi-lsp/__tmp_guidance_probe.ts` with an intentional type error is a useful live probe for diagnostics + guidance behavior.
