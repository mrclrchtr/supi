import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import type { GraphWorkflowOutcome } from "../../session/graph-types.ts";
import {
  EvidenceListSchema,
  NavigationTargetSchema,
  ReadNextSchema,
  RecoveryRangeSchema,
} from "../result/structured.ts";
import type { GraphResultAssembly } from "./result.ts";

/** Codemode relation evidence; callees describe written expressions, not resolved identities. */
export const GraphOutputSchema = Type.Object(
  {
    kind: StringEnum(["completed", "invalid-input", "disambiguation", "kind-mismatch"]),
    target: Type.Optional(Type.Object({ name: Type.String(), file: Type.String() })),
    sections: Type.Array(
      Type.Object(
        {
          relation: StringEnum(["references", "callees", "implements"]),
          source: StringEnum(["semantic", "structural"]),
          status: StringEnum(["complete", "partial", "unavailable"]),
          message: Type.Union([Type.String(), Type.Null()]),
          items: Type.Array(
            Type.Object(
              {
                name: Type.Union([Type.String(), Type.Null()]),
                file: Type.String(),
                line: Type.Integer(),
                character: Type.Integer(),
              },
              { additionalProperties: false },
            ),
          ),
          evidence: Type.Optional(EvidenceListSchema),
          externalCount: Type.Integer(),
          depth: Type.Union([StringEnum(["direct", "deep"]), Type.Null()]),
          enclosingScope: Type.Union([
            Type.Object({
              name: Type.String(),
              file: Type.String(),
              startLine: Type.Integer(),
              endLine: Type.Integer(),
            }),
            Type.Null(),
          ]),
          recovery: Type.Union([
            Type.Object({
              file: Type.String(),
              reason: Type.String(),
              errorRanges: Type.Array(RecoveryRangeSchema),
            }),
            Type.Null(),
          ]),
        },
        { additionalProperties: false },
      ),
    ),
    targets: Type.Optional(Type.Array(NavigationTargetSchema)),
    evidenceLists: Type.Array(EvidenceListSchema),
    readNext: Type.Array(ReadNextSchema),
    message: Type.Optional(Type.String()),
    requestedKind: Type.Optional(Type.String()),
    nextQueries: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

/** Project the already-bounded assembly without exposing provider objects or UI previews. */
export function structuredGraphResult(
  assembly: GraphResultAssembly,
): Static<typeof GraphOutputSchema> {
  return {
    kind: "completed",
    target: { name: assembly.displayName, file: assembly.resolvedDisplayFile },
    sections: assembly.sections.map((section, index) => {
      const info = assembly.details.sections[index];
      return {
        relation: section.rel,
        source: info.source,
        status: info.status,
        message: info.message,
        items:
          section.kind === "unavailable"
            ? []
            : section.evidence.items.map((item) => ({
                name: item.name,
                file: toDisplayPath(assembly.cwd, item.file),
                line: item.line,
                character: item.character,
              })),
        ...(section.kind === "ok" ? { evidence: { ...section.evidence.metadata } } : {}),
        externalCount: info.externalCount,
        depth: info.depth,
        enclosingScope: info.enclosingScope ? { ...info.enclosingScope } : null,
        recovery: info.recovery
          ? {
              file: toDisplayPath(assembly.cwd, info.recovery.file),
              reason: info.recovery.reason,
              errorRanges: info.recovery.errorRanges.map((range) => ({
                start: { ...range.start },
                end: { ...range.end },
              })),
            }
          : null,
      };
    }),
    evidenceLists: assembly.assembled.evidenceLists.map((evidence) => ({ ...evidence })),
    readNext: assembly.details.readNext.map((item) => ({ ...item })),
    nextQueries: [],
  };
}

/** Keep recoverable candidate selection machine-readable without parsing Markdown. */
export function structuredGraphCandidates(
  outcome: Extract<GraphWorkflowOutcome, { kind: "disambiguation" | "kind-mismatch" }>,
  evidence: EvidenceListMetadata,
  actions: { message: string; nextQueries: string[] },
): Static<typeof GraphOutputSchema> {
  const { message, nextQueries } = actions;
  return {
    kind: outcome.kind,
    message,
    sections: [],
    targets: outcome.candidates.map((candidate) => ({
      handle: candidate.targetId,
      name: candidate.name,
      kind: candidate.kind,
      file: candidate.file,
      line: candidate.line,
      character: candidate.character,
      anchorKind: candidate.anchorKind,
      container: candidate.container,
    })),
    evidenceLists: [{ ...evidence }],
    readNext: [],
    nextQueries,
    ...(outcome.kind === "kind-mismatch" ? { requestedKind: outcome.requestedKind } : {}),
  };
}
