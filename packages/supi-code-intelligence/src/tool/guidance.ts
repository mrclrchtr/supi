// Prompt guidance and tool descriptions for the focused code-intelligence tool surface.

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

export function buildCodeIntelligenceToolPromptSurfaces(): CodeIntelligenceToolPromptSurfaceMap {
  return Object.fromEntries(
    CODE_INTELLIGENCE_TOOL_SPECS.map((spec) => [
      spec.name,
      {
        description: spec.description,
        promptSnippet: spec.promptSnippet,
        promptGuidelines: [...spec.basePromptGuidelines],
      } satisfies CodeIntelligenceToolPromptSurface,
    ]),
  ) as CodeIntelligenceToolPromptSurfaceMap;
}

export const CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES = buildCodeIntelligenceToolPromptSurfaces();
