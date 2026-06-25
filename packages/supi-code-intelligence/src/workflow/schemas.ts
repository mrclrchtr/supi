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
 * Planned `code_context` parameters.
 *
 * Runtime rule for future executors:
 * - allow plain orientation when `task` is omitted
 * - prefer `targetId` over raw coordinates once Phase 1 handle resolution exists
 * - `targetId` takes precedence over `file` + `line` + `character`; when both
 *   are supplied, coordinates are ignored with a visible note
 * - coordinate mode (`file` + `line` + `character`) resolves a real symbol
 *   target through the same path as `code_resolve` and exposes a reusable
 *   `targetId`; it requires all three coordinate fields when any is present
 */
export const CodeContextParameters = Type.Object(
  {
    task: Type.Optional(
      Type.String({ description: "Task-oriented request describing the change or question." }),
    ),
    targetId: Type.Optional(
      Type.String({
        description:
          "Resolved target handle from `code_resolve`. Takes precedence over `file`/`line`/`character`. If invalid or stale, the call errors and does not fall back to coordinates.",
      }),
    ),
    file: Type.Optional(
      Type.String({
        description:
          "Target file path for coordinate target mode. Requires `line` and `character`. Resolves a real symbol target through the same path as `code_resolve`.",
      }),
    ),
    line: Type.Optional(
      Type.Number({
        description: "1-based line for coordinate target mode. Requires `file` and `character`.",
        minimum: 1,
      }),
    ),
    character: Type.Optional(
      Type.Number({
        description:
          "1-based UTF-16 column for coordinate target mode. Requires `file` and `line`.",
        minimum: 1,
      }),
    ),
    scope: Type.Optional(
      Type.String({
        description:
          "Workspace-relative path, package, or directory scope for orientation/selection. Ignored (with a visible note) when a precise target (`targetId` or coordinates) is supplied; it is a selection boundary, not a downstream evidence filter.",
      }),
    ),
    budget: Type.Optional(
      StringEnum(["small", "medium", "large"], {
        description:
          "Context budget: small=3, medium=8, large=15 results per section. Smaller values prefer fewer, higher-signal items.",
      }),
    ),
    include: Type.Optional(
      Type.Array(
        StringEnum(
          [
            "defs",
            "references",
            "callees",
            "tests",
            "docs",
            "diagnostics",
            "exports",
            "imports",
            "impact",
          ],
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
    change: Type.Optional(
      Type.String({
        description:
          "When present, runs impact analysis and appends a condensed Impact Assessment section to the context result.",
      }),
    ),
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
        description:
          'Search mode. Omit for literal text search. mode: "ast" requires `kind`; mode: "text", mode: "regex", and mode: "semantic" do not accept `kind`.',
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
          description:
            'Only valid with `mode: "ast"`. Supported AST kinds: `definition`, `import`, `export`, `call`, `type`, `interface`, `class`, `method`, `enum`, `test`. AST `call` matches call-site identifiers by name, not by symbol identity.',
        },
      ),
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
          description:
            'Relation families to include in the graph. Use `"all"` to expand to every relation family. `callees` is direct structural outgoing-call evidence: source-shape calls in the enclosing scope, not symbol-identity resolution.',
        }),
        {
          description: 'Requested relation families. Defaults to ["references"] when omitted.',
          uniqueItems: true,
        },
      ),
    ),
    maxResults: Type.Optional(MaxResultsParam),
    calleeDepth: Type.Optional(
      StringEnum(["direct", "deep"], {
        description:
          'Depth for callee collection. `"direct"` (default): only direct calls from the enclosing scope, excluding nested function/callback scopes. `"deep"`: include all callees within the enclosing scope, including those inside nested scopes.',
      }),
    ),
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
      Type.Boolean({
        description:
          "Whether likely tests should be included in the impact set. changedFiles analysis uses semantic references when available plus deterministic conventions; target-based analysis may combine semantic references with deterministic conventions.",
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
      description:
        "Precise refactor operation to plan. `rename` is accepted as a compatibility alias for `rename_symbol`.",
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
        description:
          "Workspace-relative path to a coverage summary JSON file. Defaults to `coverage/coverage-summary.json`.",
      }),
    ),
    unusedPath: Type.Optional(
      Type.String({
        description: "Workspace-relative path to a knip JSON report. Defaults to `knip.json`.",
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
  code_refactor_plan: CodeRefactorParameters,
  code_refactor_apply: CodeApplyParameters,
  code_health: CodeHealthParameters,
} as const satisfies Record<WorkflowCodeToolSchemaKey, TSchema>;
