# Focused code tools and evidence policy

**Status:** Accepted (2026-07-13)

## Context

The public code-intelligence surface accumulated overlapping tools, flat target arguments with precedence rules, graph relations with uneven evidence quality, and convention-derived claims. The wide interface increased selection cost and made it difficult to tell provider-backed facts from helpful guesses.

## Decision

Expose exactly eight model-callable tools:

1. `code_resolve`
2. `code_inspect`
3. `code_orientation`
4. `code_graph`
5. `code_find`
6. `code_health`
7. `code_refactor_plan`
8. `code_refactor_apply`

`code_impact` is removed. No alias or dual input shape is retained.

Target-taking tools use a nested exact-one selector:

- `{ target: { handle: "tg-…" } }`
- `{ target: { anchor: { file, line, character } } }`
- `{ target: { symbol: { query, scope?, symbolKind? } } }`
- `{ target: { file } }` only for file discovery in `code_resolve`

A file selector yields a distinct successful Target group outcome derived from all provider-reported declarations in the file, including nested declarations. Discovery counts and orders the complete set, then materializes handles only for the bounded visible members while retaining exact total/omitted metadata; one verified file fingerprint is shared across that registration batch. Semantic and structural declarations are matched through provider-independent declaration identity, with semantic facts winning duplicate members and each member retaining a typed, monotonic set of contributing provider families. The group separately retains every provider that successfully enumerated the file, including successful empty observations. Its aggregate confidence is conservative across the complete pre-cap group—semantic only when every member is semantic—while an empty group derives confidence from its strongest successful enumerator. Stable declaration line/occurrence identity keeps overloads distinct without coupling handle identity to the preferred name/display anchor. Successful enumeration with no declarations returns an empty Target group; capability failure remains unavailable. Unsupported or non-file selectors are invalid input before semantic startup. File discovery never creates a synthetic file-position handle or reuses symbol-query disambiguation; precise downstream intents select one member handle from the group. Each intent admits only the selector branches it can honor. `code_orientation` omits `focus` for workspace Orientation, otherwise accepts exactly one of `{ path }`, `{ module }`, or `{ target: TargetSelector }`. Refactor planning accepts exactly one operation payload: `rename_symbol`, `extract_function`, or `extract_variable`.

`symbolKind` is a strict exact filter over all 26 provider-reported LSP `SymbolKind` values, not a source-language declaration taxonomy. LSP has no `TypeAlias` kind, for example, so callers omit the filter when the provider category is uncertain. When a valid semantic query reports candidates but none has the requested provider kind, the target workflow returns a distinct bounded Symbol-kind mismatch outcome with candidate handles and exact omission metadata. It neither claims the symbol is absent nor silently promotes a mismatched candidate. Disambiguation candidates carry identity, location, rank, and anchor facts; they do not carry an undefined free-form `reason` field.

Target-oriented workflows are LSP-first: concrete file/workspace semantic readiness is a prerequisite when a target or Target group is established or refined. Runtime ownership without a live routed client is insufficient. Structural evidence may supplement target resolution and power explicitly structural relations after that prerequisite is met, but it does not enable structural-only target creation. A fresh stored handle remains usable by structural consumers if LSP later becomes unavailable; mixed workflows re-check file readiness and suppress semantic/diagnostic sections while retaining structural evidence. Semantic consumers still require live readiness. Explicit structural search remains independent.

Schemas encode exact-one objects with one-key cardinality and closed properties. They avoid union/literal constructs that model providers reject. Runtime validation still protects direct calls that bypass PI schema validation.

`code_graph` exposes only:

- provider-backed `references`
- explicitly structural `callees`
- provider-backed `implements`
- `all`, meaning exactly those three

Structural callees are source-shape calls from the enclosing scope, not symbol-identity relationships. Imports, exports, tests, and impact are not graph relation families.

A deterministic convention may locate an artifact. It cannot create a classification, relationship, or absence claim. A miss at one conventional path means only that no artifact was found there. Evidence keeps its provider or structural provenance; degraded or unavailable substrates are disclosed rather than silently replaced. Next-query guidance follows the same honest-correctness boundary: a proposed Tool call must be executable from capabilities and evidence established by the current result or explicitly name its unmet prerequisite. In particular, point inspection recommends target/graph work only from an evidence-backed definition location; structural-only inspection does not recommend a fresh graph anchor that LSP-first target establishment will reject.

## Consequences

- Tool choice is smaller and each interface has greater depth.
- Callers express intent structurally instead of relying on precedence.
- A public breaking change is intentional; SuPi is pre-release.
- Graph output has a coherent evidence contract.
- Search conventions remain useful locators without being promoted to Tool evidence.
- Descriptions and guidelines must name only the eight-tool family and the current nested shapes.

## Rejected alternatives

- **Keep `code_impact`:** overlaps relationship and change reasoning without a coherent evidence substrate.
- **Keep flat arguments plus precedence:** allows contradictory calls and hidden ignored input.
- **Keep graph imports, exports, and tests:** mixes file structure, convention discovery, and symbol relationships.
- **Treat naming or path conventions as evidence:** produces claims that the located artifact has not established.
- **Silently fall back between semantic, structural, and text search:** obscures confidence and breaks honest correctness.
