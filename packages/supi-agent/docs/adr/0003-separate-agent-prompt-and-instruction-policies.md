# Separate agent prompt and instruction policies

Agent Profiles choose an Agent Prompt Policy independently from their Agent Instruction Scope. The `systemPrompt` selector is `native`, `supi:<id>`, or `custom`; `custom` uses the complete prompt in the Profile Directory's sibling `SYSTEM.md`. Global and project AGENTS.md or CLAUDE.md files are selected separately, while Pi `SYSTEM.md` and `APPEND_SYSTEM.md` remain excluded so prompt ownership is unambiguous.

A package-owned or custom prompt is followed by a generated `tool_rules` section holding the `promptGuidelines` of the run's active tools. Pi renders those rules only for its native prompt, so they would otherwise never reach these profiles. The section is derived from the tool set, not authored per profile: the prompt keeps cross-tool method, and each tool keeps its own usage rules.
