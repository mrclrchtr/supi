/** Structured metadata for a partial query result. */
export interface CodeQueryPartialMetadata {
  /** Automatic path-policy evidence removed from a collected result. */
  readonly automaticPathExclusion?: {
    readonly excludedCount: number;
    readonly examples: readonly string[];
  };
}

/**
 * Result of a read-only code-provider query.
 *
 * `completed` includes successful empty observations, such as an empty
 * reference list or a protocol-level null hover. `partial` preserves usable
 * data when a multi-provider query could not complete every branch.
 * `unavailable` means the query did not establish a result.
 */
export type CodeQueryResult<T> =
  | { readonly kind: "completed"; readonly data: T }
  | {
      readonly kind: "partial";
      readonly data: T;
      readonly reason: string;
      readonly metadata?: CodeQueryPartialMetadata;
    }
  | { readonly kind: "unavailable"; readonly reason: string };

/** Construct a successfully completed code-query result, including empty data. */
export function completedCodeQuery<T>(data: T): CodeQueryResult<T> {
  return { kind: "completed", data };
}

/** Construct a usable but incomplete code-query result. */
export function partialCodeQuery<T>(
  data: T,
  reason: string,
  metadata?: CodeQueryPartialMetadata,
): CodeQueryResult<T> {
  return { kind: "partial", data, reason, ...(metadata ? { metadata } : {}) };
}

/** Construct a code-query result that could not be established. */
export function unavailableCodeQuery<T = never>(reason: string): CodeQueryResult<T> {
  return { kind: "unavailable", reason };
}

/** Map completed or partial query data while preserving its availability state. */
export function mapCodeQueryResult<T, U>(
  result: CodeQueryResult<T>,
  map: (data: T) => U,
): CodeQueryResult<U> {
  switch (result.kind) {
    case "completed":
      return completedCodeQuery(map(result.data));
    case "partial":
      return partialCodeQuery(map(result.data), result.reason, result.metadata);
    case "unavailable":
      return unavailableCodeQuery(result.reason);
  }
}
