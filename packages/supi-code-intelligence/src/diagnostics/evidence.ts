import * as path from "node:path";
import type {
  DiagnosticEvidenceDocument,
  DiagnosticEvidenceStatus,
  DiagnosticEvidenceSummary,
} from "@mrclrchtr/supi-lsp/api";

/** Merge file-local diagnostic evidence without inventing coverage. */
export function mergeDiagnosticEvidence(
  previous: DiagnosticEvidenceSummary,
  latest: DiagnosticEvidenceSummary,
  cwd?: string,
  policy: "latest" | "conservative" = "latest",
): DiagnosticEvidenceSummary {
  const byFile = new Map<string, DiagnosticEvidenceDocument>();
  for (const document of [...previous.documents, ...latest.documents]) {
    const file = cwd ? path.relative(cwd, path.resolve(cwd, document.file)) : document.file;
    const next = { file, status: document.status };
    const previousDocument = byFile.get(file);
    if (
      !previousDocument ||
      policy === "latest" ||
      evidenceStatusRank(next.status) > evidenceStatusRank(previousDocument.status)
    ) {
      byFile.set(file, next);
    }
  }
  const documents = Array.from(byFile.values()).sort((a, b) => a.file.localeCompare(b.file));
  const counts = {
    requested: documents.length,
    confirmed: 0,
    unconfirmed: 0,
    failed: 0,
    removed: 0,
  };
  for (const document of documents) counts[document.status]++;
  return { ...counts, documents };
}

function evidenceStatusRank(status: DiagnosticEvidenceStatus): number {
  switch (status) {
    case "confirmed":
      return 1;
    case "unconfirmed":
      return 2;
    case "failed":
      return 3;
    case "removed":
      return 4;
  }
}
