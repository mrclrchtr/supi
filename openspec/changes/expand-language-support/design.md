## Context

SuPi's `supi-tree-sitter` currently supports only JavaScript and TypeScript grammars (`.js`, `.jsx`, `.ts`, `.tsx`, `.mts`, `.cts`, `.mjs`, `.cjs`). The `supi-lsp` extension already supports Python, Rust, Go, and C/C++ at the semantic layer, but Tree-sitter structural analysis (outline, query, node-at, imports, exports) fails for all of them. Additionally, LSP defaults lack entries for Ruby, Java, and Kotlin — languages that are common in enterprise, mobile, and web backend codebases.

## Goals / Non-Goals

**Goals:**
- Bring Tree-sitter support to parity with the LSP default language set by adding Python, Rust, Go, C, C++, Java, Kotlin, and Ruby.
- Add default LSP server definitions for Ruby (`ruby-lsp`), Java (`jdtls`), and Kotlin (`kotlin-lsp`).
- Keep the existing grammar resolution and WASM loading patterns; extend them rather than redesign.
- Ensure all new Tree-sitter packages are declared as peer dependencies so consumers can install only what they need.

**Non-Goals:**
- Adding language servers for languages not already covered by LSP defaults (e.g., C#, PHP, Elixir, Scala).
- Changing the Tree-sitter runtime API.
- Building grammar WASM files from source; we consume pre-built npm packages.
- Supporting every possible file extension for each language (cover the common ones).

## Decisions

### 1. Use individual `tree-sitter-<lang>` npm packages rather than a language pack
**Rationale:** SuPi already uses `tree-sitter-javascript` and `tree-sitter-typescript` directly. Using individual packages keeps the dependency model consistent, lets consumers cherry-pick languages, and avoids introducing a new abstraction (`@kreuzberg/tree-sitter-language-pack`) that would require rewriting `resolveGrammarWasmPath()`.

**Alternative considered:** `@kreuzberg/tree-sitter-language-pack` bundles 305+ languages. Rejected because it uses on-demand downloads and a different directory layout, adding complexity for marginal gain.

### 2. Map Kotlin to `tree-sitter-kotlin` and Ruby to `tree-sitter-ruby`
**Rationale:** Both have official or well-maintained community npm packages with WASM builds. `tree-sitter-kotlin` is actively used by Sourcegraph and Neovim. `tree-sitter-ruby` is maintained by the core Tree-sitter org.

### 3. Keep C and C++ as separate grammars
**Rationale:** `tree-sitter-c` and `tree-sitter-cpp` are separate packages with separate WASM files. The C++ grammar can parse C but is heavier; using the C grammar for `.c`/`.h` files is faster and more precise.

### 4. Add LSP servers as defaults only (no new runtime deps)
**Rationale:** LSP servers are external binaries, not npm packages. Adding them to `defaults.json` is a config change with no dependency footprint. Ruby (`ruby-lsp`), Java (`jdtls`), and Kotlin (`kotlin-lsp`) are the 2026 community consensus for their respective languages.

### 5. Move server definitions from `.pi-lsp.json` into supi config with per-language-key overrides
**Rationale:** Having two config files (`.pi-lsp.json` for infrastructure + supi config for preferences) is confusing. Consolidating into one location reduces cognitive overhead. Using **language names** as keys (e.g., `typescript`, `python`, `rust`) instead of server binary names makes the config human-readable. Per-key override semantics mean a user only specifies what differs — no copy-pasting of `fileTypes` or `rootMarkers` just to swap a command.

**Schema:**
```json
{
  "lsp": {
    "enabled": true,
    "severity": 1,
    "active": ["typescript", "python", "rust", "go", "c", "cpp", "ruby", "java", "kotlin"],
    "servers": {
      "typescript": {
        "command": "vtsls",
        "args": ["--stdio"]
      },
      "python": {
        "command": "pylsp"
      }
    }
  }
}
```

**Resolution order:**
- `enabled` / `severity` / `active`: shallow merge (project overrides global overrides defaults)
- `servers`: per-key merge against built-in language defaults. Each language key merges individually; omitted fields fall back to the code default for that language.

**Example:** If project config only overrides `typescript.command`, the default `fileTypes` and `rootMarkers` for TypeScript are preserved. If project config provides a new language key not in defaults, it is added.

**Breaking change:** `.pi-lsp.json` is removed entirely.

**Alternative considered:** Scope-fallback (project replaces global replaces defaults entirely). Rejected because it forced users to copy-paste all server definitions to customize one.

**Trade-off:** Requires custom per-key merge logic in `loadConfig()`, not the generic shallow merge. This is isolated to the LSP config loader.

## Risks / Trade-offs

- **[Risk]** Some `tree-sitter-*` npm packages may have peer dependency conflicts with `web-tree-sitter` versions.
  → **Mitigation:** Pin compatible versions in `peerDependencies` and test with `pnpm install` after changes.

- **[Risk]** `tree-sitter-kotlin` WASM may be larger than JS/TS grammars, increasing parser initialization time.
  → **Mitigation:** Lazy initialization already happens per-grammar in `TreeSitterRuntime`; only languages used in a session are loaded.

- **[Risk]** Kotlin LSP (`kotlin-lsp`) is newer (JetBrains official, released mid-2025) and may not be available on all systems.
  → **Mitigation:** It is a default, not a hard requirement. The existing server-missing skip behavior handles this gracefully.

- **[Risk]** Test fixtures for new languages must be valid enough for Biome to not choke on them.
  → **Mitigation:** Use minimal, syntactically valid snippets for fixtures.

## Migration Plan

1. Merge the PR.
2. Run `pnpm install` to pull new peer dependencies.
3. `/reload` pi to pick up new defaults.
4. Users with `.pi-lsp.json` must move its content into `.pi/supi/config.json` under `lsp.servers`, keyed by language name (e.g., `typescript`, `python`) rather than server binary name.
