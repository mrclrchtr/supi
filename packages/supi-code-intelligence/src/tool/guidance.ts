// Model-facing descriptions and concise sibling-selection guidance.

import {
  DEFAULT_AST_SCAN_MAX_FILES,
  DEFAULT_AST_SCAN_TIMEOUT_MS,
} from "../analysis/search/ast-scan.ts";
import type { CodeIntelligenceToolName } from "../types/index.ts";

const AST_SCAN_TIMEOUT_SECONDS = DEFAULT_AST_SCAN_TIMEOUT_MS / 1_000;

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
      "Resolve one provider-backed anchor or semantic symbol query to session handles, or enumerate a file's declarations as a bounded Target group. Requires a concrete ready LSP client; anchors must identify real symbols, and symbol lookup never falls back to text search. symbolKind is an exact provider-reported LSP kind filter. File groups keep overloads distinct and disclose omissions and provenance.",
    promptSnippet: "code_resolve — resolve a precise target or enumerate a file’s target group",
    promptGuidelines: [
      "Use code_resolve when a symbol query may be ambiguous, when later calls should share a stable target handle, or when a known file’s declarations should be enumerated.",
    ],
  },
  code_inspect: {
    description:
      "Inspect one exact point for syntax, enclosing symbol, hover, definition, nearby diagnostics, and advisory code-action titles. Use for point facts, not broad Orientation. Unavailable substrates are disclosed; no action is applied.",
    promptSnippet: "code_inspect — factual point inspection",
    promptGuidelines: [],
  },
  code_orientation: {
    description:
      "Orient around the workspace or one path, module, or target focus before surgical work. Omit focus for workspace Orientation. Directory focus may surface local instruction files. Use code_graph for relations and code_health for health.",
    promptSnippet: "code_orientation — workspace/path/module/symbol Orientation",
    promptGuidelines: [
      "Use code_orientation before broad file reading when you need project, package, directory, file, or symbol landmarks.",
      "Use focus.path for a known workspace path, focus.module for a discovered module name, and focus.target for a precise symbol.",
      "Use code_graph for relationships and code_health for provider or diagnostic state.",
    ],
  },
  code_graph: {
    description:
      'Collect references, structural callees, and implementations for one target. Defaults to references; "all" selects all three. Callees match source shape, not symbol identity; calleeDepth:"deep" includes nested scopes. Per-relation failures are disclosed; no edges are invented.',
    promptSnippet: "code_graph — provider-backed and structural relation evidence",
    promptGuidelines: [],
  },
  code_find: {
    description: `Search source shape with mode:"ast" or LSP workspace symbols with mode:"semantic"; AST requires kind. Use PI grep for literal/regex source search. Modes never silently fall back. Unscoped AST scans visible, Tree-sitter-supported regular files, excluding hidden entries and common generated/dependency directories without reading ignore files or following descendant symlinks. Explicit roots are honored; ineligible scopes fail rather than widening. A ${AST_SCAN_TIMEOUT_SECONDS}-second deadline and ${DEFAULT_AST_SCAN_MAX_FILES}-file cap cover enumeration and analysis. Incomplete scans disclose limitations and unknown match totals.`,
    promptSnippet: "code_find — explicit structural or semantic code search",
    promptGuidelines: [
      "Use code_find for structural or semantic search evidence; use PI grep for literal/regex source search and code_graph references for symbol-identity relationships.",
    ],
  },
  code_health: {
    description:
      "Report live diagnostics, language-server status, final semantic health state, and dirty files. Use refresh:true to attempt diagnostic recovery before finalizing semantic state. Server inventory does not prove semantic readiness, and unavailable inventory is not reported as empty. Capability Warnings supplement diagnostic/server results.",
    promptSnippet: "code_health — live workspace health observations",
    promptGuidelines: [
      "Use code_health with refresh:true before relying on potentially stale diagnostics.",
    ],
  },
  code_refactor_plan: {
    description:
      "Preview a precise semantic rename or extraction and return a planId without mutating files. Requires one handle/anchor target and one operation; unavailable precise edits never fall back to text edits. Apply separately with code_refactor_apply.",
    promptSnippet: "code_refactor_plan — preview a precise semantic refactor",
    promptGuidelines: [
      "Use code_refactor_plan for preview only, then explicitly call code_refactor_apply with its planId.",
    ],
  },
  code_refactor_apply: {
    description:
      "Apply one stored refactor plan by planId. Revalidates freshness, file fingerprints, ranges, and edit overlap before mutation; never composes or regenerates plans.",
    promptSnippet: "code_refactor_apply — apply a fresh stored refactor plan",
    promptGuidelines: [
      "Use code_refactor_apply only with a planId returned by code_refactor_plan.",
    ],
  },
};
