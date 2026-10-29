import {
  type CodeRequestControl,
  isCodeRequestInterruption,
  throwIfCodeRequestInterrupted,
} from "@mrclrchtr/supi-code-runtime/api";
import type {
  BulkTrackFileOutcome,
  DiagnosticEvidenceDocument,
  WorkspaceLspRuntime,
} from "@mrclrchtr/supi-lsp/api";
import { collectScopedFileDiagnostics } from "./file-scope.ts";

/** Maximum eligible source files selected by one explicit inspector check. */
export const DIAGNOSTIC_CHECK_BATCH_SIZE = 32;

/** One selected source file, including candidates that could not be checked. */
export interface DiagnosticCheckFile {
  readonly file: string;
  readonly status: DiagnosticEvidenceDocument["status"] | "skipped" | "unavailable";
  readonly reason?: string;
}

/** Bounded check coverage, separate from the runtime's tracked-file snapshot. */
export interface WorkspaceDiagnosticCheckReport {
  readonly kind: "completed" | "partial";
  readonly files: readonly DiagnosticCheckFile[];
  /** Null when source discovery did not establish a complete inventory. */
  readonly total: number | null;
  readonly startOffset: number;
  /** Continuation within the sorted inventory; zero starts another pass. */
  readonly nextOffset: number;
  readonly remaining: number | null;
  readonly reason?: string;
}

/** Discover policy-eligible sources and request diagnostics for one bounded batch. */
export async function checkWorkspaceDiagnostics(options: {
  readonly runtime: WorkspaceLspRuntime;
  readonly cwd: string;
  readonly offset: number;
  readonly control: CodeRequestControl;
}): Promise<WorkspaceDiagnosticCheckReport> {
  const { runtime, cwd, control } = options;
  let total: number | null = null;
  let startOffset = options.offset;
  const files: DiagnosticCheckFile[] = [];
  const report = (
    kind: WorkspaceDiagnosticCheckReport["kind"],
    reason?: string,
  ): WorkspaceDiagnosticCheckReport => {
    const end = startOffset + files.length;
    return {
      kind,
      files,
      total,
      startOffset,
      nextOffset: total !== null && end >= total ? 0 : end,
      remaining: total === null ? null : Math.max(0, total - end),
      ...(reason ? { reason } : {}),
    };
  };
  try {
    throwIfCodeRequestInterrupted(control);
    const inventory = await runtime.scanWorkspaceSources(control);
    throwIfCodeRequestInterrupted(control);
    if (inventory.status !== "complete") {
      return report(
        "partial",
        `Source discovery incomplete: ${inventory.reason} (${inventory.observedFileCount} files observed).`,
      );
    }
    total = inventory.files.length;
    startOffset = options.offset >= 0 && options.offset < total ? options.offset : 0;
    const selected = inventory.files.slice(startOffset, startOffset + DIAGNOSTIC_CHECK_BATCH_SIZE);
    const batch = await runtime.bulkTrackFiles(selected, control);
    for (const outcome of batch.outcomes) {
      throwIfCodeRequestInterrupted(control);
      files.push(await checkFile(outcome, runtime, cwd, control));
    }
    throwIfCodeRequestInterrupted(control);
    return report("completed");
  } catch (error) {
    if (control.signal?.aborted || !isCodeRequestInterruption(error, control)) throw error;
    return report(
      "partial",
      "Check time limit reached; remaining files were not checked. Run Check again to continue.",
    );
  }
}

async function checkFile(
  outcome: BulkTrackFileOutcome,
  runtime: WorkspaceLspRuntime,
  cwd: string,
  control: CodeRequestControl,
): Promise<DiagnosticCheckFile> {
  if (outcome.kind === "skipped" || outcome.kind === "unavailable") {
    return { file: outcome.file, status: outcome.kind, reason: outcome.reason };
  }
  const result = await collectScopedFileDiagnostics({
    service: runtime,
    scope: { kind: "file", path: outcome.file },
    cwd,
    requestControl: control,
  });
  if (result.kind === "not-requested")
    throw new Error("Diagnostic check did not request diagnostics.");
  return {
    file: outcome.file,
    status: result.evidence.documents[0]?.status ?? "failed",
    ...(result.kind === "partial" || result.kind === "unavailable"
      ? { reason: result.reason }
      : {}),
  };
}
