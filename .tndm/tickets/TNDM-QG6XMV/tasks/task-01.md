# Task 1: Remove code_brief from public tool registration

Remove `code_brief` entry from `CODE_INTELLIGENCE_TOOL_SPECS` in `src/tool/tool-specs.ts`. Remove `"code_brief"` from `CODE_INTELLIGENCE_TOOL_NAMES` and `PUBLIC_CODE_INTELLIGENCE_TOOL_NAMES` in `src/intent/types.ts`. Update `src/workflow/surface.ts` to reflect code_brief is now fully absorbed. Update `code_context` guidance text that says "keep code_brief for pure orientation". Remove `code_brief` from `PublicCodeIntelligenceToolName` type.
