import { StringEnum } from "@earendil-works/pi-ai";
import { type TSchema, Type } from "typebox";
import type { CodeIntelligenceToolName } from "../types/index.ts";

const ScopeParam = Type.String({
  description: "Workspace-relative file or directory scope.",
});
const FindScopeParam = Type.Union(
  [
    Type.String({
      description: "Workspace-relative search scope.",
    }),
    Type.Array(
      Type.String({
        description: "Workspace-relative search scope.",
      }),
      {
        description: "One or more workspace-relative search scopes.",
        minItems: 1,
        uniqueItems: true,
      },
    ),
  ],
  {
    description: "Workspace-relative search scope or scope list.",
  },
);
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
  description: "Maximum results.",
  minimum: 1,
});
const SymbolParam = Type.String({ description: "Symbol name" });
const TargetIdParam = Type.String({
  description:
    "Resolved target handle from `code_resolve`; takes precedence over other target inputs.",
});
const RangeParam = Type.Object(
  {
    start: Type.Object({ line: LineParam, character: CharacterParam }),
    end: Type.Object({ line: LineParam, character: CharacterParam }),
  },
  { description: "1-based selected source range for extract refactors." },
);

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
          "file",
          "export",
          "variable",
          "method",
          "const",
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
 * `code_orientation` parameters.
 *
 * Runtime rules:
 * - no focus means workspace-level orientation
 * - `focus` is a workspace-relative path or discovered module name
 * - `focus` + `line` + `character` resolves a real symbol target through the same path as `code_resolve`
 * - `targetId` takes precedence over focus/coordinates; stale target IDs do not fall back
 */
export const CodeOrientationParameters = Type.Object(
  {
    focus: Type.Optional(
      Type.String({
        description: "Workspace-relative path or module name; omit for workspace orientation.",
      }),
    ),
    targetId: Type.Optional(
      Type.String({
        description: "Resolved target handle; takes precedence, stale IDs error.",
      }),
    ),
    line: Type.Optional(
      Type.Number({
        description: "1-based line for symbol orientation with `focus`.",
        minimum: 1,
      }),
    ),
    character: Type.Optional(
      Type.Number({
        description: "1-based UTF-16 column for symbol orientation with `focus`.",
        minimum: 1,
      }),
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
    scope: Type.Optional(FindScopeParam),
    mode: Type.Optional(
      StringEnum(["text", "regex", "ast", "semantic"], {
        description: 'Search mode; omit for literal text. mode:"ast" requires `kind`.',
      }),
    ),
    kind: Type.Optional(
      StringEnum(
        [
          "definition",
          "import",
          "export",
          "call",
          "type",
          "interface",
          "class",
          "method",
          "enum",
          "test",
        ],
        {
          description: 'AST kind; only valid with mode:"ast".',
        },
      ),
    ),
    contextLines: Type.Optional(
      Type.Number({ description: "Context lines around matches.", minimum: 0 }),
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
 * - require `targetId`, `file` + `line` + `character`, `symbol`, or `scope`
 */
export const CodeGraphParameters = Type.Object(
  {
    targetId: Type.Optional(TargetIdParam),
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    symbol: Type.Optional(SymbolParam),
    scope: Type.Optional(ScopeParam),
    relations: Type.Optional(
      Type.Array(
        StringEnum(["all", "references", "callees", "imports", "exports", "implements", "tests"], {
          description: "Relation family.",
        }),
        {
          description: 'Requested relation families; defaults to ["references"].',
          uniqueItems: true,
        },
      ),
    ),
    maxResults: Type.Optional(MaxResultsParam),
    calleeDepth: Type.Optional(
      StringEnum(["direct", "deep"], {
        description: '`"direct"` excludes nested scopes; `"deep"` includes them.',
      }),
    ),
  },
  { additionalProperties: false },
);

/**
 * Planned `code_impact` parameters.
 *
 * Runtime rule for future executors:
 * - require at least one of `targetId`, `change`, or `changeSetFiles`
 */
export const CodeImpactParameters = Type.Object(
  {
    targetId: Type.Optional(
      Type.String({ description: "Resolved target handle from `code_resolve`." }),
    ),
    change: Type.Optional(
      Type.String({ description: "Proposed change description for blast-radius analysis." }),
    ),
    changeSetFiles: Type.Optional(
      Type.Array(Type.String({ description: "Workspace-relative file in the change set." }), {
        description: "Explicit change-set files; not inferred from git and no line-level diff.",
        minItems: 1,
        uniqueItems: true,
      }),
    ),
    includeTests: Type.Optional(
      Type.Boolean({
        description:
          "Include likely tests using semantic references and deterministic conventions.",
      }),
    ),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

/**
 * Planned `code_refactor_plan` parameters.
 *
 * `operation` is the only intentional operation-style enum in the V2 skeleton.
 * Phase 0 does not introduce a generic action mega-tool.
 *
 * Runtime rules for future executors:
 * - require `targetId` or anchored `file` + `line` + `character`
 * - `rename` (legacy alias), `rename_symbol`, and extract operations require `newName`
 * - extract operations require `range`
 */
export const CodeRefactorParameters = Type.Object(
  {
    operation: StringEnum(["rename", "rename_symbol", "extract_function", "extract_variable"], {
      description: "Refactor operation; `rename` is an alias for `rename_symbol`.",
    }),
    targetId: Type.Optional(
      Type.String({ description: "Resolved target handle from `code_resolve`." }),
    ),
    file: Type.Optional(FileParam),
    line: Type.Optional(LineParam),
    character: Type.Optional(CharacterParam),
    range: Type.Optional(RangeParam),
    newName: Type.Optional(
      Type.String({ description: "New symbol name for rename/extract operations." }),
    ),
  },
  { additionalProperties: false },
);

/** Planned `code_refactor_apply` parameters. `planId` is required. */
export const CodeApplyParameters = Type.Object(
  {
    planId: Type.String({
      description: "Stored plan identifier returned by a previous refactor/plan step.",
    }),
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
    coveragePath: Type.Optional(
      Type.String({
        description: "Coverage summary path; defaults to `coverage/coverage-summary.json`.",
      }),
    ),
    unusedPath: Type.Optional(
      Type.String({
        description: "Knip report path; defaults to `knip.json`.",
      }),
    ),
  },
  { additionalProperties: false },
);

export type WorkflowCodeToolSchemaKey = CodeIntelligenceToolName;

/** Code intelligence tool schemas keyed by public tool name. */
export const CODE_INTELLIGENCE_TOOL_SCHEMAS = {
  code_resolve: CodeResolveParameters,
  code_inspect: CodeInspectParameters,
  code_orientation: CodeOrientationParameters,
  code_find: CodeFindParameters,
  code_graph: CodeGraphParameters,
  code_impact: CodeImpactParameters,
  code_refactor_plan: CodeRefactorParameters,
  code_refactor_apply: CodeApplyParameters,
  code_health: CodeHealthParameters,
} as const satisfies Record<CodeIntelligenceToolName, TSchema>;
