// Prompt guidance and tool descriptions for the focused code-intelligence tool surface.
//
// Each code_* tool owns its complete promptGuidelines here.
// Runtime registration data (name, parameters, run) lives in specs.ts.

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
      "Resolve human or code references into precise file/range/symbol targets and stable target handles. Use when a symbol, file, or code reference is ambiguous and needs precise resolution. Returns targetId and spanId handles that can be passed to code_graph, code_impact, and code_refactor_plan. Supports anchored (file + line + character), file-only, and query/symbol inputs. Anchored coordinates resolve a real symbol target from provider-backed evidence: an exact identifier coordinate resolves to a named target; a declaration-header coordinate (e.g. an `export` keyword) snaps to the symbol name anchor only when unambiguous. Whitespace/comment/non-symbol coordinates fail honestly and recommend code_inspect. Does not fall back to text search for symbol resolution; ambiguous results return ranked candidates with target IDs for every shown item. Output is truncated to 2000 lines / 50KB.",
    promptSnippet: "code_resolve — resolve references into precise targets and target handles",
    promptGuidelines: [
      "Use code_resolve when a symbol, file, or code reference is ambiguous and needs precise resolution.",
      "Prefer code_resolve as the entry point before code_orientation, code_graph, code_impact, or code_refactor_plan — its targetId replaces fragile file/line/character coordinates.",
      "When code_resolve returns ambiguous results with ranked candidates, pick one and use file + line + character for follow-up resolution.",
    ],
  },
  code_inspect: {
    description:
      "Inspect one precise point in a file and return factual syntax, symbol, hover, definition, diagnostics, and code-action information. Use when you need to understand exactly what is at a position without choosing between provider-specific substrate tools. When some providers are unavailable, returns best-effort sections with explicit unavailable notes instead of heuristic guesses. Code action titles are advisory only — there is no tool to execute them yet. Output is truncated to 2000 lines / 50KB.",
    promptSnippet: "code_inspect — factual point inspection",
    promptGuidelines: [
      "Use code_inspect for factual point inspection at one precise file position.",
      "Provide `file`, `line`, and `character` — code_inspect is intentionally point-based.",
      "Prefer code_inspect over code_orientation for point-level facts when no symbol target can be resolved.",
    ],
  },
  code_orientation: {
    description:
      "Primary code-orientation tool for understanding a project, discovered module, directory, file, or symbol before choosing surgical follow-up tools. Use `focus` for a workspace-relative path or discovered module name; omit `focus` for project orientation. Use `focus` + `line` + `character` for symbol orientation, or pass `targetId` from `code_resolve`; `targetId` takes precedence over focus/coordinates and stale target IDs do not fall back. Symbol orientation returns definitions, JSDoc/TSDoc docs, local diagnostics near the target, and Read Next guidance; relation evidence belongs in code_graph, impact evidence in code_impact, and health/status in code_health. Not a point-inspection tool — use code_inspect for exact position facts. `maxResults` caps each rendered list and defaults to 10. Output is truncated to 2000 lines / 50KB.",
    promptSnippet: "code_orientation — project/module/file/symbol orientation",
    promptGuidelines: [
      "Use `code_orientation({ focus })` for first-pass project/package/directory/file orientation before `bash`/`read`.",
      "Use code_resolve first for bare symbol names, then pass the resulting targetId to code_orientation.",
      "Use code_graph/code_impact/code_health for relations, impact, or full health instead of asking code_orientation for those sections.",
    ],
  },
  code_graph: {
    description:
      'Unified relation-graph tool — replaces code_references, code_calls, and code_implementations. Resolves a target once and dispatches to the appropriate analysis service per requested relation. Defaults to ["references"] when `relations` is omitted. Each relation is best-effort: unavailable substrates skip with a note rather than failing the whole call. Each relation annotates its evidence source. The tests relation displays discovery provenance (semantic+conventions or conventions-only) separately from any extracted test labels. `callees` is structural/direct-scope evidence: it reports call expressions by source shape, not symbol identity, and excludes calls inside nested function/method/callback scopes — use `references` on a resolved target for identity-aware incoming callers. Pass `calleeDepth: "deep"` to include callees from nested scopes. `imports` and `exports` use file-level tree-sitter analysis; `tests` discovers companion test files and labels. Targeted graph results include Read Next guidance for source ranges worth inspecting via `read`. `scope` (not `path`) narrows by workspace-relative directory/package. Use code_resolve first to get a targetId, then pass it to code_graph. Output is truncated to 2000 lines / 50KB.',
    promptSnippet: "code_graph — semantic and structural relation graph",
    promptGuidelines: [
      "Use code_graph to find references, direct structural calls, and implementations for a target.",
      'Default `relations` is ["references"]; use `relations: ["callees"]` or `["implements"]` for those, or `relations: ["all"]` to expand to every relation family in one call.',
      "After code_graph, follow up with code_orientation on individual results for type or definition context.",
      'Pass `calleeDepth: "deep"` to include callees from nested function/method/callback scopes (default `"direct"` excludes them).',
      'Suggested relations by target kind: For functions/methods: `["references", "callees", "tests"]` — For interfaces/types/classes/enums: `["references", "implements"]` — For files/modules: `["imports", "exports"]` — For tests: `["tests"]`.',
    ],
  },
  code_impact: {
    description:
      "Estimate blast radius and downstream impact for a target or user-supplied change set before making edits. `changeSetFiles` are explicit workspace-relative files to analyze as in scope for a proposed/current change; they are not inferred from git and carry no line-level diff evidence. Uses semantic evidence for target-based impact and merges semantic references for symbols defined in change-set files when available. Includes Read Next guidance for source ranges worth inspecting via `read` before editing. Does not fall back to heuristic text search. Use a resolved target for precise semantic reference-based impact. Output is truncated to 2000 lines / 50KB.",
    promptSnippet: "code_impact — blast radius and impact",
    promptGuidelines: [
      "Use code_impact before edits to estimate blast radius and follow-up checks.",
      "Use code_graph instead of code_impact when you only need a plain reference list without impact analysis.",
    ],
  },
  code_find: {
    description:
      'Unified ranked code search with strict mode dispatch: default/`mode: "text"` is literal ripgrep, `mode: "regex"` is ripgrep regex, `mode: "semantic"` is LSP workspace-symbol search, and `mode: "ast"` is tree-sitter structured search. `mode: "ast"` requires `kind` and currently supports `definition`, `import`, `export`, `call`, `type`, `interface`, `class`, `method`, `enum`, and `test`. `mode: "text"`, `mode: "regex"`, and `mode: "semantic"` do not accept `kind`. `code_find` with `mode: "semantic"` does not silently fall back to text search, and unsupported mode/kind combinations fail. AST `call` mode matches call-site identifiers by name, not by symbol identity; use `code_graph` references for identity-aware callers of a resolved target. Output is truncated to 2000 lines / 50KB.',
    promptSnippet: "code_find — unified ranked code search",
    promptGuidelines: [
      "Use code_find as the sole code search tool for literal text, regex, semantic workspace-symbol, or AST structured search.",
      'code_find with `mode: "ast"` requires `kind` and supports `definition`, `import`, `export`, `call`, `type`, `interface`, `class`, `method`, `enum`, and `test`.',
      'code_find with `mode: "text"`, `mode: "regex"`, or `mode: "semantic"` does not accept `kind`.',
      'code_find with `mode: "semantic"` does not fall back to text search and fails when semantic capability is unavailable.',
      'AST `call` mode matches call-site identifiers by name only; use `code_graph` with `relations: ["references"]` on a resolved target for symbol-identity-aware callers.',
    ],
  },
  code_refactor_plan: {
    description:
      'Pure planner: previews a precise semantic refactor plan without mutating files and returns a planId for later use with code_refactor_apply. Supports rename_symbol plus extract_function/extract_variable when the active LSP can return precise edits. Legacy `operation: "rename"` is accepted as a compatibility alias. This tool never mutates files. Output is truncated to 2000 lines / 50KB.',
    promptSnippet: "code_refactor_plan — preview a precise workflow refactor plan",
    promptGuidelines: [
      'Use `operation: "rename_symbol"` with code_refactor_plan for symbol renames. Legacy `operation: "rename"` is accepted as a compatibility alias.',
      'Use `operation: "extract_function"` or `"extract_variable"` with a 1-based `range` and `newName` when the LSP advertises precise extract code actions.',
      "code_refactor_plan is a pure planner — it returns a planId. Use code_refactor_apply with that planId to execute.",
    ],
  },
  code_refactor_apply: {
    description:
      "Sole mutator in the refactor workflow: applies a previously stored plan by planId. Revalidates the plan and checks file fingerprints, mutating files only when the plan is still fresh. Output is truncated to 2000 lines / 50KB.",
    promptSnippet: "code_refactor_apply — apply a stored refactor plan",
    promptGuidelines: [
      "Use code_refactor_apply to execute a plan generated by code_refactor_plan.",
      "Use code_refactor_plan first to obtain a planId, then code_refactor_apply to execute it.",
    ],
  },
  code_health: {
    description:
      "Summarize diagnostics, language server status, dirty workspace signals, coverage, and unused-code findings. Pass refresh: true to recover stale diagnostics before checking. Use scope to narrow to a specific file or package. Use include to request specific sections: diagnostics, servers, dirty, coverage, unused. Defaults to summary level (counts); use level: detailed for per-file listings. Output is truncated to 2000 lines / 50KB.",
    promptSnippet:
      "code_health — diagnostics, server status, coverage, unused-code, and workspace health",
    promptGuidelines: [
      "Use code_health to check for diagnostics, language server status, dirty workspace state, coverage, or unused-code signals.",
      "Pass `refresh: true` to code_health to recover stale diagnostics before checking.",
    ],
  },
};
