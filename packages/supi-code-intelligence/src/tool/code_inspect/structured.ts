import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, type TSchema, Type } from "typebox";
import type { InspectObservation } from "../../session/inspect-types.ts";
import { ConfidenceSchema, EvidenceListSchema, RecoveryRangeSchema } from "../result/structured.ts";
import type { InspectResultAssembly } from "./result.ts";

const PositionRange = {
  startLine: Type.Integer(),
  startCharacter: Type.Integer(),
  endLine: Type.Integer(),
  endCharacter: Type.Integer(),
};
const NodeSchema = Type.Object(
  {
    type: Type.String(),
    text: Type.String(),
    ...PositionRange,
    ancestry: Type.Array(
      Type.Object({ type: Type.String(), ...PositionRange }, { additionalProperties: false }),
    ),
  },
  { additionalProperties: false },
);
const SymbolSchema = Type.Object(
  {
    name: Type.String(),
    kind: Type.String(),
    nativeKind: Type.Optional(Type.String()),
    ...PositionRange,
  },
  { additionalProperties: false },
);
const DefinitionSchema = Type.Object(
  { file: Type.String(), line: Type.Integer(), character: Type.Integer() },
  { additionalProperties: false },
);
const DiagnosticSchema = Type.Object(
  {
    line: Type.Integer(),
    character: Type.Integer(),
    endLine: Type.Integer(),
    endCharacter: Type.Integer(),
    severity: Type.Number(),
    message: Type.String(),
  },
  { additionalProperties: false },
);
const ProvenanceSchema = Type.Object(
  { source: StringEnum(["semantic", "structural"]), capability: Type.String() },
  { additionalProperties: false },
);

function observationSchema<T extends TSchema>(data: T) {
  return Type.Union([
    Type.Object({ kind: Type.Literal("completed"), data }, { additionalProperties: false }),
    Type.Object(
      {
        kind: Type.Literal("partial"),
        data,
        reason: Type.String(),
        recovery: Type.Optional(
          Type.Object(
            { file: Type.String(), errorRanges: Type.Array(RecoveryRangeSchema) },
            { additionalProperties: false },
          ),
        ),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      { kind: Type.Literal("unavailable"), reason: Type.String() },
      { additionalProperties: false },
    ),
  ]);
}

/** Point facts use one-based UTF-16 coordinates; syntax recovery ranges remain zero-based. */
export const InspectOutputSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("completed"),
      point: Type.Object(
        { file: Type.String(), line: Type.Integer(), character: Type.Integer() },
        { additionalProperties: false },
      ),
      confidence: ConfidenceSchema,
      diagnosticWindow: Type.Object(
        { startLine: Type.Integer(), endLine: Type.Integer() },
        { additionalProperties: false },
      ),
      sections: Type.Object(
        {
          node: observationSchema(Type.Union([NodeSchema, Type.Null()])),
          enclosingSymbol: observationSchema(Type.Union([SymbolSchema, Type.Null()])),
          hover: observationSchema(Type.Union([Type.String(), Type.Null()])),
          definition: observationSchema(Type.Array(DefinitionSchema)),
          diagnostics: observationSchema(Type.Array(DiagnosticSchema)),
        },
        { additionalProperties: false },
      ),
      evidenceLists: Type.Array(EvidenceListSchema),
      provenance: Type.Array(ProvenanceSchema),
      nextQueries: Type.Array(Type.String()),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal("invalid-input"),
      message: Type.String(),
      nextQueries: Type.Array(Type.String()),
    },
    { additionalProperties: false },
  ),
]);

function observation<T, U>(value: InspectObservation<T>, project: (data: T) => U) {
  if (value.kind === "unavailable") return { kind: value.kind, reason: value.reason };
  if (value.kind === "completed") return { kind: value.kind, data: project(value.data) };
  return {
    kind: value.kind,
    data: project(value.data),
    reason: value.reason,
    ...(value.recovery
      ? {
          recovery: {
            file: value.recovery.file,
            errorRanges: value.recovery.errorRanges.map(({ start, end }) => ({
              start: { line: start.line, character: start.character },
              end: { line: end.line, character: end.character },
            })),
          },
        }
      : {}),
  };
}

/** Assemble script data from the same bounded evidence as direct inspection, never UI text. */
export function structuredInspectResult(
  assembly: InspectResultAssembly,
): Static<typeof InspectOutputSchema> {
  const { data, assembled } = assembly;
  return {
    kind: "completed",
    point: { file: data.relPath, line: data.line, character: data.character },
    confidence: data.confidence,
    diagnosticWindow: {
      startLine: data.diagnosticWindow.startLine,
      endLine: data.diagnosticWindow.endLine,
    },
    sections: {
      node: observation(data.sections.node, (node) =>
        node
          ? {
              type: node.type,
              text: node.text,
              startLine: node.startLine,
              startCharacter: node.startCharacter,
              endLine: node.endLine,
              endCharacter: node.endCharacter,
              ancestry: node.ancestry.map(
                ({ type, startLine, startCharacter, endLine, endCharacter }) => ({
                  type,
                  startLine,
                  startCharacter,
                  endLine,
                  endCharacter,
                }),
              ),
            }
          : null,
      ),
      enclosingSymbol: observation(data.sections.enclosingSymbol, (symbol) =>
        symbol
          ? {
              name: symbol.name,
              kind: symbol.kind,
              ...(symbol.nativeKind === undefined ? {} : { nativeKind: symbol.nativeKind }),
              startLine: symbol.startLine,
              startCharacter: symbol.startCharacter,
              endLine: symbol.endLine,
              endCharacter: symbol.endCharacter,
            }
          : null,
      ),
      hover: observation(data.sections.hover, (hover) => hover),
      definition: observation(data.sections.definition, () =>
        assembly.displayedDefinitions.map(({ file, line, character }) => ({
          file,
          line,
          character,
        })),
      ),
      diagnostics: observation(data.sections.diagnostics, () =>
        assembly.displayedDiagnostics.map(
          ({ line, character, endLine, endCharacter, severity, message }) => ({
            line,
            character,
            endLine,
            endCharacter,
            severity,
            message,
          }),
        ),
      ),
    },
    evidenceLists: assembled.evidenceLists.map(
      ({
        key,
        totalCount,
        shownCount,
        omittedCount,
        partialReason,
        partialMessage,
        invalidLocationCount,
      }) => ({
        key,
        totalCount,
        shownCount,
        omittedCount,
        partialReason,
        ...(partialMessage === undefined ? {} : { partialMessage }),
        ...(invalidLocationCount === undefined ? {} : { invalidLocationCount }),
      }),
    ),
    provenance: assembled.provenance.map(({ source, capability }) => ({
      source: source as "semantic" | "structural",
      capability: capability ?? "",
    })),
    nextQueries: [...assembly.details.nextQueries],
  };
}
