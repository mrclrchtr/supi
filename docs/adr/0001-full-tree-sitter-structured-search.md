# Owned full Tree-sitter scan for structured pattern search

## Context

Structured `code_find` search must enumerate every eligible source file before asking Tree-sitter for declarations, imports, exports, or call sites. A text-match pre-filter can miss structural evidence whose searchable name differs from its source text. The former `rg --files` enumerator avoided that pre-filter but introduced a different correctness problem: it depended on an unmanaged executable, inherited ripgrep's hidden/ignore universe, could not be cancelled while its synchronous process ran, and could collapse process failures into an empty file set.

`code_find` no longer owns literal or regex search; PI grep owns that capability. Its differentiated role is explicit Structural analysis and Semantic analysis with honest completeness metadata.

## Decision

AST mode uses a package-owned, in-process AST Scan. It enumerates regular files with extensions reported by `getSupportedExtensions()` and canonically deduplicates overlapping scopes. One 10-second deadline covers enumeration plus analysis, and enumeration stops when it observes an eligible file beyond the 5,000-file safety cap. `maxResults` remains a match display cap rather than a file-enumeration cap.

The default Scan universe starts at cwd and excludes hidden descendants plus `.git`, `.pnpm`, `node_modules`, `dist`, `build`, `out`, `.next`, `.nuxt`, `coverage`, `.turbo`, `.cache`, and `__pycache__`. It does not read `.gitignore`, `.ignore`, `.rgignore`, or global Git configuration and does not follow descendant symlinks. An explicitly selected root is honored before descendant policy resumes, including a supported source file under a normally excluded directory.

Cancellation throws the supplied abort reason. Unreadable traversal, deadline expiry, the safety cap, and per-file structural-provider failures produce an incomplete Scan and partial Evidence-list metadata with an unknown match total. Policy exclusions define the declared universe and are disclosed separately from runtime limitations. Omitted file counts remain Scan metadata; they are not Evidence-atom omission counts.

## Consequences

- AST search requires no `rg` executable and has one cancellation-aware enumeration interface.
- Complete scans retain exact shown/total/omitted match metadata.
- An incomplete zero-match scan cannot render a complete absence claim.
- Visible Git-ignored source is eligible by design; hidden or high-volume trees require an explicit root.
- `callSites(file)` remains the structural source for written call names, so AST `call` does not use regex classification or claim symbol identity.

## Rejected alternatives

- **Ripgrep text pre-filter:** fast but structurally lossy.
- **`rg --files` enumeration:** fast, but its executable, ignore universe, cancellation, and failure semantics are not owned by Code intelligence.
- **Reimplement text/regex grep inside `code_find`:** duplicates PI grep without strengthening the code-aware role.
- **Silent collection caps:** prevent exact completeness claims and violate Truncation disclosure.
