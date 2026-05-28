// Tree-sitter tool guidance — prompt surfaces for tree_sitter_* tools.
//
// Derived from tool-specs.ts.

// NOTE: As of Phase 1.5, tree_sitter_* tools are no longer registered on the
// public surface. This guidance is kept for library use.

import { TREE_SITTER_TOOL_SPECS, type TreeSitterToolName } from "./tool-specs.ts";

export interface TsToolPromptSurface {
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

export type TsToolPromptSurfaceMap = Record<TreeSitterToolName, TsToolPromptSurface>;

export const defaultTsToolPromptSurfaces: TsToolPromptSurfaceMap = Object.fromEntries(
  TREE_SITTER_TOOL_SPECS.map((spec) => [
    spec.name,
    {
      description: spec.description,
      promptSnippet: spec.promptSnippet,
      promptGuidelines: [...spec.promptGuidelines],
    },
  ]),
) as TsToolPromptSurfaceMap;
