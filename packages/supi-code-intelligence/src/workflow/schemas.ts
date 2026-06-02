import { StringEnum } from "@earendil-works/pi-ai";
import { type TSchema, Type } from "typebox";
import type { WorkflowCodeToolName } from "./names.ts";

const ScopeParam = Type.String({
  description: "Workspace-relative path, package, or directory scope for the workflow query.",
});
const FileParam = Type.String({ description: "Target file path." });
const QueryParam = Type.String({
  description: "Human or code reference to resolve or search for.",
});
const LineParam = Type.Number({ description: "1-based line.", minimum: 1 });
const CharacterParam = Type.Number({
  description: "1-based UTF-16 column.",
  minimum: 1,
});
const MaxResultsParam = Type.Number({
  description: "Maximum number of ranked results.",
  minimum: 1,
});
const SymbolParam = Type.String({ description: "Symbol name" });
const TargetIdParam = Type.String({
  description:
    "Resolved target handle from `code_resolve`. Takes precedence over file/line/character/symbol.",
});

/**
 * Planned `code_resolve` parameters.
 *
 * Runtime rule for future executors:
 * - require `query` or `file`
 * - require `file` when `line` or `character` is provided
 */
export const CodeResolveParameters = Type.Object(
  {
    query: Type.Optional(QueryParam),
    scope: Type.Optional(ScopeParam),
    kind: Type.Optional(
      StringEnum(
        [
          "symbol",
          "function",
          "class",
          "interface",
          "type",
          "file",
          "export",
          "variable",
          "method",
          "const",
          "let",
          "enum",
        ],
        {
          description: "Preferred target kind when disambiguating the query.",
        },
      ),
    ),
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

/** Planned `code_inspect` parameters. Requires a precise point in one file. */
export const CodeInspectParameters = Type.Object(
  {
    file: FileParam,
    line: LineParam,
    character: CharacterParam,
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

/**
 * Planned `code_context` parameters.
 *
 * Runtime rule for future executors:
 * - allow plain orientation when `task` is omitted
 * - prefer `targetId` over raw coordinates once Phase 1 handle resolution exists
 */
export const CodeContextParameters = Type.Object(
  {
    task: Type.Optional(
      Type.String({ description: "Task-oriented request describing the change or question." }),
    ),
    targetId: Type.Optional(
      Type.String({ description: "Resolved target handle from `code_resolve`." }),
    ),
    scope: Type.Optional(ScopeParam),
    budget: Type.Optional(
      StringEnum(["small", "medium", "large"], {
        description:
          "Context budget: small=3, medium=8, large=15 results per section. Smaller values prefer fewer, higher-signal items.",
      }),
    ),
    include: Type.Optional(
      Type.Array(
        StringEnum(
          ["defs", "references", "callees", "tests", "docs", "diagnostics", "exports", "imports"],
          {
            description: "Context sections to include in the bundle.",
          },
        ),
        {
          description: "Explicit context sections to include.",
          uniqueItems: true,
        },
      ),
    ),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

/**
 * Planned `code_find` parameters.
 *
 * Phase 0 intentionally excludes speculative natural-language search. A future phase
 * may add it only after a real implementation exists.
 */
export const CodeFindParameters = Type.Object(
  {
    query: QueryParam,
    scope: Type.Optional(ScopeParam),
    mode: Type.Optional(
      StringEnum(["text", "regex", "ast", "semantic"], {
        description: "Search mode. Defaults to literal text search when omitted.",
      }),
    ),
    kind: Type.Optional(
      StringEnum(["definition", "import", "export", "call", "type", "test"], {
        description: "Preferred result kind for ranked search results.",
      }),
    ),
    contextLines: Type.Optional(
      Type.Number({ description: "Context lines to include around matches.", minimum: 0 }),
    ),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

/**
 * `code_graph` parameters.
 *
 * Phase 0 uses `references` rather than `callers` so the public contract stays honest
 * until a true incoming-call hierarchy exists.
 *
 * Runtime rule for future executors:
 * - require `targetId`, `file` + `line` + `character`, `symbol`, or `path`
 */
export const CodeGraphParameters = Type.Object(
  {
    targetId: Type.Optional(TargetIdParam),
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    symbol: Type.Optional(SymbolParam),
    path: Type.Optional(ScopeParam),
    relations: Type.Optional(
      Type.Array(
        StringEnum(["references", "callees", "imports", "exports", "implements", "tests"], {
          description: "Relation families to include in the graph.",
        }),
        {
          description: 'Requested relation families. Defaults to ["references"] when omitted.',
          uniqueItems: true,
        },
      ),
    ),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

/**
 * Planned `code_impact` parameters.
 *
 * Runtime rule for future executors:
 * - require at least one of `targetId`, `change`, or `changedFiles`
 */
export const CodeImpactParameters = Type.Object(
  {
    targetId: Type.Optional(
      Type.String({ description: "Resolved target handle from `code_resolve`." }),
    ),
    change: Type.Optional(
      Type.String({ description: "Proposed change description for blast-radius analysis." }),
    ),
    changedFiles: Type.Optional(
      Type.Array(Type.String({ description: "Changed file path." }), {
        description: "Dirty or proposed changed files to analyze.",
        minItems: 1,
        uniqueItems: true,
      }),
    ),
    includeTests: Type.Optional(
      Type.Boolean({ description: "Whether likely tests should be included in the impact set." }),
    ),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

/**
 * Planned `code_refactor` parameters.
 *
 * `operation` is the only intentional operation-style enum in the V2 skeleton.
 * Phase 0 does not introduce a generic action mega-tool.
 *
 * Runtime rules for future executors:
 * - require `targetId` or anchored `file` + `line` + `character`
 * - `rename` (legacy alias) and `rename_symbol` require `newName`
 */
export const CodeRefactorParameters = Type.Object(
  {
    operation: StringEnum(["rename", "rename_symbol"], {
      description:
        "Precise refactor operation to preview or plan. `rename` is accepted as a compatibility alias for `rename_symbol`.",
    }),
    targetId: Type.Optional(
      Type.String({ description: "Resolved target handle from `code_resolve`." }),
    ),
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    newName: Type.Optional(Type.String({ description: "New symbol name for rename operations." })),
    preview: Type.Optional(
      Type.Boolean({ description: "Whether to return a preview-only plan when supported." }),
    ),
  },
  { additionalProperties: false },
);

/** Planned `code_apply` parameters. `planId` is required. */
export const CodeApplyParameters = Type.Object(
  {
    planId: Type.String({
      description: "Stored plan identifier returned by a previous refactor/plan step.",
    }),
    mode: Type.Optional(
      StringEnum(["apply"], {
        description: "Application mode for a stored plan. Only `apply` is supported in this phase.",
      }),
    ),
  },
  { additionalProperties: false },
);

/**
 * Planned `code_health` parameters.
 *
 * This is the future diagnostics/status surface that will eventually replace direct
 * public substrate diagnostics and recovery tools.
 */
export const CodeHealthParameters = Type.Object(
  {
    scope: Type.Optional(ScopeParam),
    refresh: Type.Optional(
      Type.Boolean({ description: "Refresh provider state before collecting health data." }),
    ),
    include: Type.Optional(
      Type.Array(
        StringEnum(["diagnostics", "servers", "dirty", "coverage", "unused"], {
          description: "Health signals to include.",
        }),
        {
          description: "Requested health-signal sections.",
          uniqueItems: true,
        },
      ),
    ),
    level: Type.Optional(
      StringEnum(["summary", "detailed"], {
        description: "Detail level for the health report.",
      }),
    ),
  },
  { additionalProperties: false },
);

export type WorkflowCodeToolSchemaKey = WorkflowCodeToolName;

/** Planned V2 schemas keyed by future public tool name. */
export const WORKFLOW_CODE_TOOL_SCHEMAS = {
  code_resolve: CodeResolveParameters,
  code_inspect: CodeInspectParameters,
  code_context: CodeContextParameters,
  code_find: CodeFindParameters,
  code_graph: CodeGraphParameters,
  code_impact: CodeImpactParameters,
  code_refactor: CodeRefactorParameters,
  code_apply: CodeApplyParameters,
  code_health: CodeHealthParameters,
} as const satisfies Record<WorkflowCodeToolSchemaKey, TSchema>;
