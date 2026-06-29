export type EvidencePartialReason = "timeout" | "safety-limit" | "interrupted" | "provider-limited";

export interface EvidenceListMetadata {
  key: string;
  totalCount: number | null;
  shownCount: number;
  omittedCount: number | null;
  partialReason: EvidencePartialReason | null;
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
  return {
    key: params.key,
    items: [...params.items],
    metadata: {
      key: params.key,
      totalCount: null,
      shownCount: params.items.length,
      omittedCount: null,
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
    return `_(showing ${metadata.shownCount}; more may exist — ${metadata.partialReason})_`;
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
