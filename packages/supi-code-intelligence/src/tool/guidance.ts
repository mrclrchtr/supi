// Model-facing prompt surfaces for the eight public code-intelligence tools.
//
// Ownership map (docs/pi/tool-guidance.md): each model-facing fact lives in
// exactly one home — the per-tool guidance module. This aggregator assembles
// the canonical surface map consumed by registration.
// Parameter mechanics (formats, enum semantics, cross-field rules) live in
// schemas.ts / per-tool spec.ts and are not repeated here.

import type { CodeIntelligenceToolName } from "../types/index.ts";
import {
  toolDescription as findDescription,
  promptGuidelines as findGuidelines,
  promptSnippet as findSnippet,
} from "./code_find/guidance.ts";
import {
  toolDescription as graphDescription,
  promptGuidelines as graphGuidelines,
  promptSnippet as graphSnippet,
} from "./code_graph/guidance.ts";
import {
  toolDescription as healthDescription,
  promptGuidelines as healthGuidelines,
  promptSnippet as healthSnippet,
} from "./code_health/guidance.ts";
import {
  toolDescription as inspectDescription,
  promptGuidelines as inspectGuidelines,
  promptSnippet as inspectSnippet,
} from "./code_inspect/guidance.ts";
import {
  toolDescription as orientationDescription,
  promptGuidelines as orientationGuidelines,
  promptSnippet as orientationSnippet,
} from "./code_orientation/guidance.ts";
import {
  toolDescription as applyDescription,
  promptGuidelines as applyGuidelines,
  promptSnippet as applySnippet,
} from "./code_refactor_apply/guidance.ts";
import {
  toolDescription as planDescription,
  promptGuidelines as planGuidelines,
  promptSnippet as planSnippet,
} from "./code_refactor_plan/guidance.ts";
import {
  toolDescription as resolveDescription,
  promptGuidelines as resolveGuidelines,
  promptSnippet as resolveSnippet,
} from "./code_resolve/guidance.ts";

export interface CodeIntelligenceToolPromptSurface {
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
}

export type CodeIntelligenceToolPromptSurfaceMap = Record<
  CodeIntelligenceToolName,
  CodeIntelligenceToolPromptSurface
>;

export const CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES: CodeIntelligenceToolPromptSurfaceMap = {
  code_resolve: {
    description: resolveDescription,
    promptSnippet: resolveSnippet,
    promptGuidelines: resolveGuidelines,
  },
  code_inspect: {
    description: inspectDescription,
    promptSnippet: inspectSnippet,
    promptGuidelines: inspectGuidelines,
  },
  code_orientation: {
    description: orientationDescription,
    promptSnippet: orientationSnippet,
    promptGuidelines: orientationGuidelines,
  },
  code_graph: {
    description: graphDescription,
    promptSnippet: graphSnippet,
    promptGuidelines: graphGuidelines,
  },
  code_find: {
    description: findDescription,
    promptSnippet: findSnippet,
    promptGuidelines: findGuidelines,
  },
  code_health: {
    description: healthDescription,
    promptSnippet: healthSnippet,
    promptGuidelines: healthGuidelines,
  },
  code_refactor_plan: {
    description: planDescription,
    promptSnippet: planSnippet,
    promptGuidelines: planGuidelines,
  },
  code_refactor_apply: {
    description: applyDescription,
    promptSnippet: applySnippet,
    promptGuidelines: applyGuidelines,
  },
};
