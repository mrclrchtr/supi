/**
 * Evidence-list helpers — the shared leaf utility for bounded tool-evidence
 * collections with explicit completeness metadata.
 *
 * These helpers (types, builders, disclosure renderers) are consumed by both
 * the `analysis/` layer (brief/reference/git formatters that produce markdown
 * fragments) and the `tool/` layer (markdown/TUI renderers and tool-result
 * assembly). They live here, at the lower layer, so `analysis/` never imports
 * upward into `tool/`. The tool-result *assembly* (`assemble*` functions and
 * details types) lives in `src/tool/result/`; this module is the shared
 * evidence-list primitive beneath it.
 */

export type EvidencePartialReason =
  | "timeout"
  | "safety-limit"
  | "interrupted"
  | "provider-limited"
  | "filesystem-error"
  | "configuration-error"
  | "invalid-provider-location";

export interface EvidenceListMetadata {
  key: string;
  totalCount: number | null;
  shownCount: number;
  /** Known collected atoms hidden by presentation; null when not tracked. */
  omittedCount: number | null;
  partialReason: EvidencePartialReason | null;
  /** Unusable semantic-provider locations excluded from valid evidence totals. */
  invalidLocationCount?: number;
}

export interface EvidenceList<T> {
  key: string;
  items: T[];
  metadata: EvidenceListMetadata;
}

export interface CreateEvidenceListParams<T> {
  key: string;
  items: T[];
  maxResults?: number;
  sort?: (a: T, b: T) => number;
}

export interface CreatePartialEvidenceListParams<T> {
  key: string;
  items: T[];
  partialReason: EvidencePartialReason;
  /** Optional display cap; the overall evidence total remains unknown. */
  maxResults?: number;
}

export interface EvidenceListSummary {
  omittedCount: number;
  evidenceLists: EvidenceListMetadata[];
}

export function createEvidenceList<T>(params: CreateEvidenceListParams<T>): EvidenceList<T> {
  const ordered = params.sort ? [...params.items].sort(params.sort) : [...params.items];
  const maxResults = params.maxResults ?? ordered.length;
  const items = ordered.slice(0, Math.max(0, maxResults));
  const omittedCount = Math.max(0, ordered.length - items.length);

  return {
    key: params.key,
    items,
    metadata: {
      key: params.key,
      totalCount: ordered.length,
      shownCount: items.length,
      omittedCount,
      partialReason: null,
    },
  };
}

export function createPartialEvidenceList<T>(
  params: CreatePartialEvidenceListParams<T>,
): EvidenceList<T> {
  const maxResults = params.maxResults ?? params.items.length;
  const items = params.items.slice(0, Math.max(0, maxResults));
  return {
    key: params.key,
    items,
    metadata: {
      key: params.key,
      totalCount: null,
      shownCount: items.length,
      omittedCount:
        params.maxResults === undefined ? null : Math.max(0, params.items.length - items.length),
      partialReason: params.partialReason,
    },
  };
}

export function renderEvidenceListDisclosure<T>(list: EvidenceList<T>): string | null {
  return renderEvidenceListMetadataDisclosure(list.metadata);
}

export function renderEvidenceListMetadataDisclosure(
  metadata: EvidenceListMetadata,
): string | null {
  if (metadata.totalCount === null) {
    if (metadata.partialReason === null) return null;
    const omitted = metadata.omittedCount ?? 0;
    const omittedDisclosure = omitted > 0 ? `; ${omitted} collected omitted` : "";
    return `_(showing ${metadata.shownCount}${omittedDisclosure}; more may exist — ${metadata.partialReason})_`;
  }

  if ((metadata.omittedCount ?? 0) <= 0) return null;
  return `_(showing ${metadata.shownCount} of ${metadata.totalCount}; ${metadata.omittedCount} omitted)_`;
}

export function summarizeEvidenceLists(lists: EvidenceList<unknown>[]): EvidenceListSummary {
  return {
    omittedCount: lists.reduce((sum, list) => sum + (list.metadata.omittedCount ?? 0), 0),
    evidenceLists: lists.map((list) => list.metadata),
  };
}
