// Prompt guidance and tool descriptions for the focused code-intelligence tool surface.
//
// Each code_* tool owns its base prompt guidelines (describing its own surface).
// Additional cross-family orchestration guidelines are appended to help the
// model choose between code_*, lsp_*, and tree_sitter_* tools.

import type { CodeIntelligenceToolName } from "../intent/types.ts";
import { CODE_INTELLIGENCE_TOOL_SPECS } from "./tool-specs.ts";

export interface CodeIntelligenceToolPromptSurface {
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

export type CodeIntelligenceToolPromptSurfaceMap = Record<
  CodeIntelligenceToolName,
  CodeIntelligenceToolPromptSurface
>;

// ── Intent-first orchestration guidelines ─────────────────────────────
//
// These steer the model toward choosing tools by user intent rather than
// by implementation family.  Substrate tools (lsp_*, tree_sitter_*) are
// described as expert follow-up surfaces, not the primary choice.

const INTENT_GUIDELINES: Record<CodeIntelligenceToolName, string[]> = {
  code_brief: [
    "Use code_brief for prioritized orientation on a project, package, file, or symbol.",
    "The planner selects the best provider (semantic or structural) automatically.",
    "After code_brief, use lsp_hover/lsp_definition/lsp_references for deeper semantic detail or tree_sitter_* for quick structural context.",
  ],
  code_map: ["Use code_brief instead when you need prioritized guidance."],
  code_relations: [
    "The planner routes callers/implementations to semantic (LSP) analysis and callees to structural (tree-sitter) analysis.",
    "Follow caller results with lsp_references/lsp_definition for additional context; use tree_sitter_callees for structural outgoing calls as a debug surface.",
  ],
  code_affected: [
    "Uses semantic evidence for blast-radius assessment. Does not fall back to heuristic text search.",
    "Use lsp_references when you only need a plain reference list without impact analysis.",
  ],
  code_pattern: [
    "The only code_* tool that uses heuristic/text search behavior. For structured or semantic precision, use tree_sitter_query or lsp_hover/lsp_definition instead.",
  ],
  code_refactor: [
    "Uses semantic provider for precise rename/code-action operations with safety checks.",
    "Does not fall back to heuristic text replacement — if the provider cannot produce precise edits, the tool reports unavailable.",
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
        promptGuidelines: [...spec.basePromptGuidelines, ...INTENT_GUIDELINES[spec.name]],
      } satisfies CodeIntelligenceToolPromptSurface,
    ]),
  ) as CodeIntelligenceToolPromptSurfaceMap;
}

export const CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES = buildCodeIntelligenceToolPromptSurfaces();
