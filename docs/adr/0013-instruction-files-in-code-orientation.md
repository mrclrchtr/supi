# Instruction files are surfaced by code_orientation

Directory-local instruction files such as `CLAUDE.md` and `AGENTS.md` are surfaced only through explicit `code_orientation` directory focus, not through automatic `tool_result` injection. `supi-claude-md` becomes a skills-only package with a thin resource-discovery extension, while `supi-code-intelligence` owns instruction-file lookup, deduplication, and truncation; this keeps arbitrary tool output clean while preserving local guidance as an intentional orientation step.

## Consequences

- `code_orientation` directory output includes applicable instruction files near the top, shallowest first and deepest last. Files are shown in full within Pi's tool output limit, which the deepest file gets first; a file over the remaining budget is cut at a whole line with a `read` offset for the remainder. A file cut to make room for other instruction files is not counted as surfaced and is supplied again; a file that alone exceeds the limit counts as surfaced after one delivery, because no later call could show it in full. This replaced a 200-line per-file limit, which cut files of 8–23 KB that fit the output limit ([#690](https://github.com/mrclrchtr/supi/issues/690)).
- Instruction files are guidance chrome, not tool evidence.
- The SuPi config section is `code-intelligence`, with camelCase keys such as `instructionFileNames`.
- The old `claude-md.subdirs` and `claude-md.fileNames` settings are dead configuration; no migration is required.
