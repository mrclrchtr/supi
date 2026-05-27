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
  code_references: [
    "Reports semantic references/usages of a symbol. Does not report callers specifically.",
    "Requires an active LSP server. Does not fall back to text search.",
    "Follow up with lsp_hover for type info on individual reference sites.",
  ],
  code_calls: [
    "Reports structural outgoing calls from the enclosing function or method.",
    "V1 supports outgoing calls only — does not claim true incoming callers.",
    "Requires tree-sitter for the file type.",
  ],
  code_implementations: [
    "Finds semantic implementations of an interface, class, or abstract method.",
    "Requires an LSP server. Does not fall back to text search.",
  ],
  code_affected: [
    "Uses semantic evidence for blast-radius assessment. Does not fall back to heuristic text search.",
    "Use lsp_references when you only need a plain reference list without impact analysis.",
  ],
  code_pattern: [
    "The only code_* tool that uses heuristic/text search behavior. For structured or semantic precision, use tree_sitter_query or lsp_hover/lsp_definition instead.",
  ],
  code_refactor_plan: [
    "Preview-only semantic rename operation. Does not mutate files.",
    "Returns a plan ID. Use code_refactor_apply to execute the plan.",
    "Requires an LSP server with rename support.",
  ],
  code_refactor_apply: [
    "Applies a previously generated refactor plan by plan ID.",
    "Rejects stale, missing, or invalid plans.",
    "Applies through safe file mutation.",
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
