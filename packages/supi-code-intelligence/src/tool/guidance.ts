// Prompt guidance and tool descriptions for the focused code-intelligence tool surface.
//
// Each code_* tool owns its complete promptGuidelines here.
// Runtime registration data (name, parameters, run) lives in specs.ts.
//
// Cross-tool steering is centralized (authored once on its natural-home tool) and
// some tools have empty promptGuidelines by design: all code_* tools are always
// active together, so a steering bullet on one tool is always co-visible. See
// docs/adr/0013-centralized-code-intelligence-prompt-steering-assumes-all-tools-active.md.

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
      "Resolve references to evidence-backed code targets and stable targetId/spanId handles for follow-up code_* tools. Accepts query/symbol/file or anchored file+line+character; anchored resolution snaps only to real provider-backed symbols, and whitespace/comment/non-symbol points fail with code_inspect guidance. No text-search fallback; ambiguous results return ranked candidates. Truncates at 2000 lines/50KB.",
    promptSnippet: "code_resolve — resolve references into precise targets and target handles",
    promptGuidelines: [
      "Use code_resolve first for ambiguous or symbol-only targets, before graph/impact/refactor/orientation; if resolve returns ranked candidates, narrow with a candidate file + line + character.",
    ],
  },
  code_inspect: {
    description:
      "Inspect one exact file position for syntax, symbol, hover/definition, nearby diagnostics, and code-action titles. Requires file, line, and character; use for point facts, not broad orientation. Unavailable providers are disclosed; code actions are advisory only. Truncates at 2000 lines/50KB.",
    promptSnippet: "code_inspect — factual point inspection",
    // No guidelines: selection is steered by code_orientation's bullet plus this
    // self-sufficient description. See ADR 0013 (all code_* tools always active).
    promptGuidelines: [],
  },
  code_orientation: {
    description:
      "Orient around the workspace, module, directory, file, or resolved symbol before surgical work. Omit focus for workspace orientation; use focus for a path/module, or targetId/focus+line+character for symbol orientation. Directory focus may surface local instruction files (CLAUDE.md, AGENTS.md). targetId wins and stale IDs error. Returns landmarks, docs, local diagnostics, and read-next guidance; relations/impact/health belong in code_graph/code_impact/code_health. maxResults caps lists; output is truncated to 2000 lines / 50KB.",
    promptSnippet: "code_orientation — project/module/file/symbol orientation",
    promptGuidelines: [
      "Use `code_orientation({ focus })` for first-pass project/package/directory/file orientation before `bash`/`read`.",
      "Use directory focus (for example `packages/foo`) to surface local instruction files before package work.",
      "Use code_resolve first for bare symbol names, then pass the resulting targetId to code_orientation.",
      "Use code_graph/code_impact/code_health for relations, impact, or full health instead of asking code_orientation for those sections.",
    ],
  },
  code_graph: {
    description:
      'Analyze relation evidence for a resolved target or coordinates: references, structural callees, imports/exports, implementations, and tests. Defaults to references; relations:["all"] expands all families. Per-relation substrate failures are disclosed. Callees are syntax/direct-scope source-shape calls, not symbol identity; calleeDepth:"deep" includes nested scopes. Scope narrows by workspace path; targetId from code_resolve is preferred. Truncates at 2000 lines/50KB.',
    promptSnippet: "code_graph — semantic and structural relation graph",
    // No guidelines: selection is steered by this self-sufficient description plus
    // code_impact's "use code_graph instead of code_impact" bullet. See ADR 0013.
    promptGuidelines: [],
  },
  code_impact: {
    description:
      "Estimate blast radius for a resolved target or user-supplied changeSetFiles before editing. changeSetFiles are explicit files, not inferred from git and no line-level diff; change-only requests report insufficient evidence. Uses semantic references plus deterministic test discovery when available; no heuristic search fallback. Output includes read-next guidance; truncates at 2000 lines/50KB.",
    promptSnippet: "code_impact — blast radius and impact",
    promptGuidelines: [
      "Use code_graph instead of code_impact when you only need a plain reference list.",
    ],
  },
  code_find: {
    description:
      'Search code with explicit modes: text literal (default), regex, semantic workspace-symbol, or ast structured. mode:"ast" requires `kind` (definition/import/export/call/type/interface/class/method/enum/test); text/regex/semantic reject kind. Semantic mode uses LSP only and does not silently fall back. AST call matches written call-site names, not by symbol identity; use code_graph references on a resolved target for symbol-identity-aware callers. Truncates at 2000 lines/50KB.',
    promptSnippet: "code_find — unified ranked code search",
    promptGuidelines: [
      "Use code_find for explicit text, regex, semantic symbol, or AST search; use code_graph references for symbol-identity callers.",
    ],
  },
  code_refactor_plan: {
    description:
      "Preview a semantic refactor plan and return planId; never mutates files. Supports rename_symbol (rename alias) and extract_function/extract_variable when LSP returns precise edits. Requires targetId or anchored file+line+character, plus operation-specific newName/range. Apply separately with code_refactor_apply. Truncates at 2000 lines/50KB.",
    promptSnippet: "code_refactor_plan — preview a precise workflow refactor plan",
    promptGuidelines: [
      "Use code_refactor_plan to preview rename/extract edits only; mutate later with code_refactor_apply and the returned planId.",
    ],
  },
  code_refactor_apply: {
    description:
      "Apply a stored refactor plan by planId. Revalidates plan freshness and file fingerprints before mutating; does not compose new plans. Truncates at 2000 lines/50KB.",
    promptSnippet: "code_refactor_apply — apply a stored refactor plan",
    promptGuidelines: [
      "Use code_refactor_apply only with a planId returned by code_refactor_plan.",
    ],
  },
  code_health: {
    description:
      "Report workspace health: diagnostics, language-server status, dirty files, coverage, and unused code. Use scope/include/level to narrow; refresh:true recovers stale diagnostics. Missing coverage/unused reports are disclosed. Truncates at 2000 lines/50KB.",
    promptSnippet:
      "code_health — diagnostics, server status, coverage, unused-code, and workspace health",
    promptGuidelines: [
      "Use code_health for diagnostics/server/dirty/coverage/unused health; pass refresh:true to code_health before relying on stale diagnostics.",
    ],
  },
};
