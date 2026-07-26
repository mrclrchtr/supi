# Owned full Tree-sitter scan for structured pattern search

## Context

Structured `code_find` search must enumerate every eligible source file before asking Tree-sitter for declarations, imports, exports, or call sites. A text-match pre-filter can miss structural evidence whose searchable name differs from its source text. The former `rg --files` enumerator avoided that pre-filter but introduced a different correctness problem: it depended on an unmanaged executable, inherited ripgrep's hidden/ignore universe, could not be cancelled while its synchronous process ran, and could collapse process failures into an empty file set.

`code_find` no longer owns literal or regex search; PI grep owns that capability. Its differentiated role is explicit Structural analysis and Semantic analysis with honest completeness metadata.

## Decision

AST mode uses a package-owned, in-process AST Scan. Its universe is operation-aware: each public AST kind maps exhaustively to `outline`, `imports`, `exports`, or `call-sites`, and the scanner enumerates only extensions supported by that concrete extractor through `getStructuralSearchSupportedExtensions()`. Parseable files unsupported by the selected operation are policy exclusions rather than runtime provider failures. Overlapping scopes are canonically deduplicated. One 10-second deadline covers enumeration plus analysis, and enumeration stops when it observes an eligible file beyond the 5,000-file safety cap. `maxResults` remains a match display cap rather than a file-enumeration cap.

The default Scan universe starts at cwd and excludes operation-ineligible files, hidden descendants, and `.git`, `.pnpm`, `node_modules`, `dist`, `build`, `out`, `.next`, `.nuxt`, `coverage`, `.turbo`, `.cache`, and `__pycache__`. It does not read `.gitignore`, `.ignore`, `.rgignore`, or global Git configuration and does not follow descendant symlinks. An explicitly selected root is honored before descendant policy resumes, including an operation-eligible source file under a normally excluded directory. An exact operation-ineligible file is invalid; a directory containing only operation-ineligible source is unavailable. Mixed scopes remain complete over the declared operation-specific universe and disclose the excluded files.

Cancellation throws the supplied abort reason. Unreadable traversal, deadline expiry, the safety cap, and per-file structural-provider failures produce an incomplete Scan and partial Evidence-list metadata with an unknown match total. A provider rejecting a file declared eligible is a capability-contract failure, not a signal to fall back. Policy exclusions define the declared universe and are disclosed separately from runtime limitations. Omitted file counts remain Scan metadata; they are not Evidence-atom omission counts.

## Consequences

- AST search requires no `rg` executable and has one cancellation-aware enumeration interface.
- Complete scans retain exact shown/total/omitted match metadata.
- An incomplete zero-match scan cannot render a complete absence claim.
- Visible Git-ignored source is eligible when the requested operation supports it; hidden or high-volume trees require an explicit root.
- Known operation-ineligible languages do not make routine mixed-language scans partial or consume the eligible-file cap.
- `callSites(file)` remains the structural source for written call names, so AST `call` does not use regex classification or claim symbol identity.

## Rejected alternatives

- **Ripgrep text pre-filter:** fast but structurally lossy.
- **`rg --files` enumeration:** fast, but its executable, ignore universe, cancellation, and failure semantics are not owned by Code intelligence.
- **Reimplement text/regex grep inside `code_find`:** duplicates PI grep without strengthening the code-aware role.
- **Probe every generally parseable file and treat deterministic operation rejection as provider failure:** makes routine mixed-language scans partial and spends the safety budget outside the actual search universe.
- **Fall back to another AST kind, semantic search, or text search:** changes the requested evidence substrate and violates honest correctness.
- **Silent collection caps:** prevent exact completeness claims and violate Truncation disclosure.
