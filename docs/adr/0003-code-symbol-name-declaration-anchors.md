# Split CodeSymbol into name and declaration anchors

**Context.** `CodeSymbol` (`@mrclrchtr/supi-code-runtime`) carried one position populated inconsistently. LSP `DocumentSymbol.selectionRange.start` points to the identifier, while `SymbolInformation.location.range.start` may point to the declaration header, including export or modifier tokens. Position-strict substrates such as structural callees and semantic rename can return empty or unavailable results when given a declaration header. The difference must be represented rather than guessed away.

**Decision.** `CodeSymbol` carries an always-present `declarationAnchor` and an optional `nameAnchor`.

- Providers populate `declarationAnchor` and use `selectionRange` for `nameAnchor` when available. When source text is available, selection ranges are validated against it; a declaration-wide range is repaired only when the exact symbol token is present on that line, otherwise `nameAnchor` remains absent.
- Target-oriented workflows require ready semantic capability when establishing or refining a target.
- After semantic readiness, the target workflow may refine a workspace-symbol hit through document symbols, then use a structural identifier snap when provider-backed syntax can establish the name.
- Single-target and disambiguation paths apply the same refinement policy; structural evidence supplements LSP-first resolution but does not enable structural-only target creation.
- A fresh stored handle may continue to support structural consumers if LSP later becomes unavailable. Semantic consumers still require live semantic readiness.
- Position-strict consumers (`calleesAt`, rename) require a name anchor and fail observably when it cannot be established.
- Position-tolerant consumers (references, implementations, definitions) may use either anchor.
- Target-handle identity hashes stable fields (`cwd`, file, name, canonical provider-independent kind, container, declaration line/occurrence, fingerprint), not the preferred display/name-anchor position. The occurrence discriminator keeps overloads and separate type/value namespace declarations distinct while declaration-to-name refinement and equivalent semantic/structural observations reuse the handle.
- The canonical provider-independent kind normally normalizes the provider-reported kind. When that kind cannot express the source declaration, exact structural evidence at the declaration's name anchor may refine identity for that declaration. A TypeScript LSP `Variable` proven by Tree-sitter to be a `type_alias_declaration`, for example, keeps `Variable` as its display kind but uses `type` for identity. Name-only matching and blanket `type`/`value` normalization are not declaration evidence.
- Repeated observations refine Target facts independently. Name-anchor quality and confidence improve monotonically; the strongest available non-null observation supplies the Target display kind (semantic before structural, established value on equal-strength ties); and Target provider provenance is a typed set containing only `semantic` and `structural` whose registrations union independently of confidence. A later observation therefore cannot erase a name anchor or contributing provider. Selector and workflow origin are not provider provenance; anchored resolution path remains in its dedicated resolution metadata.

The distinction is big-bang: no deprecated position alias or fallback shape is retained. Vocabulary is pinned in `packages/supi-code-intelligence/CONTEXT.md`.

**Considered Options (rejected).** Provider-only standardization was rejected because `SymbolInformation` has no selection range. A structural point fix was rejected because future paths could reintroduce the conflation. Deprecated `line`/`character` aliases were rejected because they erase the distinction at the interface.

**Consequences.** Tests must assert that disambiguation candidates and resolved targets carry the correct anchor kind. Real-provider integration coverage is required for the refinement path. A position-strict workflow may report unavailable where it previously appeared to succeed with an empty result; that is honest correctness rather than reduced semantic accuracy.
