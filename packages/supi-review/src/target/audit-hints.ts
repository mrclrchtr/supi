import type { ReviewSnapshot } from "../types.ts";

export type ReviewAuditHintKind = "public-surface" | "cross-layer" | "schema-widening" | "cleanup";

export interface ReviewAuditHint {
  kind: ReviewAuditHintKind;
  title: string;
  instruction: string;
}

/** Derive deterministic audit hints from the snapshot shape and diff metadata. */
export function deriveAuditHints(snapshot: ReviewSnapshot): ReviewAuditHint[] {
  const hints: ReviewAuditHint[] = [];
  const changedFiles = snapshot.changedFiles;
  const diffText = snapshot.diffText;

  if (needsPublicSurfaceAudit(changedFiles, diffText)) {
    hints.push({
      kind: "public-surface",
      title: "Public-surface / rename / merge audit",
      instruction:
        "Sweep source, tests, docs, user-facing strings, and debug/status lists for stale public names after renames, removals, or merges.",
    });
  }

  if (needsCrossLayerAudit(changedFiles)) {
    hints.push({
      kind: "cross-layer",
      title: "Cross-layer propagation audit",
      instruction:
        "Verify every provider/runtime/orchestration/presentation/test handoff and look for at least one end-to-end expectation covering the threaded behavior.",
    });
  }

  if (needsSchemaWideningAudit(changedFiles, diffText)) {
    hints.push({
      kind: "schema-widening",
      title: "Enum / operation / schema widening audit",
      instruction:
        "Audit validation, unavailable paths, branch coverage, aliases, and negative tests for widened enums, operations, or schemas.",
    });
  }

  if (needsCleanupAudit(changedFiles, diffText)) {
    hints.push({
      kind: "cleanup",
      title: "Cleanup / deletion / orphan audit",
      instruction:
        "Check for orphan files, dead imports or re-exports, stale comments, and outdated expectations after deletions or consumer removals.",
    });
  }

  return hints;
}

function needsPublicSurfaceAudit(changedFiles: string[], diffText: string): boolean {
  return (
    changedFiles.some((file) =>
      /(^|\/)(tool-specs\.ts|intent\/types\.ts|README\.md|CLAUDE\.md|package\.json)$/.test(file),
    ) || /(code_|lsp_|tree_sitter_)/.test(diffText)
  );
}

function needsCrossLayerAudit(changedFiles: string[]): boolean {
  const layers = new Set<string>();

  for (const file of changedFiles) {
    if (/\/__tests__\//.test(file)) layers.add("tests");
    if (/\/src\/(provider|session)\//.test(file) || /\/src\/types\.ts$/.test(file)) {
      layers.add("runtime");
    }
    if (
      /\/src\/(use-case|analysis|history|target)\//.test(file) ||
      /\/src\/review\.ts$/.test(file)
    ) {
      layers.add("orchestration");
    }
    if (/\/src\/(presentation|ui)\//.test(file)) layers.add("presentation");
  }

  return layers.size >= 4;
}

function needsSchemaWideningAudit(changedFiles: string[], diffText: string): boolean {
  const touchesTypes = changedFiles.some((file) => /\/src\/types\.ts$/.test(file));
  const touchesSchemas = changedFiles.some((file) => /\/schemas\.ts$/.test(file));
  const touchesRouting = changedFiles.some((file) =>
    /(review-runner|tool-specs|validation|planner)\.ts$/.test(file),
  );

  return (
    (touchesTypes && touchesSchemas) ||
    ((touchesTypes || touchesSchemas) && touchesRouting) ||
    /export type .*\|/.test(diffText)
  );
}

function needsCleanupAudit(changedFiles: string[], diffText: string): boolean {
  return (
    /deleted file mode|rename from|rename to/.test(diffText) ||
    changedFiles.some((file) => /(archive|backup|deprecated|legacy|old|unused)/i.test(file))
  );
}
