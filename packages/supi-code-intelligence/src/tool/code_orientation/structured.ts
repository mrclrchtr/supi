import type { EvidenceListMetadata } from "../../analysis/evidence.ts";
import type { OrientationWorkflowOutcome } from "../../session/orientation-types.ts";
import { workspaceFacts } from "./structured-workspace.ts";
import { workspaceSections } from "./workspace-sections.ts";

/** Public, allowlisted projection of one returned workflow outcome. */
export function structuredOrientation(
  outcome: Exclude<OrientationWorkflowOutcome, { kind: "unavailable" }>,
  snapshotPath?: string,
): import("../../types/index.ts").CodeIntelResult["structuredContent"] {
  // Manifest values are parsed JSON but typed as unknown in the collector. Normalize the
  // allowlisted projection to the same JSON value that programmatic callers receive.
  return JSON.parse(JSON.stringify(orientationProjection(outcome, snapshotPath)));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each workflow outcome has a distinct public projection
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: explicit allowlisting keeps private target state out of the result
function orientationProjection(
  outcome: Exclude<OrientationWorkflowOutcome, { kind: "unavailable" }>,
  snapshotPath?: string,
) {
  const base = {
    sections: [],
    targets: [],
    candidates: [],
    evidenceLists: [],
    nextQueries: [],
    readNext: [],
    instructions: [],
    observationLimitations: [],
  };
  if (outcome.kind === "invalid-input")
    return {
      ...base,
      kind: outcome.kind,
      confidence: "unavailable",
      message: outcome.message,
      nextQueries: [
        outcome.symlinkRejection
          ? "Resolve the requested path explicitly and retry with its canonical path."
          : "Choose an existing path, module, or precise target",
      ],
      ...(outcome.symlinkRejection ? { symlinkRejection: { ...outcome.symlinkRejection } } : {}),
    };
  if (outcome.kind === "disambiguation" || outcome.kind === "kind-mismatch")
    return {
      ...base,
      kind: outcome.kind,
      confidence: "semantic",
      candidates: outcome.candidates.map(
        ({ targetId, name, kind, container, file, line, character, rank, anchorKind }) => ({
          handle: targetId,
          name,
          kind,
          container,
          file,
          line,
          character,
          rank,
          ...(anchorKind ? { anchorKind } : {}),
        }),
      ),
      evidenceLists: [
        {
          key: "orientation.candidates",
          totalCount: outcome.totalCount,
          shownCount: outcome.candidates.length,
          omittedCount: outcome.omittedCount,
          partialReason: outcome.partialReason,
          ...(outcome.partialMessage === undefined
            ? {}
            : { partialMessage: outcome.partialMessage }),
        },
      ],
      nextQueries: [
        outcome.kind === "kind-mismatch"
          ? "Retry without symbolKind, use an observed provider kind, or focus one handle"
          : "Use one candidate handle as focus.target.handle",
      ],
      ...(outcome.kind === "kind-mismatch" ? { requestedKind: outcome.requestedKind } : {}),
    };
  const data = outcome.data;
  const selected = data.workspace ? workspaceSections(data, data.workspace.maxResults, true) : data;
  const target = data.target;
  return {
    ...base,
    kind: outcome.kind,
    confidence: data.confidence,
    ...(data.focusKind ? { focusKind: data.focusKind } : {}),
    focus: data.focusTarget,
    sections: selected.sections.map(
      ({ key, status, reason, confidence, provenance, evidenceLists, errorRanges, facts }) => ({
        key,
        status,
        reason,
        confidence,
        provenance: provenance.map(({ source, capability, detail }) => ({
          source,
          ...(capability === undefined ? {} : { capability }),
          ...(detail === undefined ? {} : { detail }),
        })),
        evidenceLists: evidenceLists.map(copyEvidence),
        ...(errorRanges
          ? {
              errorRanges: errorRanges.map(({ start, end }) => ({
                start: { line: start.line, character: start.character },
                end: { line: end.line, character: end.character },
              })),
            }
          : {}),
        ...(facts ? { facts } : {}),
      }),
    ),
    targets: target
      ? [
          {
            handle: target.targetId,
            name: target.name,
            kind: target.kind,
            ...(target.nativeKind === undefined ? {} : { nativeKind: target.nativeKind }),
            file: target.file,
            line: target.displayLine,
            character: target.displayCharacter,
            anchorKind: target.anchorKind,
            container: target.container,
            confidence: target.confidence,
            provenance: [...target.provenance],
            ...(target.resolution
              ? {
                  resolution: {
                    requested: {
                      line: target.resolution.requested.line,
                      character: target.resolution.requested.character,
                    },
                    resolved: {
                      line: target.resolution.resolved.line,
                      character: target.resolution.resolved.character,
                    },
                    snapped: target.resolution.snapped,
                    source: target.resolution.source,
                  },
                }
              : {}),
          },
        ]
      : [],
    evidenceLists: selected.sections.flatMap((section) => section.evidenceLists.map(copyEvidence)),
    nextQueries: [...data.nextQueries],
    readNext: data.readNext.map(({ file, startLine, endLine, reason }) => ({
      file,
      startLine,
      endLine,
      reason,
    })),
    instructions: (data.instructionFiles ?? []).map(
      ({ path: instructionPath, shownLines, totalLines, truncated, content }) => ({
        path: instructionPath,
        shownLines,
        totalLines,
        truncated,
        content,
      }),
    ),
    ...(data.workspace ? { workspace: workspaceFacts(data) } : {}),
    ...(snapshotPath
      ? {
          snapshot: {
            path: snapshotPath,
            limitation: "Reading this snapshot does not refresh the captured observation.",
          },
        }
      : {}),
    observationLimitations: data.workspace
      ? [
          "Captured filesystem and manifest observations are bounded and may become stale; declarations do not establish runtime architecture or dependency resolution.",
        ]
      : [
          "Provider and diagnostic observations are point-in-time evidence, not a complete or refreshed workspace scan.",
        ],
  };
}

function copyEvidence(list: EvidenceListMetadata) {
  return {
    key: list.key,
    totalCount: list.totalCount,
    shownCount: list.shownCount,
    omittedCount: list.omittedCount,
    partialReason: list.partialReason,
    ...(list.partialMessage === undefined ? {} : { partialMessage: list.partialMessage }),
    ...(list.invalidLocationCount === undefined
      ? {}
      : { invalidLocationCount: list.invalidLocationCount }),
  };
}
