import type { WorkflowCodeToolName } from "./names.ts";
import type { WorkflowCodeToolSchemaKey } from "./schemas.ts";

/** Future implementation substrate families used by the workflow-oriented V2 surface. */
export type WorkflowSubstrate = "semantic" | "structural" | "search" | "git" | "diagnostics";

/** Future roadmap phase that is expected to introduce or activate one tool. */
export type WorkflowPhase = "phase-1" | "phase-2" | "phase-3" | "phase-4" | "phase-5" | "phase-6";

/** Planned metadata for one V2 workflow tool. */
export interface WorkflowCodeToolSpec {
  name: WorkflowCodeToolName;
  purpose: string;
  schemaKey: WorkflowCodeToolSchemaKey;
  schemaDocs: string;
  absorbsTools: string[];
  absorbsBehaviors: string[];
  substrates: WorkflowSubstrate[];
  phase: WorkflowPhase;
  nonGoals: string[];
}

/**
 * Planned V2 workflow surface.
 *
 * Each entry captures:
 * - the workflow intent
 * - which current public tools and public-facing behaviors it is expected to absorb
 * - which substrate families will likely power the implementation
 * - a concise schema summary for future maintainers and tests
 */
export const WORKFLOW_CODE_TOOL_SPECS = [
  {
    name: "code_resolve",
    purpose:
      "Resolve human or code references into precise file/range/symbol targets and stable target handles.",
    schemaKey: "code_resolve",
    schemaDocs:
      "Accepts a query or file-based anchor plus optional scope/kind/maxResults. Later phases validate that line/character require file.",
    absorbsTools: [],
    absorbsBehaviors: [],
    substrates: ["semantic", "search"],
    phase: "phase-1",
    nonGoals: [
      "Phase 1 registers code_resolve as the first active workflow tool.",
      "Does not persist target handles across sessions yet.",
    ],
  },
  {
    name: "code_context",
    purpose:
      "Provide task-focused context bundles with prioritized definitions, relationships, tests, docs, and diagnostics.",
    schemaKey: "code_context",
    schemaDocs:
      "Accepts optional task, targetId, scope, budget, include sections, and maxResults. It is the planned workflow successor to orientation-style briefs.",
    absorbsTools: ["code_brief"],
    absorbsBehaviors: [],
    substrates: ["semantic", "structural", "search", "diagnostics"],
    phase: "phase-2",
    nonGoals: [
      "Does not replace code_brief in Phase 0.",
      "Does not promise arbitrary natural-language planning or edit generation.",
    ],
  },
  {
    name: "code_find",
    purpose:
      "Run unified ranked search across literal text, regex, AST, and semantic modes with one intent-level surface.",
    schemaKey: "code_find",
    schemaDocs:
      "Requires query and supports scope, mode, kind, contextLines, and maxResults. Phase 0 excludes speculative natural-language mode.",
    absorbsTools: ["code_pattern"],
    absorbsBehaviors: [],
    substrates: ["semantic", "structural", "search"],
    phase: "phase-2",
    nonGoals: [
      "Does not activate natural-language retrieval without a real implementation.",
      "Removed code_pattern in Phase 2b (TNDM-057XHJ).",
    ],
  },
  {
    name: "code_graph",
    purpose:
      "Show the graph of relationships touching a target, including references, callees, imports, exports, implementations, and tests.",
    schemaKey: "code_graph",
    schemaDocs:
      "Accepts targetId plus relations, direction, depth, and maxNodes. The Phase 0 contract uses references rather than misleading callers labels.",
    absorbsTools: ["code_references", "code_calls", "code_implementations"],
    absorbsBehaviors: [],
    substrates: ["semantic", "structural", "search"],
    phase: "phase-3",
    nonGoals: [
      "Does not claim true incoming caller support until a real call hierarchy exists.",
      "Does not collapse unrelated impact or search concerns into the graph surface.",
    ],
  },
  {
    name: "code_impact",
    purpose:
      "Estimate blast radius for a target, dirty files, or a proposed change description, including likely tests and docs.",
    schemaKey: "code_impact",
    schemaDocs:
      "Accepts targetId, change, or changedFiles plus baseRef/includeTests/maxResults. Runtime validation later requires at least one primary subject.",
    absorbsTools: ["code_affected"],
    absorbsBehaviors: [],
    substrates: ["semantic", "search", "git", "diagnostics"],
    phase: "phase-4",
    nonGoals: [
      "Does not rename or replace code_affected in Phase 0.",
      "Does not guarantee perfect downstream impact inference without substrate evidence.",
    ],
  },
  {
    name: "code_refactor",
    purpose:
      "Create precise refactor plans for named operations such as rename, move, import updates, and dead-code removal.",
    schemaKey: "code_refactor",
    schemaDocs:
      "Uses a scoped operation enum with target/file coordinates and operation-specific options. This is the only intentional operation-style schema in the V2 skeleton.",
    absorbsTools: ["code_refactor_plan"],
    absorbsBehaviors: [],
    substrates: ["semantic", "structural", "search"],
    phase: "phase-5",
    nonGoals: [
      "Does not introduce a broad action mega-tool.",
      "Does not apply edits directly in Phase 0.",
    ],
  },
  {
    name: "code_apply",
    purpose: "Apply a previously stored plan through explicit, fingerprint-checked mutation modes.",
    schemaKey: "code_apply",
    schemaDocs:
      "Requires a planId and optional apply mode. Later phases must enforce stale-plan rejection, validation, and rollback semantics.",
    absorbsTools: ["code_refactor_apply"],
    absorbsBehaviors: [],
    substrates: ["semantic", "search", "git"],
    phase: "phase-5",
    nonGoals: [
      "Does not register or mutate anything in Phase 0.",
      "Does not bypass plan validation or fingerprint checks.",
    ],
  },
  {
    name: "code_health",
    purpose:
      "Summarize diagnostics, provider state, dirty workspace signals, and maintenance cues from one workflow-oriented health surface.",
    schemaKey: "code_health",
    schemaDocs:
      "Accepts scope, refresh, include sections, and detail level. It is the planned replacement for direct public diagnostic and recovery substrate access.",
    absorbsTools: ["lsp_diagnostics", "lsp_recover"],
    absorbsBehaviors: ["ci-status summary"],
    substrates: ["semantic", "search", "git", "diagnostics"],
    phase: "phase-6",
    nonGoals: [
      "Removed public lsp_* and tree_sitter_* tools in Phase 1.5 (TNDM-A9AQF4).",
      "Does not act as a generic verification/test runner.",
    ],
  },
] as const satisfies readonly WorkflowCodeToolSpec[];
