# Instruction files are surfaced by code_orientation

Directory-local instruction files such as `CLAUDE.md` and `AGENTS.md` are surfaced only through explicit `code_orientation` directory focus, not through automatic `tool_result` injection. `supi-claude-md` becomes a skills-only package with a thin resource-discovery extension, while `supi-code-intelligence` owns instruction-file lookup, deduplication, and truncation; this keeps arbitrary tool output clean while preserving local guidance as an intentional orientation step.

## Consequences

- `code_orientation` directory output includes applicable instruction files near the top, shallowest first and deepest last, with a 200-line per-file display limit.
- Instruction files are guidance chrome, not tool evidence.
- The SuPi config section is `code-intelligence`, with camelCase keys such as `instructionFileNames`.
- The old `claude-md.subdirs` and `claude-md.fileNames` settings are dead configuration; no migration is required.
