<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-code-runtime">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-runtime/assets/social-preview.png" alt="SuPi Code Runtime" width="100%">
  </a>
</div>

# @mrclrchtr/supi-code-runtime

Shared workspace context, capability contracts, and canonical types for the SuPi code-understanding stack.

This is a **library-only package** — it has no pi extension surface, no user-facing tools, and no UI. It provides the shared abstractions that `supi-lsp`, `supi-tree-sitter`, and `supi-code-intelligence` use to communicate capability availability.

## Package surfaces

- `@mrclrchtr/supi-code-runtime/api` — shared canonical types, capability interfaces, workspace runtime registry, and typed request context

Read-only provider methods return `CodeQueryResult<T>`:

- `completed` — collection completed; `data` may be empty or `null`
- `partial` — usable data was collected, but one or more provider branches failed
- `unavailable` — no result was established; includes a reason

This keeps successful zero-result facts distinct from routing, transport, and provider failures.

## License

MIT
