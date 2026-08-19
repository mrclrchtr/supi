// Model-facing prompt surfaces for the eight public code-intelligence tools.
//
// Ownership map (docs/pi/tool-guidance.md): each model-facing fact lives in
// exactly one home.
// - description: selection rules, preconditions, no-fallback contracts
// - promptSnippet: one capability phrase
// - promptGuidelines: cross-tool routing and ordering; every bullet names its tool
// Parameter mechanics (formats, enum semantics, cross-field rules) live in
// schemas.ts and are not repeated here.

import type { CodeIntelligenceToolName } from "../types/index.ts";

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
    description:
      "Resolve one provider-backed anchor or semantic symbol query to session handles, or enumerate a file's declarations as a bounded Target group. Anchors must identify real symbols",
    promptSnippet: "resolve a precise target or enumerate a file’s target group",
    promptGuidelines: [
      "Use code_resolve when a symbol query may be ambiguous, when later calls should share a stable target handle, or when a known file’s declarations should be enumerated.",
    ],
  },
  code_inspect: {
    description:
      "Inspect one exact point for syntax, the narrowest enclosing declaration, hover, definition, and nearby diagnostics. Use for point facts, not broad Orientation.",
    promptSnippet: "factual point inspection",
    promptGuidelines: [],
  },
  code_orientation: {
    description:
      "Orient around the workspace or one path, module, or target focus before surgical work. Omit focus for workspace Orientation. Directory focus may surface local instruction files.",
    promptSnippet: "workspace/path/module/symbol Orientation",
    promptGuidelines: [
      "Use code_orientation before broad file reading when you need direct workspace, package, directory, file, or symbol facts.",
      "Use code_graph for relationships and code_health for provider or diagnostic state.",
    ],
  },
  code_graph: {
    description:
      "Collect references, structural callees, and implementations for one target. Callees match source shape, not symbol identity.",
    promptSnippet: "provider-backed and structural relation evidence",
    promptGuidelines: [],
  },
  code_find: {
    description:
      'Search source shape with mode:"ast" or LSP workspace symbols with mode:"semantic". Modes never silently fall back. Unscoped AST scans cover visible supported files, skipping hidden and generated/dependency directories.',
    promptSnippet: "explicit structural or semantic code search",
    promptGuidelines: [
      "Use code_find for structural or semantic search evidence; use PI grep for literal/regex source search and code_graph references for symbol-identity relationships.",
    ],
  },
  code_health: {
    description:
      "Report live diagnostics as observations, language-server status, and final semantic health state. Tracked-file snapshots do not prove workspace completeness; server inventory is workspace-wide.",
    promptSnippet: "live workspace health observations",
    promptGuidelines: [
      "Use code_health with refresh:true before relying on potentially stale diagnostics.",
    ],
  },
  code_refactor_plan: {
    description:
      "Preview one semantic rename or extraction and return a planId without mutating files.",
    promptSnippet: "preview a precise semantic refactor",
    promptGuidelines: [
      "Use code_refactor_plan for preview only, then call code_refactor_apply with its planId.",
    ],
  },
  code_refactor_apply: {
    description: "Apply one stored refactor plan by planId.",
    promptSnippet: "apply a fresh stored refactor plan",
    promptGuidelines: [],
  },
};
