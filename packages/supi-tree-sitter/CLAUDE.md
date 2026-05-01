# CLAUDE.md

## Gotchas

- Tree-sitter TS fixtures must still parse for Biome; avoid invalid multi-default-export fixtures, split cases into files.
- `web-tree-sitter` query construction errors are validation errors; avoid broad runtime-error string heuristics.
- `TreeSitterSession.canParse()` is a parseability check only; raw trees stay internal and must be deleted by owners.
- Outline should stay shallow: top-level declarations plus supported class/interface/enum members, not local function bodies.
