// Prompt guidance and tool descriptions for the focused code-intelligence tool surface.
//
// Each code_* tool owns its complete promptGuidelines here (no overlay).
// The single source of truth for metadata lives in tool-specs.ts; this module
// builds the final prompt surfaces from those specs.

import type { PublicCodeIntelligenceToolName } from "../intent/types.ts";
import { CODE_INTELLIGENCE_TOOL_SPECS } from "./tool-specs.ts";

export interface CodeIntelligenceToolPromptSurface {
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

export type CodeIntelligenceToolPromptSurfaceMap = Record<
  PublicCodeIntelligenceToolName,
  CodeIntelligenceToolPromptSurface
>;

export function buildCodeIntelligenceToolPromptSurfaces(): CodeIntelligenceToolPromptSurfaceMap {
  const entries = CODE_INTELLIGENCE_TOOL_SPECS.map(
    (spec) =>
      [
        spec.name,
        {
          description: spec.description,
          promptSnippet: spec.promptSnippet,
          promptGuidelines: spec.basePromptGuidelines,
        },
      ] as const,
  );
  return Object.fromEntries(entries) as unknown as CodeIntelligenceToolPromptSurfaceMap;
}

export const CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES = buildCodeIntelligenceToolPromptSurfaces();
