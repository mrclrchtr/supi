import type { EvidenceListMetadata } from "../../analysis/evidence.ts";

/** Format relation counts and all known limits in one place. */
export function formatGraphEvidence(
  metadata: Omit<EvidenceListMetadata, "partialReason"> & { partialReason: string | null },
  noun: "locations" | "call sites",
  externalCount = 0,
): string {
  const { shownCount, totalCount, omittedCount, partialReason, invalidLocationCount } = metadata;
  const count = totalCount ?? shownCount;
  const label = count === 1 ? (noun === "locations" ? "location" : "call site") : noun;
  let text =
    totalCount === null
      ? `${shownCount} ${label} shown${omittedCount ? `; ${omittedCount} collected omitted` : ""}; more may exist — ${partialReason}`
      : omittedCount
        ? `${shownCount} of ${totalCount} ${label} shown; ${omittedCount} omitted`
        : `${totalCount} ${label}`;
  if (externalCount > 0)
    text += `; ${externalCount} external location${externalCount === 1 ? "" : "s"}`;
  if (invalidLocationCount) {
    const invalidNoun = invalidLocationCount === 1 ? "location" : "locations";
    text += `; ${invalidLocationCount} invalid provider ${invalidNoun} omitted (invalid-provider-location)`;
  }
  return text;
}

/** Format a 1-based source-line range for either graph presentation. */
export function formatGraphRange(scope: { startLine: number; endLine: number }): string {
  return scope.startLine === scope.endLine
    ? `L${scope.startLine}`
    : `L${scope.startLine}–L${scope.endLine}`;
}

/** Bound a source label while keeping both ends of a chained expression. */
export function compactGraphLabel(value: string, limit = 100): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const tail = Math.floor(limit / 3);
  return `${text.slice(0, limit - tail - 1)}…${text.slice(-tail)}`;
}

/** Quote source text that can contain Markdown backticks. */
export function graphCodeSpan(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const delimiter = "`".repeat(Math.max(0, ...runs.map((run) => run.length)) + 1);
  return text.startsWith("`") || text.endsWith("`")
    ? `${delimiter} ${text} ${delimiter}`
    : `${delimiter}${text}${delimiter}`;
}
