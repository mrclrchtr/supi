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
- `{ target: { file } }` only where file-level intent is valid

Each intent admits only the selector branches it can honor. `code_orientation` omits `focus` for workspace Orientation, otherwise accepts exactly one of `{ path }`, `{ module }`, or `{ target: TargetSelector }`. Refactor planning accepts exactly one operation payload: `rename_symbol`, `extract_function`, or `extract_variable`.

Schemas encode exact-one objects with one-key cardinality and closed properties. They avoid union/literal constructs that model providers reject. Runtime validation still protects direct calls that bypass PI schema validation.

`code_graph` exposes only:

- provider-backed `references`
- explicitly structural `callees`
- provider-backed `implements`
- `all`, meaning exactly those three

Structural callees are source-shape calls from the enclosing scope, not symbol-identity relationships. Imports, exports, tests, and impact are not graph relation families.

A deterministic convention may locate an artifact. It cannot create a classification, relationship, or absence claim. A miss at one conventional path means only that no artifact was found there. Evidence keeps its provider or structural provenance; degraded or unavailable substrates are disclosed rather than silently replaced.

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
