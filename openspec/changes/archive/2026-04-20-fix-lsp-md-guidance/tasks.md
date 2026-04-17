## 1. Refactor bash-guard.ts

- [x] 1.1 Add `extractSearchTargets(command: string): string[]` — parse `rg`, `grep`, `ack`, `ag`, `git grep` invocations to extract file/directory path arguments
- [x] 1.2 Handle compound commands (`&&`, `||`, `;`, `|`) by splitting and searching each segment for a text-search tool
- [x] 1.3 Replace `shouldBlockSemanticBashSearch` with `shouldSuggestLsp(command, prompt, manager)` — returns nudge string or null, gates on `manager.isSupportedSourceFile()` for extracted targets
- [x] 1.4 Add directory support check — directories containing LSP-supported files pass the gate
- [x] 1.5 Remove the old `shouldBlockSemanticBashSearch` function and its `relevantPaths`/`hasRelevantCoverage` parameters

## 2. Update lsp.ts

- [x] 2.1 Remove the `tool_call` handler that blocked bash commands
- [x] 2.2 Add nudge logic to `tool_result` handler: when `event.toolName === "bash"`, call `shouldSuggestLsp` and inject a steer message via `pi.sendMessage` with `deliverAs: "steer"`
- [x] 2.3 Remove the `getSemanticBashBlockReason` helper function

## 3. Tests

- [x] 3.1 Update existing guardrail tests: assert nudge message instead of block reason for semantic `.ts` searches
- [x] 3.2 Add test: `shouldSuggestLsp` returns null for `.md` file targets even with active `.ts` LSP coverage
- [x] 3.3 Add test: `shouldSuggestLsp` returns null for non-semantic prompts
- [x] 3.4 Add test: `shouldSuggestLsp` returns null when no targets can be extracted
- [x] 3.5 Add unit tests for `extractSearchTargets`: rg with paths, grep with directory, git grep with pathspec, bare pattern, unparseable command, compound commands
