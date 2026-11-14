/**
 * Evidence list module — the sole producer of bounded Tool-evidence
 * collections and their completeness metadata (code-intelligence ADR 0004).
 *
 * Every Evidence list is built by one of three constructors:
 * - {@link createEvidenceList}: all collected items are in hand; a Result cap
 *   selects the shown items and the total is exact.
 * - {@link createBoundedEvidenceList}: items were already bounded upstream and
 *   a provider counted the exact total.
 * - {@link createPartialEvidenceList}: collection is incomplete, so the total
 *   is unknown.
 *
 * Each list publishes its Evidence completeness state and derived counts.
 * Readers never recompute `total − shown` or infer completeness from a null
 * total; they read the metadata and use {@link describeEvidenceList} or
 * {@link renderEvidenceListMetadataDisclosure} for canonical wording.
 *
 * Metadata is a branded readonly type, so object literals cannot pose as
 * Evidence list metadata. Inconsistent counts are programmer errors and throw.
 *
 * The module lives below `tool/` so session collectors and tool adapters can
 * both depend on it without `analysis/` importing upward.
 */

export type EvidencePartialReason =
  | "timeout"
  | "safety-limit"
  | "interrupted"
  | "provider-limited"
  | "filesystem-error"
  | "configuration-error"
  | "invalid-provider-location";

/** Reasons a collection itself was incomplete; invalid locations are counted separately. */
export type CollectionPartialReason = Exclude<EvidencePartialReason, "invalid-provider-location">;

/**
 * Evidence completeness state of one Evidence list.
 *
 * - `complete`: every collected Evidence atom is shown and collection finished.
 * - `capped`: exact total; a Result cap omitted some atoms.
 * - `partial`: collection is incomplete, or invalid provider locations were
 *   excluded beside an exact valid total; hidden collected atoms are counted.
 * - `unbounded`: collection is incomplete; hidden collected atoms are not counted.
 */
export type EvidenceCompleteness = "complete" | "capped" | "partial" | "unbounded";

/**
 * Plain completeness facts of one Evidence list, as serialized in Tool details.
 * Readers of persisted details parse into this shape; only this module produces
 * the branded {@link EvidenceListMetadata}.
 */
export interface EvidenceListFacts {
  readonly key: string;
  readonly completeness: EvidenceCompleteness;
  /** Exact Evidence atom total; null when collection is incomplete. */
  readonly totalCount: number | null;
  readonly shownCount: number;
  /** Collected atoms hidden by a Result cap; null only for `unbounded` lists. */
  readonly omittedCount: number | null;
  readonly partialReason: EvidencePartialReason | null;
  /** Provider explanation for incomplete collection, when available. */
  readonly partialMessage?: string;
  /** Unusable semantic-provider locations excluded from valid evidence totals. */
  readonly invalidLocationCount?: number;
}

declare const evidenceListBrand: unique symbol;

/** Evidence list metadata produced only by this module's constructors. */
export type EvidenceListMetadata = EvidenceListFacts & { readonly [evidenceListBrand]: true };

export interface EvidenceList<T> {
  readonly key: string;
  readonly items: T[];
  readonly metadata: EvidenceListMetadata;
}

interface CommonEvidenceListParams<T> {
  key: string;
  items: readonly T[];
  /** Provider explanation for incomplete collection. */
  partialMessage?: string;
  /** Unusable provider locations excluded from the valid items. */
  invalidLocationCount?: number;
}

export interface CreateEvidenceListParams<T> extends CommonEvidenceListParams<T> {
  /** Result cap; the total stays exact. */
  maxResults?: number;
  /** Evidence ordering applied before the cap. */
  sort?: (a: T, b: T) => number;
}

export interface CreateBoundedEvidenceListParams<T> extends CommonEvidenceListParams<T> {
  /** Exact provider-counted total, including atoms not passed as items. */
  totalCount: number;
}

export type CreatePartialEvidenceListParams<T> = CommonEvidenceListParams<T> & {
  partialReason: CollectionPartialReason;
} & (
    | {
        /** Result cap over the collected items. */
        maxResults?: number;
        collectedCount?: never;
      }
    | {
        /**
         * Atoms collected before `items` were bounded upstream; null when the
         * hidden collected atoms were not counted.
         */
        collectedCount: number | null;
        maxResults?: never;
      }
  );

/** Build a list from every collected item; a Result cap keeps the total exact. */
export function createEvidenceList<T>(params: CreateEvidenceListParams<T>): EvidenceList<T> {
  const ordered = params.sort ? [...params.items].sort(params.sort) : [...params.items];
  const items = ordered.slice(0, checkedCap(params.key, params.maxResults, ordered.length));
  return list(params, { items, totalCount: ordered.length, collectedCount: ordered.length });
}

