# Remove text-presence tests in tool guidance / descriptions

Remove tests whose only purpose is verifying specific words/text appear in tool guidance strings (`toolDescription`, `promptSnippet`, `promptGuidelines`), skill content, or similar static prompt surfaces. These tests break on any wording change but don't catch real bugs.

## What to remove

### 8 full files (dedicated guidance test files)

1. **`packages/supi-cache/__tests__/unit/guidance.test.ts`** — checks toolDescription contains "prompt cache regressions", promptSnippet contains "supi_cache_forensics", etc.
2. **`packages/supi-debug/__tests__/unit/guidance.test.ts`** — checks toolDescription contains "debug events", promptSnippet contains "supi_debug"
3. **`packages/supi-rtk/__tests__/unit/guidance.test.ts`** — checks promptGuidelines[0] contains "bash", "RTK", "RTK_DISABLED=1"
4. **`packages/supi-ask-user/__tests__/unit/guidance.test.ts`** — checks askUserPromptSnippet contains "ask_user", guidelines contain "ask_user"
5. **`packages/supi-web/__tests__/unit/guidance.test.ts`** — checks toolDescription contains "Fetch a web page"/"Context7", promptSnippet contains tool names
6. **`packages/supi-code-intelligence/__tests__/unit/guidance.test.ts`** — checks promptSnippet contains tool name, guidelines contain tool name, cross-family routing regex
7. **`packages/supi-code-intelligence/__tests__/unit/lsp-guidance.test.ts`** — checks promptSnippet contains tool name, lsp_hover coverage lines
8. **`packages/supi-code-intelligence/__tests__/unit/tree-sitter-guidance.test.ts`** — checks promptSnippet contains tool name

### 2 embedded blocks in existing test files

9. **`packages/supi-code-intelligence/__tests__/unit/extension-registration.test.ts`** — remove the "keeps descriptions focused on each tool contract" test (expect(brief.description).toContain("brief") etc.)
10. **`packages/supi-code-intelligence/__tests__/unit/tree-sitter-tool-actions.test.ts`** — remove the "tree-sitter guidance" describe block (duplicates tree-sitter-guidance.test.ts removal)

## What to keep

- All behavioral tests that happen to use `toContain` (e.g., error message checks, formatted output checks, fingerprint diff checks)
- Length/compactness assertions (promptGuidelines.length ≤ N) — these test a property, not a literal string
- Schema description length checks in supi-ask-user guidance test — but the file is entirely removed, so this goes anyway
