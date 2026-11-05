/** Fingerprint-bound edit evidence for refactor planning. */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { FileEdit, WorkspaceEdit } from "@mrclrchtr/supi-code-runtime/api";
import { createLogicalLineIndex, type LogicalLineIndex } from "../analysis/refactor/position.ts";
import { computeFileFingerprint } from "./refactor-plans.ts";

type FileFingerprint = { file: string; fingerprint: string };

/** Fingerprint each edited file, reusing an earlier source snapshot when provided. */
export function collectFileFingerprints(
  edits: readonly { file: string }[],
  sourceSnapshot?: FileFingerprint,
): FileFingerprint[] {
  const files = [...new Set(edits.map((edit) => edit.file))];
  return files.map((file) => ({
    file,
    fingerprint:
      sourceSnapshot?.file === file ? sourceSnapshot.fingerprint : computeFileFingerprint(file),
  }));
}

/**
 * Drop edits whose replacement exactly equals the text they replace.
 *
 * Text is read only from content whose hash still equals the plan's verified
 * fingerprint, so the comparison uses the snapshot that the plan was validated
 * against. Files left without edits lose their fingerprints and preconditions.
 * Edits whose ranges do not fit the content are kept for normal validation.
 */
export function dropIdentityEdits(
  edits: WorkspaceEdit,
  fileFingerprints: readonly FileFingerprint[],
):
  | { kind: "ok"; edits: WorkspaceEdit; fileFingerprints: FileFingerprint[] }
  | { kind: "unavailable"; reason: string } {
  const contents = new Map<string, { content: string; index: LogicalLineIndex }>();
  for (const { file, fingerprint } of fileFingerprints) {
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      return { kind: "unavailable", reason: `File ${file} could not be read during planning.` };
    }
    if (createHash("sha256").update(content).digest("hex") !== fingerprint) {
      return {
        kind: "unavailable",
        reason: `File ${file} changed during planning. Request a new plan.`,
      };
    }
    contents.set(file, { content, index: createLogicalLineIndex(content) });
  }

  const kept = edits.edits.filter((edit) => !isIdentityEdit(edit, contents.get(edit.file)));
  const files = new Set(kept.map((edit) => edit.file));
  const preconditions = edits.documentPreconditions?.filter((item) => files.has(item.file));
  return {
    kind: "ok",
    edits: preconditions ? { edits: kept, documentPreconditions: preconditions } : { edits: kept },
    fileFingerprints: fileFingerprints.filter(({ file }) => files.has(file)),
  };
}

function isIdentityEdit(
  edit: FileEdit,
  source: { content: string; index: LogicalLineIndex } | undefined,
): boolean {
  if (!source) return false;
  try {
    const start = source.index.offsetAt(edit.range.start);
    return source.content.slice(start, source.index.offsetAt(edit.range.end)) === edit.newText;
  } catch {
    return false;
  }
}
