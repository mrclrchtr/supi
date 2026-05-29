<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-lsp">
    <picture>
      <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-lsp/assets/logo.png" alt="SuPi" width="50%">
    </picture>
  </a>
</div>

# @mrclrchtr/supi-lsp

Language Server Protocol runtime library for the [pi coding agent](https://github.com/earendil-works/pi).

This is a **library-only** package — it has no pi extension surface and does not register public tools by itself. Public semantic code-intelligence behavior is exposed through `@mrclrchtr/supi-code-intelligence`'s `code_*` tools.

## Install

```bash
npm install @mrclrchtr/supi-lsp
```

## What this package provides

`@mrclrchtr/supi-lsp` provides the semantic substrate used by SuPi's code-intelligence stack:

- a session-scoped `SessionLspService`
- LSP client lifecycle, transport, and workspace routing
- diagnostics collection, stale-diagnostic recovery, and summaries
- a shared `SemanticProvider` adapter for the workspace runtime
- operation-aware semantic refactor planning for first-wave precise text-edit operations

First-wave refactor mapping in the semantic provider:

- `rename_symbol` and legacy `rename` alias → `textDocument/rename`
- `update_imports` → precise organize-imports/source actions only
- `delete_dead_code` → precise quickfix/refactor-rewrite actions only
- `rename_file` / `move_file` → explicit unavailable results for now

![LSP status overlay](https://raw.githubusercontent.com/mrclrchtr/supi/main/screenshots/supi-lsp-status.png)

## Architecture

`@mrclrchtr/supi-lsp` is the **semantic substrate** in SuPi's code-understanding stack.
It depends on `@mrclrchtr/supi-core` and `@mrclrchtr/supi-code-runtime` for shared
contracts, and provides a session-scoped LSP service that publishes semantic and
diagnostic capabilities into the shared workspace runtime.

```text
supi-code-runtime  ← shared contracts + workspace runtime
    ↑
supi-lsp           ← LSP client + session-scoped service + runtime capabilities
    ↑
supi-code-intelligence ← public code_* tools over the semantic substrate
```

## Package surfaces

- `@mrclrchtr/supi-lsp/api` — reusable session-scoped LSP service and related types
- `@mrclrchtr/supi-lsp/provider/lsp-semantic-provider` — shared `SemanticProvider` adapter

Example:

```ts
import { getSessionLspService, toLspPosition } from "@mrclrchtr/supi-lsp/api";

const state = getSessionLspService("/project");
if (state.kind === "ready") {
  const defs = await state.service.definition("src/index.ts", toLspPosition(6, 11));
}
```

`SessionLspService` methods use raw **0-based LSP positions**. Public `code_*` tools keep the user-facing **1-based** coordinate UX.

## Source

- `src/client/` — LSP client, transport, refresh, and request handling
- `src/config/` — server config, defaults, capabilities, and exported LSP protocol types
- `src/diagnostics/` — stale diagnostics, suppression diagnostics, and workspace sentinels
- `src/manager/` — manager lifecycle, routing, diagnostics, and recovery helpers
- `src/provider/lsp-semantic-provider.ts` — shared `SemanticProvider` adapter
- `src/session/` — service registry, runtime registration, scanner, and controller logic
- `src/api.ts` — reusable developer-facing surface
- `src/index.ts` — package-root re-export surface