/** Build a list from pre-bounded items whose exact total a provider counted. */
export function createBoundedEvidenceList<T>(
  params: CreateBoundedEvidenceListParams<T>,
): EvidenceList<T> {
  const { totalCount } = params;
  return list(params, { items: [...params.items], totalCount, collectedCount: totalCount });
}

/** Build a list for incomplete collection; the overall total stays unknown. */
export function createPartialEvidenceList<T>(
  params: CreatePartialEvidenceListParams<T>,
): EvidenceList<T> {
  if (params.collectedCount !== undefined) {
    return list(params, {
      items: [...params.items],
      totalCount: null,
      collectedCount: params.collectedCount,
      partialReason: params.partialReason,
    });
  }
  const items = params.items.slice(
    0,
    checkedCap(params.key, params.maxResults, params.items.length),
  );
  return list(params, {
    items,
    totalCount: null,
    collectedCount: params.items.length,
    partialReason: params.partialReason,
  });
}

/** Reuse established metadata under another public evidence key. */
export function rekeyEvidence(metadata: EvidenceListMetadata, key: string): EvidenceListMetadata {
  return Object.freeze({ ...metadata, key });
}

/** Plain serializable copy of list metadata for structured Tool details. */
export function toEvidenceListFacts(metadata: EvidenceListFacts): EvidenceListFacts {
  return {
    key: metadata.key,
    completeness: metadata.completeness,
    totalCount: metadata.totalCount,
    shownCount: metadata.shownCount,
    omittedCount: metadata.omittedCount,
    partialReason: metadata.partialReason,
    ...(metadata.partialMessage === undefined ? {} : { partialMessage: metadata.partialMessage }),
    ...(metadata.invalidLocationCount === undefined
      ? {}
      : { invalidLocationCount: metadata.invalidLocationCount }),
  };
}

const PARTIAL_REASONS: ReadonlySet<string> = new Set<EvidencePartialReason>([
  "timeout",
  "safety-limit",
  "interrupted",
  "provider-limited",
  "filesystem-error",
  "configuration-error",
  "invalid-provider-location",
]);

/**
 * Parse persisted Tool details back into Evidence list facts. Returns null for
 * malformed or internally inconsistent entries; renderers never repair them.
 */
export function readEvidenceListFacts(value: unknown): EvidenceListFacts | null {
  const facts = readFactsShape(value);
  return facts && isConsistent(facts) ? toEvidenceListFacts(facts) : null;
}

/** Field-level validation only; consistency is checked separately. */
function readFactsShape(value: unknown): EvidenceListFacts | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { key, completeness, totalCount, shownCount, omittedCount, partialReason } = record;
  const { partialMessage, invalidLocationCount } = record;
  const valid =
    typeof key === "string" &&
    typeof completeness === "string" &&
    isCount(shownCount) &&
    isNullableCount(totalCount) &&
    isNullableCount(omittedCount) &&
    (partialReason === null || PARTIAL_REASONS.has(partialReason as string)) &&
    (partialMessage === undefined || typeof partialMessage === "string") &&
    (invalidLocationCount === undefined || isCount(invalidLocationCount));
  return valid ? (record as unknown as EvidenceListFacts) : null;
}

/** The invariants every constructor guarantees. */
function isConsistent(facts: EvidenceListFacts): boolean {
  const { totalCount, shownCount, omittedCount, partialReason } = facts;
  const invalidReason = partialReason === "invalid-provider-location";
  // Only invalid provider locations keep an exact total beside a partial reason.
  const exactTotal = partialReason === null || invalidReason;
  return (
    facts.completeness === completenessOf(partialReason, omittedCount) &&
    exactTotal === (totalCount !== null) &&
    (totalCount === null || totalCount === shownCount + (omittedCount ?? -1)) &&
    invalidReason === (facts.invalidLocationCount ?? 0) > 0
  );
}

/**
 * Mark a constructed list incomplete after its upstream collection was
 * interrupted. Counts are kept; the total becomes unknown. Lists carrying
 * invalid provider locations cannot be re-marked.
 */
export function markEvidencePartial(
  metadata: EvidenceListMetadata,
  partialReason: CollectionPartialReason,
  partialMessage?: string,
): EvidenceListMetadata {
  if (metadata.invalidLocationCount) {
    throw new Error(`Evidence list ${metadata.key}: cannot re-mark a list with invalid locations`);
  }
  return freeze({
    ...metadata,
    completeness: completenessOf(partialReason, metadata.omittedCount),
    totalCount: null,
    partialReason,
    ...(partialMessage === undefined ? {} : { partialMessage }),
  });
}

