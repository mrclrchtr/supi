import type {
  DiagnosticEvidenceDocument,
  DiagnosticEvidenceSummary,
} from "@mrclrchtr/supi-lsp/api";

const EVIDENCE_FILE_NAME_LIMIT = 3;

/** Explain why tracked-file evidence is partial, naming removed and disk-changed files. */
export function diagnosticEvidenceReason(evidence: DiagnosticEvidenceSummary): string {
  if (evidence.requested === 0) {
    return "No document-level diagnostic evidence was collected for this scope. An empty result does not establish that the scope is clean. Request diagnostics for an exact file.";
  }
  let reason = `Diagnostic evidence is partial: ${evidence.requested} requested, ${evidence.confirmed} confirmed, ${evidence.unconfirmed} unconfirmed, ${evidence.failed} failed, ${evidence.removed} removed.`;
  if (evidence.unconfirmed > 0) {
    reason += " Unconfirmed documents have no request-based confirmation.";
  }
  const diskChanged = fileListWhere(evidence, (document) => document.reason === "disk-changed");
  if (diskChanged) {
    reason += ` Changed on disk after their last diagnosis: ${diskChanged}. Their listed diagnostics may be stale; run code_health again with refresh: true.`;
  }
  if (evidence.removed > 0) {
    reason += ` Removed since last tracked: ${removedFileList(evidence)}. Files that imported them may not be re-checked yet; run code_health again with refresh: true to confirm the remaining files.`;
  }
  return reason;
}

function removedFileList(evidence: DiagnosticEvidenceSummary): string {
  return (
    fileListWhere(evidence, (document) => document.status === "removed") ??
    `${evidence.removed} file${evidence.removed === 1 ? "" : "s"}`
  );
}

/** Bounded, quoted list of matching document files; undefined when none match. */
function fileListWhere(
  evidence: DiagnosticEvidenceSummary,
  matches: (document: DiagnosticEvidenceDocument) => boolean,
): string | undefined {
  const files = evidence.documents.filter(matches).map((document) => `\`${document.file}\``);
  if (files.length === 0) return undefined;
  const shown = files.slice(0, EVIDENCE_FILE_NAME_LIMIT).join(", ");
  const more = files.length - EVIDENCE_FILE_NAME_LIMIT;
  return more > 0 ? `${shown} (+${more} more)` : shown;
}
