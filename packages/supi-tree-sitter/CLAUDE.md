# CLAUDE.md

## Gotchas

- Tree-sitter TS fixtures must still parse for Biome; avoid invalid multi-default-export fixtures, split cases into files.
- `web-tree-sitter` query construction errors are validation errors; avoid broad runtime-error string heuristics.
- `TreeSitterSession.canParse()` is a parseability check only; raw trees stay internal and must be deleted by owners.
- `extractExports()` reports file-level exports only; nested `declare namespace/module` exports are scope-local.
- `declare module "foo"` parses as a string-named `module` node; keep outline shallow and preserve the module name.
- CRLF input needs normalized line splitting in coordinate helpers and `node_at` bounds to stay LSP-compatible.
- Outline should stay shallow: top-level declarations plus supported class/interface/enum members, not local function bodies.