/**
 * Evidence atoms this list establishes: the exact total, or for incomplete
 * collection the shown plus counted hidden atoms. Never a completeness claim.
 */
export function knownEvidenceCount(facts: EvidenceListFacts): number {
  return facts.totalCount ?? facts.shownCount + (facts.omittedCount ?? 0);
}

/** Optional atom noun for {@link describeEvidenceList}. */
export type EvidenceNoun = string | { readonly one: string; readonly other: string };

/**
 * Canonical Truncation-disclosure phrase for one Evidence list, without
 * surrounding markup. Every presentation surface uses this wording.
 */
export function describeEvidenceList(facts: EvidenceListFacts, noun?: EvidenceNoun): string {
  const label = nounFor(noun, facts.totalCount ?? facts.shownCount);
  const parts: string[] = [];
  if (facts.totalCount === null) {
    parts.push(`${facts.shownCount}${label}`);
    if (facts.omittedCount) parts.push(`${facts.omittedCount} collected omitted`);
    parts.push(`more may exist — ${facts.partialReason ?? "partial"}`);
    if (facts.partialMessage) parts.push(facts.partialMessage);
  } else if (facts.omittedCount) {
    parts.push(
      `${facts.shownCount} of ${facts.totalCount}${label}`,
      `${facts.omittedCount} omitted`,
    );
  } else {
    parts.push(`${facts.totalCount}${label}`);
  }
  if (facts.invalidLocationCount) {
    const locations = facts.invalidLocationCount === 1 ? "location" : "locations";
    parts.push(
      `${facts.invalidLocationCount} invalid provider ${locations} omitted (invalid-provider-location)`,
    );
  }
  return parts.join("; ");
}

/** Markdown Truncation disclosure; null when the list is complete. */
export function renderEvidenceListMetadataDisclosure(
  facts: EvidenceListFacts,
  noun?: EvidenceNoun,
): string | null {
  if (facts.completeness === "complete") return null;
  return `_(showing ${describeEvidenceList(facts, noun)})_`;
}

/** Markdown Truncation disclosure for one list; null when the list is complete. */
export function renderEvidenceListDisclosure<T>(list: EvidenceList<T>): string | null {
  return renderEvidenceListMetadataDisclosure(list.metadata);
}

function list<T>(
  params: CommonEvidenceListParams<T>,
  counts: {
    items: T[];
    totalCount: number | null;
    collectedCount: number | null;
    partialReason?: CollectionPartialReason;
  },
): EvidenceList<T> {
  const { items, totalCount, collectedCount } = counts;
  const partialReason = counts.partialReason ?? null;
  const shownCount = items.length;
  const invalid = params.invalidLocationCount ?? 0;
  assertCount(params.key, "invalid location count", invalid);
  if (collectedCount !== null) {
    assertCount(params.key, "collected count", collectedCount);
    if (shownCount > collectedCount) {
      throw new Error(
        `Evidence list ${params.key}: shown count ${shownCount} exceeds collected count ${collectedCount}`,
      );
    }
  }
  const omittedCount = collectedCount === null ? null : collectedCount - shownCount;
  const reason = partialReason ?? (invalid > 0 ? "invalid-provider-location" : null);
  const metadata = freeze({
    key: params.key,
    completeness: completenessOf(reason, omittedCount),
    totalCount,
    shownCount,
    omittedCount,
    partialReason: reason,
    ...(params.partialMessage === undefined ? {} : { partialMessage: params.partialMessage }),
    ...(invalid > 0 ? { invalidLocationCount: invalid } : {}),
  });
  return { key: params.key, items, metadata };
}

function completenessOf(
  partialReason: EvidencePartialReason | null,
  omittedCount: number | null,
): EvidenceCompleteness {
  if (partialReason !== null) return omittedCount === null ? "unbounded" : "partial";
  return omittedCount ? "capped" : "complete";
}

function freeze(facts: EvidenceListFacts): EvidenceListMetadata {
  return Object.freeze(facts) as EvidenceListMetadata;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNullableCount(value: unknown): value is number | null {
  return value === null || isCount(value);
}

function checkedCap(key: string, maxResults: number | undefined, fallback: number): number {
  if (maxResults === undefined) return fallback;
  assertCount(key, "result cap", maxResults);
  return maxResults;
}

function assertCount(key: string, name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Evidence list ${key}: ${name} must be a non-negative integer, got ${value}`);
  }
}

function nounFor(noun: EvidenceNoun | undefined, count: number): string {
  if (noun === undefined) return "";
  if (typeof noun === "string") return ` ${noun}`;
  return ` ${count === 1 ? noun.one : noun.other}`;
}
