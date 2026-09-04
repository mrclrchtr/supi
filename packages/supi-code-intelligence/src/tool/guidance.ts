/**
 * Each tool owns its model-facing text. This module assembles the canonical
 * surface map used by registration. Parameter mechanics stay in specs and
 * shared schemas.
 */

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

/** Model-facing fields registered for one public code-intelligence tool. */
export interface CodeIntelligenceToolPromptSurface {
  /** Selection contract in the active provider tool definition. */
  description: string;
  /** One-line capability phrase in the default tool list. */
  promptSnippet: string;
  /** Optional active-tool routing or ordering reminders. */
  promptGuidelines: string[];
}

export type CodeIntelligenceToolPromptSurfaceMap = Record<
  CodeIntelligenceToolName,
  CodeIntelligenceToolPromptSurface
>;

export const CODE_INTELLIGENCE_TOOL_PROMPT_SURFACES = {
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
} satisfies CodeIntelligenceToolPromptSurfaceMap;
