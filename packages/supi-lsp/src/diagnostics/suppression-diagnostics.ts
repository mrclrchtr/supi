import type { Diagnostic } from "../types.ts";

const SUPPRESSION_WARNING_SEVERITY = 2;

/** Detect diagnostics that represent stale suppression comments. */
export function isStaleSuppressionDiagnostic(diagnostic: Diagnostic): boolean {
  const message = diagnostic.message.toLowerCase();

  if (message.includes("unused '@ts-expect-error' directive")) {
    return true;
  }

  if (diagnostic.source !== "biome") {
    return false;
  }

  return (
    message.includes("suppression comment has no effect") || message.includes("unused suppression")
  );
}

/**
 * Split diagnostics into regular inline diagnostics and stale suppression cleanup.
 *
 * Stale suppression warnings stay visible even when regular inline diagnostics are
 * configured to show errors only.
 */
export function splitSuppressionDiagnostics(
  diagnostics: Diagnostic[],
  maxSeverity: number,
): {
  regular: Diagnostic[];
  suppressions: Diagnostic[];
} {
  const suppressionMaxSeverity = Math.max(maxSeverity, SUPPRESSION_WARNING_SEVERITY);
  const regular: Diagnostic[] = [];
  const suppressions: Diagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const severity = diagnostic.severity;
    if (severity === undefined) {
      continue;
    }

    if (isStaleSuppressionDiagnostic(diagnostic)) {
      if (severity <= suppressionMaxSeverity) {
        suppressions.push(diagnostic);
      }
      continue;
    }

    if (severity <= maxSeverity) {
      regular.push(diagnostic);
    }
  }

  return { regular, suppressions };
}
