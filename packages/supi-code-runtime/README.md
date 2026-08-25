<div align="center">
  <a href="https://github.com/mrclrchtr/supi/tree/main/packages/supi-code-runtime">
    <img src="https://raw.githubusercontent.com/mrclrchtr/supi/main/packages/supi-code-runtime/assets/social-preview.png" alt="SuPi Code Runtime" width="100%">
  </a>
</div>

# @mrclrchtr/supi-code-runtime

[![GitHub stars](https://img.shields.io/github/stars/mrclrchtr/supi)](https://github.com/mrclrchtr/supi/stargazers)

Shared workspace context, capability contracts, and canonical types for the SuPi code-understanding stack.

This is a **library-only package** — it has no pi extension surface, no user-facing tools, and no UI. It is not installed directly — `supi-lsp`, `supi-tree-sitter`, and `supi-code-intelligence` bundle it and use its shared abstractions to communicate capability availability.

## Package surfaces

- `@mrclrchtr/supi-code-runtime/api` — shared canonical types, capability interfaces, and the workspace runtime registry

Read-only provider methods return `CodeQueryResult<T>`:

- `completed` — collection completed; `data` may be empty or `null`
- `partial` — usable data was collected, but one or more provider branches failed
- `unavailable` — no result was established; includes a reason

This keeps successful zero-result facts distinct from routing, transport, and provider failures.

Semantic and structural provider methods also accept optional `CodeRequestControl` metadata. It contains a caller `AbortSignal`, an absolute Unix-epoch deadline, and an optional opaque Debug Operation ID. Adapters preserve the same object. The ID does not change cancellation semantics. Canonical helpers identify cancellation and deadline expiry across bundled package copies. Cooperative structural substrates apply the control; unsupported substrates can preserve it without applying behavior.

## License

MIT
