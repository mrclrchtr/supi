import { describeEvidenceList, type EvidenceListFacts } from "../../analysis/evidence.ts";

/** Canonical evidence phrase for one graph list, plus its external-location count. */
export function formatGraphEvidence(
  facts: EvidenceListFacts,
  noun: "locations" | "call sites",
  externalCount = 0,
): string {
  const text = describeEvidenceList(facts, { one: singularGraphNoun(noun), other: noun });
  if (externalCount === 0) return text;
  return `${text}; ${externalCount} external location${externalCount === 1 ? "" : "s"}`;
}

function singularGraphNoun(noun: "locations" | "call sites"): string {
  switch (noun) {
    case "locations":
      return "location";
    case "call sites":
      return "call site";
  }
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
