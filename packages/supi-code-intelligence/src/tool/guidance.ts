// Prompt guidance and tool descriptions for the focused code-intelligence tool surface.
//
// Each code_* tool owns its base prompt guidelines (describing its own surface).
// Additional cross-family orchestration guidelines are appended to help the
// model choose between code_*, lsp_*, and tree_sitter_* tools.

import { CODE_INTELLIGENCE_TOOL_SPECS, type CodeIntelligenceToolName } from "./tool-specs.ts";

export interface CodeIntelligenceToolPromptSurface {
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

export type CodeIntelligenceToolPromptSurfaceMap = Record<
  CodeIntelligenceToolName,
  CodeIntelligenceToolPromptSurface
>;

// ── Cross-family orchestration guidelines ──────────────────────────────
//
// These are appended to the appropriate code_* tools so the model sees a
// coherent strategy for choosing between code_*, lsp_*, and tree_sitter_*
// tools.  They do not re-own substrate metadata — each of the other packages
// describes and documents its own tools independently.

const ORCHESTRATION_GUIDELINES: Record<CodeIntelligenceToolName, string[]> = {
  code_brief: [
    "Use code_brief first for overall orientation — it provides prioritized context, start-here recommendations, and project/package/directory/file/symbol overview without needing a specific annotation.",
    "After code_brief gives an overview, use lsp_hover / lsp_definition / lsp_references (from supi-lsp) for semantic navigation and detailed type information at a specific position.",
    "After code_brief identifies relevant files, use tree_sitter_outline / tree_sitter_imports / tree_sitter_exports (from supi-tree-sitter) for quick structural inspection without a language server.",
  ],
  code_map: [
    "Use code_map when you need a factual, non-interpretive directory inventory — counts of files, child directories, language mix, and landmark files.",
    "code_map stays factual and does not provide prioritized start-here guidance that code_brief offers.",
  ],
  code_relations: [
    "Use code_relations for semantic caller discovery (kind: 'callers', LSP-backed) or structural callee extraction (kind: 'callees', tree-sitter-backed).",
    "When code_relations kind: 'callers' finds references, use lsp_references, lsp_implementation, or lsp_definition directly for more detailed semantic navigation.",
  ],
  code_affected: [
    "Use code_affected before edits when you need blast radius, downstream impact, and likely follow-up checks.",
    "code_affected uses semantic references (LSP) plus the architecture model — it does not fall back to heuristic grep guesses.",
    "Use code_affected for impact analysis; when you need a plain reference list without impact assessment, use lsp_references instead.",
  ],
  code_pattern: [
    "Use code_pattern for explicit literal, regex, or structured search within a bounded path.",
    "code_pattern is the only tool that intentionally returns heuristic / text-search results.",
    "For structural inspection that code_pattern cannot express well, use tree_sitter_query for custom AST pattern matching instead of code_pattern.",
    "For semantic lookups that need language-server precision, use lsp_hover or lsp_definition instead of code_pattern text search.",
  ],
};

// ── Surface builder ────────────────────────────────────────────────────

export function buildCodeIntelligenceToolPromptSurfaces(): CodeIntelligenceToolPromptSurfaceMap {
  return Object.fromEntries(
    CODE_INTELLIGENCE_TOOL_SPECS.map((spec) => [
      spec.name,
      {
        description: spec.description,
        promptSnippet: spec.promptSnippet,
        promptGuidelines: [...spec.basePromptGuidelines, ...ORCHESTRATION_GUIDELINES[spec.name]],
      } satisfies CodeIntelligenceToolPromptSurface,
    ]),
  ) as CodeIntelligenceToolPromptSurfaceMap;
}

export const CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES = buildCodeIntelligenceToolPromptSurfaces();
