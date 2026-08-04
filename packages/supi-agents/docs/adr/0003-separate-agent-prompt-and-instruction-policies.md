# Separate agent prompt and instruction policies

Agent Profiles choose an Agent Prompt Policy independently from their Agent Instruction Scope. The `systemPrompt` selector is `native`, `supi:<id>`, or `custom`; `custom` uses the complete prompt in the Profile Directory's sibling `SYSTEM.md`. Global and project AGENTS.md or CLAUDE.md files are selected separately, while PI `SYSTEM.md` and `APPEND_SYSTEM.md` remain excluded so prompt ownership is unambiguous.
