import { StringEnum } from "@earendil-works/pi-ai";
import { type TSchema, Type } from "typebox";
import { TARGET_SYMBOL_KINDS } from "../session/target-input.ts";
import type { CodeIntelligenceToolName } from "../types/index.ts";
import { CODE_FIND_AST_KINDS } from "./find/ast-kinds.ts";
import { CODE_FIND_MODES } from "./find/modes.ts";

const ScopeParam = Type.String({
  description: "Workspace-relative file or directory scope.",
});
const FindScopeParam = Type.Array(
  Type.String({ description: "Workspace-relative search scope." }),
  {
    description: "One or more workspace-relative search scopes.",
    minItems: 1,
  },
);
const FileParam = Type.String({ description: "File path." });
const QueryParam = Type.String({
  description: "Human or code reference to resolve or search for.",
  minLength: 1,
});
const LineParam = Type.Integer({ description: "1-based line.", minimum: 1 });
const CharacterParam = Type.Integer({
  description: "1-based UTF-16 column.",
  minimum: 1,
});
const MaxResultsParam = Type.Integer({
  description: "Maximum displayed results.",
  minimum: 1,
});

const SourcePointParam = Type.Object(
  { file: FileParam, line: LineParam, character: CharacterParam },
  { additionalProperties: false },
);

const SymbolTargetParam = Type.Object(
  {
    query: QueryParam,
    scope: Type.Optional(ScopeParam),
    symbolKind: Type.Optional(
      StringEnum(TARGET_SYMBOL_KINDS, {
        description: "LSP SymbolKind filter; omit when uncertain.",
      }),
    ),
  },
  {
    description: "Semantic symbol query.",
    additionalProperties: false,
  },
);

/**
 * Build a model-provider-friendly exact-one selector without Type.Union/Type.Literal.
 * Pi validates min/max properties before execution; the session owns semantic validation.
 */
function exactOneSelector(properties: Record<string, TSchema>, description: string): TSchema {
  const optionalProperties: Record<string, TSchema> = {};
  for (const [key, schema] of Object.entries(properties)) {
    optionalProperties[key] = Type.Optional(schema);
  }
  return Type.Object(optionalProperties, {
    description,
    minProperties: 1,
    maxProperties: 1,
    additionalProperties: false,
  });
}

const ResolveTargetParam = exactOneSelector(
  {
    anchor: SourcePointParam,
    symbol: SymbolTargetParam,
    file: FileParam,
  },
  "Exactly one: anchor, symbol query, or file declaration group.",
);

const GraphTargetParam = exactOneSelector(
  {
    handle: Type.String({ description: "Target handle returned by code_resolve." }),
    anchor: SourcePointParam,
    symbol: SymbolTargetParam,
  },
  "Exactly one graph target.",
);

const OrientationTargetParam = exactOneSelector(
  {
    handle: Type.String({ description: "Target handle returned by code_resolve." }),
    anchor: SourcePointParam,
    symbol: SymbolTargetParam,
  },
  "Exactly one Orientation target.",
);

const OrientationFocusParam = exactOneSelector(
  {
    path: Type.String({
      description: "Workspace-relative project, package, directory, or file path.",
    }),
    module: Type.String({ description: "Discovered module name." }),
    target: OrientationTargetParam,
  },
  "Exactly one Orientation focus.",
);

const RefactorTargetParam = exactOneSelector(
  {
    handle: Type.String({ description: "Target handle returned by code_resolve." }),
    anchor: SourcePointParam,
  },
  "Exactly one refactor target.",
);

const RangeParam = Type.Object(
  {
    start: Type.Object(
      { line: LineParam, character: CharacterParam },
      { additionalProperties: false },
    ),
    end: Type.Object(
      { line: LineParam, character: CharacterParam },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

const NewNameParam = Type.String({ description: "New symbol name.", minLength: 1 });

const RefactorOperationParam = exactOneSelector(
  {
    rename_symbol: Type.Object({ newName: NewNameParam }, { additionalProperties: false }),
    extract_function: Type.Object(
      { newName: NewNameParam, range: RangeParam },
      { additionalProperties: false },
    ),
    extract_variable: Type.Object(
      { newName: NewNameParam, range: RangeParam },
      { additionalProperties: false },
    ),
  },
  "Exactly one refactor operation.",
);

/** Resolve one target or enumerate a file declaration group as session-scoped handles. */
export const CodeResolveParameters = Type.Object(
  {
    target: ResolveTargetParam,
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

/** Inspect one precise point. */
export const CodeInspectParameters = Type.Object(
  {
    point: SourcePointParam,
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

/** Orient around the workspace or one exact focus. */
export const CodeOrientationParameters = Type.Object(
  {
    focus: Type.Optional(OrientationFocusParam),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

/** Unified structural and semantic code search. */
export const CodeFindParameters = Type.Object(
  {
    query: QueryParam,
    scope: Type.Optional(FindScopeParam),
    mode: StringEnum(CODE_FIND_MODES, {
      description: 'Required code-aware search mode. mode:"ast" requires `kind`.',
    }),
    kind: Type.Optional(
      StringEnum(CODE_FIND_AST_KINDS, {
        description: 'AST kind for mode:"ast".',
      }),
    ),
    maxResults: Type.Optional(MaxResultsParam),
  },
  { additionalProperties: false },
);

/** Provider-backed and explicitly structural relations for one target. */
export const CodeGraphParameters = Type.Object(
  {
    target: GraphTargetParam,
    relations: Type.Optional(
      Type.Array(StringEnum(["all", "references", "callees", "implements"]), {
        description:
          'Requested relations; defaults to ["references"]. "all" must be the only item.',
        minItems: 1,
        uniqueItems: true,
      }),
    ),
    maxResults: Type.Optional(MaxResultsParam),
    calleeDepth: Type.Optional(
      StringEnum(["direct", "deep"], {
        description: "direct excludes nested scopes; deep includes them.",
      }),
    ),
  },
  { additionalProperties: false },
);

/** Preview one precise semantic refactor without mutating files. */
export const CodeRefactorParameters = Type.Object(
  {
    target: RefactorTargetParam,
    operation: RefactorOperationParam,
  },
  { additionalProperties: false },
);

/** Apply a stored plan after freshness and fingerprint validation. */
export const CodeApplyParameters = Type.Object(
  {
    planId: Type.String({
      description: "planId returned by code_refactor_plan.",
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

/** Report evidence-backed workspace health signals. */
export const CodeHealthParameters = Type.Object(
  {
    scope: Type.Optional(ScopeParam),
    refresh: Type.Optional(
      Type.Boolean({
        description: "Attempt diagnostic recovery before collecting; result reports the outcome.",
      }),
    ),
    include: Type.Optional(
      Type.Array(StringEnum(["diagnostics", "servers"]), {
        description: "Requested health-signal sections.",
        uniqueItems: true,
      }),
    ),
    level: Type.Optional(
      StringEnum(["summary", "detailed"], {
        description: "Detail level for the health report.",
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
  code_refactor_plan: CodeRefactorParameters,
  code_refactor_apply: CodeApplyParameters,
  code_health: CodeHealthParameters,
} as const satisfies Record<CodeIntelligenceToolName, TSchema>;
