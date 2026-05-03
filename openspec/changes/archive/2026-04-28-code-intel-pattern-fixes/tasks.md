## 1. Tool surface updates

- [x] 1.1 Add an optional `regex` boolean parameter to the `code_intel` tool schema and thread it through the pattern action inputs
- [x] 1.2 Update `code_intel` descriptions, examples, and prompt guidance so `pattern` is documented as literal-by-default with `regex: true` as the opt-in escape hatch

## 2. Pattern action behavior

- [x] 2.1 Change `executePatternAction()` to escape `pattern` by default and pass raw regex only when `regex: true`
- [x] 2.2 Keep the applied scope, match budgeting, and low-signal filtering behavior unchanged while introducing the literal-default search mode

## 3. Pattern output deduplication

- [x] 3.1 Add render-time `file:line` deduplication for grouped pattern results so overlapping context lines are emitted once per file
- [x] 3.2 Verify deduplication preserves all distinct match lines and grouped file summaries

## 4. Verification

- [x] 4.1 Add tests covering literal searches with regex metacharacters and explicit `regex: true` searches
- [x] 4.2 Add tests covering overlapping-context output so repeated `file:line` evidence is not rendered multiple times
- [x] 4.3 Run the relevant `supi-code-intelligence` test and lint/typecheck commands
