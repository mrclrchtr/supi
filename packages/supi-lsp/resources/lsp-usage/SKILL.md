---
name: lsp-usage
description: Use the LSP tool effectively — when to prefer hover, diagnostics, definition, references, symbols, rename, and code_actions over plain file reads and text search.
---

# LSP Tool Usage Guide

## When to use each action

### `hover` — type-aware queries

Prefer `hover` over `read` when you need to know the type, signature, or docs of a symbol. Hover resolves through aliases, re-exports, generics, and overloads — things you can't see from raw text.

Use when:
- "What type is this variable?"
- "What's the signature of this function?"
- "What does this imported symbol resolve to?"

### `definition` — before editing unfamiliar code

Use `definition` before editing code you haven't worked with in this session. It reveals the actual source location, including across package boundaries.

Use when:
- You're about to edit a function/class you didn't write
- You need to find where an imported symbol is defined
- You want to understand the call chain

### `references` — before renaming or moving code

Use `references` before renaming, moving, or changing a function signature. It finds all call sites and usages across the project.

Use when:
- "Where is this function called?"
- "What depends on this type?"
- Before a rename or signature change

### `diagnostics` — after edits and writes

Use `diagnostics` after `edit` or `write` to verify the changes didn't introduce type errors or other issues. Check per-file or project-wide.

Use when:
- After editing a TypeScript/Python/etc. file
- After writing a new file
- "Are there any errors?"

### `symbols` — understand file structure

Use `symbols` to get an outline of a file's exports, classes, functions, and variables without reading the whole file.

Use when:
- "What's exported from this file?"
- "What classes/functions are defined here?"
- You need a quick overview before diving in

### `rename` — safe renaming

Use `rename` instead of `edit` find-and-replace. The LSP handles renaming across all references, including in imports and string literals where applicable.

### `code_actions` — quick fixes

Use `code_actions` to get available quick-fixes and refactors at a position. Useful for auto-imports, adding missing return statements, or applying suggested fixes.

## Workflow patterns

### Pattern: Investigate before editing
```
1. symbols → understand the file
2. hover → understand the specific symbol
3. references → find all usages
4. edit → make the change
5. diagnostics → verify no errors
```

### Pattern: Verify after write
```
1. write → create or overwrite a file
2. diagnostics → check for type errors
3. If errors: hover on error locations, then edit to fix
```

### Pattern: Safe rename
```
1. references → review all call sites
2. rename → let LSP handle it
3. diagnostics → verify nothing broke
```

## Severity levels

LSP diagnostics report four severity levels:

| Level | Meaning | Action |
|-------|---------|--------|
| Error (1) | Code won't compile/run | Must fix before proceeding |
| Warning (2) | Potential problem | Should fix, code may still work |
| Information (3) | Suggestion or note | Consider fixing |
| Hint (4) | Style or optimization | Optional, low priority |

The active severity threshold is controlled by `PI_LSP_SEVERITY` (default: 1 = errors only).
Use `/lsp-status` to see the current threshold and all diagnostics.
