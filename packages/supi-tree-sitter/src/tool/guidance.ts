// Guidance surfaces for the focused tree_sitter_* tool set.
//
// Derives from tool-specs.ts so prompt surfaces stay in sync with
// the public tool metadata.

import { TREE_SITTER_TOOL_SPECS, type TreeSitterToolName } from "./tool-specs.ts";

export interface TreeSitterToolPromptSurface {
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

export type TreeSitterToolPromptSurfaceMap = Record<
  TreeSitterToolName,
  TreeSitterToolPromptSurface
>;

const _DEFAULT_SURFACES = buildTreeSitterToolPromptSurfaces();

/**
 * Build the full prompt-surface map for all 6 tree_sitter_* tools.
 */
export function buildTreeSitterToolPromptSurfaces(): TreeSitterToolPromptSurfaceMap {
  return Object.fromEntries(
    TREE_SITTER_TOOL_SPECS.map((spec) => [
      spec.name,
      {
        description: spec.description,
        promptSnippet: spec.promptSnippet,
        promptGuidelines: [...spec.promptGuidelines],
      } satisfies TreeSitterToolPromptSurface,
    ]),
  ) as TreeSitterToolPromptSurfaceMap;
}
