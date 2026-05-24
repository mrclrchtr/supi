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
    "After code_brief, use lsp_hover/lsp_definition/lsp_references for semantic detail or tree_sitter_* for quick structure.",
  ],
  code_map: ["Use code_brief instead when you need prioritized guidance."],
  code_relations: [
    "Follow caller results with lsp_references/lsp_definition; use tree_sitter_callees for structural outgoing calls.",
  ],
  code_affected: [
    "Use lsp_references instead when you need a plain reference list, not impact analysis.",
  ],
  code_pattern: [
    "Use tree_sitter_query or lsp_hover/lsp_definition when you need structure or semantic precision.",
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
