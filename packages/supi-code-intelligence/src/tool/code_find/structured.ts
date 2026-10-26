import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import { toDisplayPath } from "../../analysis/search/paths.ts";
import { ConfidenceSchema, EvidenceListSchema, RecoveryRangeSchema } from "../result/structured.ts";
import type { FindResultAssembly } from "./result.ts";

const ScanPathSummary = Type.Object({
  reason: Type.String(),
  pathCount: Type.Union([Type.Integer(), Type.Null()]),
  examples: Type.Array(Type.String()),
});

/** Codemode search evidence, including scan-universe limits independently of match counts. */
export const FindOutputSchema = Type.Object(
  {
    kind: StringEnum(["completed", "invalid-input"]),
    mode: Type.Optional(StringEnum(["semantic", "ast"])),
    confidence: ConfidenceSchema,
    matches: Type.Array(
      Type.Object(
        {
          name: Type.String(),
          kind: Type.String(),
          file: Type.String(),
          line: Type.Integer(),
          character: Type.Integer(),
          endLine: Type.Optional(Type.Integer()),
          endCharacter: Type.Optional(Type.Integer()),
          anchorKind: Type.Optional(StringEnum(["name", "declaration"])),
          container: Type.Optional(Type.Union([Type.String(), Type.Null()])),
        },
        { additionalProperties: false },
      ),
    ),
    evidenceLists: Type.Array(EvidenceListSchema),
    nextQueries: Type.Array(Type.String()),
    message: Type.Optional(Type.String()),
    partialReason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    automaticPathExclusion: Type.Optional(
      Type.Object({ excludedCount: Type.Integer(), examples: Type.Array(Type.String()) }),
    ),
    scan: Type.Optional(
      Type.Object({
        universe: Type.String(),
        roots: Type.Array(Type.String()),
        eligibleFileCount: Type.Union([Type.Integer(), Type.Null()]),
        analyzedFileCount: Type.Integer(),
        complete: Type.Boolean(),
        exclusions: Type.Array(
          Type.Object({ ...ScanPathSummary.properties, scopeRoot: Type.String() }),
        ),
        limitations: Type.Array(ScanPathSummary),
        policy: Type.Object({
          operation: Type.String(),
          supportedExtensions: Type.Array(Type.String()),
          excludedDirectories: Type.Array(Type.String()),
          configuredExclusions: Type.Array(Type.String()),
          hiddenEntries: Type.String(),
          ignoreFiles: Type.Boolean(),
          symlinks: Type.String(),
          maxFiles: Type.Integer(),
          timeoutMs: Type.Number(),
        }),
      }),
    ),
    failures: Type.Optional(
      Type.Array(
        Type.Object({
          file: Type.String(),
          kind: Type.String(),
          reason: Type.String(),
          errorRanges: Type.Optional(Type.Array(RecoveryRangeSchema)),
        }),
      ),
    ),
  },
  { additionalProperties: false },
);

/** Serialize only the visible matches while preserving complete collection metadata. */
export function structuredFindResult(
  assembly: FindResultAssembly,
  cwd: string,
): Static<typeof FindOutputSchema> {
  const { data } = assembly.outcome;
  const evidence = assembly.assembled.evidenceLists;
  const shown = evidence[0]?.shownCount ?? 0;
  const base = {
    kind: "completed" as const,
    mode: data.kind,
    confidence: assembly.assembled.confidence,
    evidenceLists: evidence.map((entry) => ({ ...entry })),
    nextQueries: assembly.details.nextQueries,
  };
  if (data.kind === "semantic") {
    const exclusion = data.partialMetadata?.automaticPathExclusion;
    return {
      ...base,
      matches: data.symbols.slice(0, shown).map((symbol) => {
        const anchor = symbol.nameAnchor ?? symbol.declarationAnchor;
        return {
          name: symbol.name,
          kind: symbol.kind,
          file: toDisplayPath(cwd, symbol.file),
          line: anchor.line,
          character: anchor.character,
          anchorKind: symbol.nameAnchor ? ("name" as const) : ("declaration" as const),
          container: symbol.container ?? null,
        };
      }),
      partialReason: data.partialReason,
      ...(exclusion
        ? {
            automaticPathExclusion: {
              excludedCount: exclusion.excludedCount,
              examples: [...exclusion.examples],
            },
          }
        : {}),
    };
  }
  const { scan } = data.result;
  return {
    ...base,
    matches: data.result.matches.slice(0, shown).map((match) => ({
      name: match.name,
      kind: match.kind,
      file: match.file,
      line: match.line,
      character: match.startCharacter,
      endLine: match.endLine,
      endCharacter: match.endCharacter,
    })),
    partialReason: data.result.partialReason,
    scan: {
      ...scan,
      roots: [...scan.roots],
      policy: {
        ...scan.policy,
        supportedExtensions: [...scan.policy.supportedExtensions],
        excludedDirectories: [...scan.policy.excludedDirectories],
        configuredExclusions: [...scan.policy.configuredExclusions],
      },
      exclusions: scan.exclusions.map((entry) => ({ ...entry, examples: [...entry.examples] })),
      limitations: scan.limitations.map((entry) => ({ ...entry, examples: [...entry.examples] })),
    },
    failures: data.result.failures.map((failure) => ({
      file: failure.file,
      kind: failure.kind,
      reason: failure.reason,
      ...(failure.errorRanges
        ? {
            errorRanges: failure.errorRanges.map((range) => ({
              start: { ...range.start },
              end: { ...range.end },
            })),
          }
        : {}),
    })),
  };
}
