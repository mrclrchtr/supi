import { StringEnum } from "@earendil-works/pi-ai";
import { type TSchema, Type } from "typebox";
import { TARGET_SYMBOL_KINDS } from "../session/target-input.ts";

export const ScopeParam = Type.String({
  description: "Workspace-relative file or directory scope.",
});
export const FindScopeParam = Type.Array(
  Type.String({ description: "Workspace-relative search scope." }),
  {
    description: "One or more workspace-relative search scopes.",
    minItems: 1,
  },
);
const FileParam = Type.String({ description: "File path." });
export const QueryParam = Type.String({
  description: "Human or code reference to resolve or search for.",
  minLength: 1,
});
const LineParam = Type.Integer({ description: "1-based line.", minimum: 1 });
const CharacterParam = Type.Integer({
  description: "1-based UTF-16 column.",
  minimum: 1,
});
export const MaxResultsParam = Type.Integer({
  description: "Maximum displayed results.",
  minimum: 1,
});

export const SourcePointParam = Type.Object(
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

export const ResolveTargetParam = exactOneSelector(
  {
    anchor: SourcePointParam,
    symbol: SymbolTargetParam,
    file: FileParam,
  },
  "Exactly one: anchor, symbol query, or file declaration group.",
);

export const GraphTargetParam = exactOneSelector(
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

export const OrientationFocusParam = exactOneSelector(
  {
    path: Type.String({
      description: "Workspace-relative project, package, directory, or file path.",
    }),
    module: Type.String({ description: "Discovered module name." }),
    target: OrientationTargetParam,
  },
  "Exactly one Orientation focus.",
);

export const RefactorTargetParam = exactOneSelector(
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

export const RefactorOperationParam = exactOneSelector(
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

// Per-tool parameter objects live in each tool's spec.ts; this module keeps the
// shared parameter vocabulary for the eight-tool family.
