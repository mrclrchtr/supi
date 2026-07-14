import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { EvidenceListMetadata, EvidencePartialReason } from "../../analysis/evidence.ts";
import type { ReadNextItem } from "../../analysis/read-next.ts";

/** Provenance attached to an assembled result or one of its sections. */
export interface ResultProvenance {
  readonly source: "semantic" | "structural" | "filesystem" | "git" | "runtime";
  readonly capability?: string;
  readonly detail?: string;
}

/** A presentation-neutral result section. */
export interface ResultSection<T = unknown> {
  readonly key: string;
  readonly title: string;
  readonly status: "complete" | "partial" | "unavailable";
  readonly items: readonly T[];
  readonly confidence: ConfidenceMode;
  readonly provenance: readonly ResultProvenance[];
}

/** A follow-up action assembled before markdown or TUI rendering. */
export type ResultAction =
  | { readonly kind: "query"; readonly instruction: string }
  | ({ readonly kind: "read-next" } & Readonly<ReadNextItem>);

/** Totals and omission state shared by every Tool result. */
export interface ResultTotals {
  readonly candidateCount: number;
  readonly shownCount: number;
  readonly omittedCount: number;
  readonly hasUnknownRemainder: boolean;
  readonly partialReasons: readonly EvidencePartialReason[];
}

/** Canonical assembled result consumed by markdown and TUI adapters. */
export interface ToolResultAssembly<TData> {
  readonly data: Readonly<TData>;
  readonly sections: readonly ResultSection[];
  readonly evidenceLists: readonly EvidenceListMetadata[];
  readonly actions: readonly ResultAction[];
  readonly totals: ResultTotals;
  readonly confidence: ConfidenceMode;
  readonly provenance: readonly ResultProvenance[];
}

export interface AssembleToolResultInput<TData> {
  readonly data: TData;
  readonly sections?: readonly ResultSection[];
  readonly evidenceLists?: readonly EvidenceListMetadata[];
  readonly nextQueries?: readonly string[];
  readonly readNext?: readonly ReadNextItem[];
  readonly candidateCount?: number;
  readonly confidence: ConfidenceMode;
  readonly provenance?: readonly ResultProvenance[];
}

/**
 * Assemble shared Tool-result policy once: evidence totals, omission state,
 * confidence, provenance, and actionable follow-up guidance.
 */
export function assembleToolResult<TData>(
  input: AssembleToolResultInput<TData>,
): ToolResultAssembly<TData> {
  const evidenceLists = [...(input.evidenceLists ?? [])];
  const shownCount = evidenceLists.reduce((sum, list) => sum + list.shownCount, 0);
  const omittedCount = evidenceLists.reduce((sum, list) => sum + (list.omittedCount ?? 0), 0);
  const partialReasons = Array.from(
    new Set(
      evidenceLists
        .map((list) => list.partialReason)
        .filter((reason): reason is EvidencePartialReason => reason !== null),
    ),
  );
  const actions: ResultAction[] = [
    ...(input.nextQueries ?? []).map(
      (instruction): ResultAction => ({ kind: "query", instruction }),
    ),
    ...(input.readNext ?? []).map((item): ResultAction => ({ kind: "read-next", ...item })),
  ];

  return Object.freeze({
    data: input.data,
    sections: Object.freeze([...(input.sections ?? [])]),
    evidenceLists: Object.freeze(evidenceLists),
    actions: Object.freeze(actions),
    totals: Object.freeze({
      candidateCount: input.candidateCount ?? shownCount + omittedCount,
      shownCount,
      omittedCount,
      hasUnknownRemainder: evidenceLists.some((list) => list.totalCount === null),
      partialReasons: Object.freeze(partialReasons),
    }),
    confidence: input.confidence,
    provenance: Object.freeze([...(input.provenance ?? [])]),
  });
}

/** Query instructions projected from canonical actions for existing detail adapters. */
export function assembledNextQueries(result: ToolResultAssembly<unknown>): string[] {
  return result.actions
    .filter((action): action is Extract<ResultAction, { kind: "query" }> => action.kind === "query")
    .map((action) => action.instruction);
}
