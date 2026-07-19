# Split CodeSymbol into name and declaration anchors

**Context.** `CodeSymbol` (`@mrclrchtr/supi-code-runtime`) carried one position populated inconsistently. LSP `DocumentSymbol.selectionRange.start` points to the identifier, while `SymbolInformation.location.range.start` may point to the declaration header, including export or modifier tokens. Position-strict substrates such as structural callees and semantic rename can return empty or unavailable results when given a declaration header. The difference must be represented rather than guessed away.

**Decision.** `CodeSymbol` carries an always-present `declarationAnchor` and an optional `nameAnchor`.

- Providers populate `declarationAnchor` and use `selectionRange` for `nameAnchor` when available.
- Target-oriented workflows require ready semantic capability when establishing or refining a target.
- After semantic readiness, the target workflow may refine a workspace-symbol hit through document symbols, then use a structural identifier snap when provider-backed syntax can establish the name.
- Single-target and disambiguation paths apply the same refinement policy; structural evidence supplements LSP-first resolution but does not enable structural-only target creation.
- A fresh stored handle may continue to support structural consumers if LSP later becomes unavailable. Semantic consumers still require live semantic readiness.
- Position-strict consumers (`calleesAt`, rename) require a name anchor and fail observably when it cannot be established.
- Position-tolerant consumers (references, implementations, definitions) may use either anchor.
- Target-handle identity hashes stable fields (`cwd`, file, name, canonical provider-independent kind, container, declaration line/occurrence, fingerprint), not the preferred display/name-anchor position. The occurrence discriminator keeps overloads distinct while declaration-to-name refinement and equivalent semantic/structural observations reuse the handle.
- Repeated observations refine anchor quality, confidence, and per-member provider provenance monotonically; a later weaker observation cannot erase a name anchor or a contributing provider.

The distinction is big-bang: no deprecated position alias or fallback shape is retained. Vocabulary is pinned in `packages/supi-code-intelligence/CONTEXT.md`.

**Considered Options (rejected).** Provider-only standardization was rejected because `SymbolInformation` has no selection range. A structural point fix was rejected because future paths could reintroduce the conflation. Deprecated `line`/`character` aliases were rejected because they erase the distinction at the interface.

**Consequences.** Tests must assert that disambiguation candidates and resolved targets carry the correct anchor kind. Real-provider integration coverage is required for the refinement path. A position-strict workflow may report unavailable where it previously appeared to succeed with an empty result; that is honest correctness rather than reduced semantic accuracy.
