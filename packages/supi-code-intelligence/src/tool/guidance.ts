// Model-facing descriptions and concise sibling-selection guidance.

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
      "Resolve exactly one evidence-backed target source. target accepts one key: anchor ({file,line,character}), symbol ({query,scope?,symbolKind?}), or file. symbolKind is an exact provider-reported LSP kind filter; mismatches return bounded near-match handles with exact omission metadata. Anchor/symbol selectors return handles; a file selector enumerates all declarations but materializes handles only for a bounded Target group with exact omission metadata, discovery provenance, and per-member provider provenance. Overloads remain distinct. Anchors snap only to real provider-backed symbols; symbol lookup never falls back to text search. Target establishment requires a concrete ready LSP client.",
    promptSnippet: "code_resolve — resolve a precise target or enumerate a file’s target group",
    promptGuidelines: [
      "Use code_resolve when a symbol query may be ambiguous, when later calls should share a stable target handle, or when a known file’s declarations should be enumerated.",
    ],
  },
  code_inspect: {
    description:
      "Inspect one exact point ({file,line,character}) for syntax, enclosing symbol, hover, definition, nearby diagnostics, and advisory code-action titles. Use for point facts rather than broad Orientation. Missing substrates are disclosed and no code action is applied.",
    promptSnippet: "code_inspect — factual point inspection",
    promptGuidelines: [],
  },
  code_orientation: {
    description:
      "Orient around the workspace or one exact focus before surgical work. Omit focus for workspace Orientation; otherwise choose one focus key: path, module, or target. focus.target accepts one handle, anchor, or symbol selector. Directory focus may surface local instruction files. Relation evidence belongs to code_graph and health belongs to code_health.",
    promptSnippet: "code_orientation — workspace/path/module/symbol Orientation",
    promptGuidelines: [
      "Use code_orientation before broad file reading when you need project, package, directory, file, or symbol landmarks.",
      "Use focus.path for a known workspace path, focus.module for a discovered module name, and focus.target for a precise symbol.",
      "Use code_graph for relationships and code_health for provider or diagnostic state.",
    ],
  },
  code_graph: {
    description:
      'Collect relation evidence for exactly one target.handle, target.anchor, or target.symbol. Relations are references, structural callees, and implementations; defaults to references and relations:["all"] expands exactly those three. "all" cannot be mixed with named relations. Callees are source-shape calls, not symbol identity; calleeDepth:"deep" includes nested scopes. Per-relation failures are disclosed without inventing edges.',
    promptSnippet: "code_graph — provider-backed and structural relation evidence",
    promptGuidelines: [],
  },
  code_find: {
    description:
      'Search explicit evidence using text literal (default), regex, semantic workspace symbols, or ast structure. scope is a non-empty array of workspace-relative paths. mode:"ast" requires kind (definition/import/export/call/type/interface/class/method/enum/test); other modes reject kind. Modes never silently fall back. AST call matches written names, not symbol identity.',
    promptSnippet: "code_find — explicit text, regex, structural, or semantic search",
    promptGuidelines: [
      "Use code_find for direct search evidence; use code_graph references for symbol-identity relationships.",
    ],
  },
  code_health: {
    description:
      "Report live diagnostics, language-server status, final semantic health state, and dirty files. scope/include/level narrow the report; refresh:true attempts diagnostic recovery before semantic state is finalized. Server inventory is status evidence, not proof that semantic operations are ready; unavailable inventory is not reported as empty. Capability Warnings supplement diagnostic/server requests and are not an include section.",
    promptSnippet: "code_health — live workspace health observations",
    promptGuidelines: [
      "Use code_health with refresh:true before relying on potentially stale diagnostics.",
    ],
  },
  code_refactor_plan: {
    description:
      "Preview one precise semantic refactor and return a planId without mutating files. target accepts exactly one handle or anchor. operation accepts exactly one rename_symbol ({newName}), extract_function ({newName,range}), or extract_variable ({newName,range}) payload. Unavailable precise edits fail without text fallback.",
    promptSnippet: "code_refactor_plan — preview a precise semantic refactor",
    promptGuidelines: [
      "Use code_refactor_plan for preview only, then explicitly call code_refactor_apply with its planId.",
    ],
  },
  code_refactor_apply: {
    description:
      "Apply one stored refactor plan by planId. Revalidates plan freshness, file fingerprints, ranges, and overlap inside sorted per-file mutation queues. It does not compose or silently regenerate plans.",
    promptSnippet: "code_refactor_apply — apply a fresh stored refactor plan",
    promptGuidelines: [
      "Use code_refactor_apply only with a planId returned by code_refactor_plan.",
    ],
  },
};
