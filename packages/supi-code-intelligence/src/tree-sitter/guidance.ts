// Tree-sitter tool prompt surfaces for the umbrella package.

import { TS_TOOL_SPECS, type TsToolName } from "./tool-specs.ts";

export interface TsToolPromptSurface {
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

export type TsToolPromptSurfaceMap = Record<TsToolName, TsToolPromptSurface>;

export function buildTsToolPromptSurfaces(): TsToolPromptSurfaceMap {
  return Object.fromEntries(
    TS_TOOL_SPECS.map((spec) => [
      spec.name,
      {
        description: spec.description,
        promptSnippet: spec.promptSnippet,
        promptGuidelines: [...spec.promptGuidelines],
      } satisfies TsToolPromptSurface,
    ]),
  ) as TsToolPromptSurfaceMap;
}
