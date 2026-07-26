/**
 * Workflow target store — per-session target and span handle registry.
 *
 * Provides deterministic opaque IDs derived from cwd, file, position,
 * metadata, and file fingerprint. Re-resolving the same target with
 * unchanged file contents reuses the same IDs.
 *
 * The store map is passed in from the caller; this module provides pure
 * functions without module-level state.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";

// ── Public types ──────────────────────────────────────────────────────

/**
 * Which anchor a resolved target carries, per ADR 0003.
 * - `name` — the identifier token (preferred by position-strict substrates).
 * - `declaration` — the defining node start (export/modifiers); a fallback
 *   when the name anchor could not be derived. Position-strict consumers
 *   (rename, callees) must refuse rather than silently use it.
 */
export type AnchorKind = "name" | "declaration";

/** Provider families that contributed evidence to one resolved target. */
export type TargetProviderProvenance = "semantic" | "structural";

/**
 * A stored resolved target entry with handles and metadata.
 *
 * This is the canonical post-registration target type — all tool layers
 * (executors, renderers, details) use it directly. Computed fields like
 * relative paths are derived at the rendering boundary.
 */
export interface TargetStoreEntry {
  targetId: string;
  spanId: string;
  /** Absolute filesystem path. Compute relative paths at render time with `path.relative(cwd, file)`. */
  file: string;
  /** 0-based position for LSP calls. */
  position: { line: number; character: number };
  /** Stable 0-based declaration occurrence used to distinguish overloads. */
  declarationPosition?: { line: number; character: number } | null;
  declarationOccurrence?: number;
  /** 1-based position for user display. */
  displayLine: number;
  displayCharacter: number;
  name: string | null;
  kind: string | null;
  confidence: ConfidenceMode;
  /** Monotonic provider families that established this target. */
  provenance: readonly TargetProviderProvenance[];
  /** Which anchor this target carries — drives strict-consumer enforcement (ADR 0003). */
  anchorKind: AnchorKind;
  fileFingerprint: string;
  /** Named symbolic container, or null when no container name was reported. */
  container: string | null;
  /**
   * Resolution provenance — present when the target was resolved from
   * anchored coordinates. Carries requested/resolved coordinates, whether
   * the anchor was snapped, and the provider-backed evidence source.
   */
  resolution?: import("../types/index.ts").AnchoredResolutionMetadata;
}

/** Input shape for registering a resolved target. */
export interface TargetRegistrationInput {
  file: string;
  position: { line: number; character: number };
  /**
   * Stable 0-based declaration occurrence. Provider-backed registrations
   * supply this so overloads remain distinct while name refinement retains
   * the same target identity.
   */
  declarationPosition?: { line: number; character: number };
  /** Zero-based occurrence among matching declarations on the same line. */
  declarationOccurrence?: number;
  displayLine: number;
  displayCharacter: number;
  name: string | null;
  kind: string | null;
  /** Provider-independent declaration kind used only for stable identity. */
  identityKind?: string;
  confidence: ConfidenceMode;
  /** Provider families observed by this registration. */
  provenance: readonly TargetProviderProvenance[];
  /** Which anchor this target carries — drives strict-consumer enforcement (ADR 0003). */
  anchorKind: AnchorKind;
  /** Named symbolic container used to disambiguate same-file identity collisions, or null when unreported (ADR 0003). */
  container: string | null;
  /**
   * Resolution provenance — present when the target was resolved from
   * anchored coordinates. Carries requested/resolved coordinates, whether
   * the anchor was snapped, and the provider-backed evidence source.
   */
  resolution?: import("../types/index.ts").AnchoredResolutionMetadata;
  /** Reuse one verified fingerprint across a bounded registration batch. */
  fileFingerprint?: string;
}

/** Output from registering a target: stable session-scoped handles and the full stored entry. */
export interface TargetRegistrationOutput {
  targetId: string;
  spanId: string;
  entry: TargetStoreEntry;
}

/** Lookup result for a target ID query. */
export type TargetLookupResult =
  | { kind: "available"; entry: TargetStoreEntry }
  | { kind: "unavailable"; reason: string };

// ── Helpers ───────────────────────────────────────────────────────────

function normalizeCwd(cwd: string): string {
  return cwd.replace(/\\/g, "/").replace(/\/$/, "");
}

// ── File fingerprinting ───────────────────────────────────────────────

/**
 * Compute a full-file SHA-256 fingerprint for staleness detection.
 * Returns an error result when the file is missing or unreadable.
 */
export function computeFileFingerprint(
  file: string,
): { kind: "ok"; fingerprint: string } | { kind: "error"; message: string } {
  try {
    if (!existsSync(file)) {
      return { kind: "error", message: `File not found: \`${file}\`` };
    }
    const content = readFileSync(file, { flag: "r" });
    const hash = createHash("sha256").update(content).digest("hex");
    return { kind: "ok", fingerprint: hash };
  } catch {
    return { kind: "error", message: `Cannot read file: \`${file}\`` };
  }
}

// ── ID generation ─────────────────────────────────────────────────────

/**
 * Build a deterministic target handle from target identity fields.
 *
 * Per ADR 0003, the preferred display/name-anchor position is excluded from
 * symbol identity because it may refine. Identity uses cwd, file path, name,
 * canonical provider-independent kind, container, stable declaration line and
 * same-line occurrence, and fingerprint. The occurrence keeps overloads
 * distinct without coupling identity to provider-specific declaration columns.
 */
function computeTargetId(opts: {
  cwd: string;
  file: string;
  name: string | null;
  identityKind: string;
  container: string | null;
  declarationPosition: { line: number; character: number } | null;
  declarationOccurrence: number;
  fingerprint: string;
}): string {
  const hash = createHash("sha256");
  hash.update(normalizeCwd(opts.cwd));
  hash.update("\0");
  hash.update(resolve(opts.cwd, opts.file));
  hash.update("\0");
  hash.update(opts.name ?? "");
  hash.update("\0");
  hash.update(opts.identityKind);
  hash.update("\0");
  hash.update(opts.container ?? "");
  hash.update("\0");
  hash.update(
    opts.declarationPosition
      ? `${opts.declarationPosition.line}:${opts.declarationOccurrence}`
      : "",
  );
  hash.update("\0");
  hash.update(opts.fingerprint);
  return `tg-${hash.digest("hex").slice(0, 28)}`;
}

/**
 * Build a deterministic span handle from the file and 0-based range.
 */
function computeSpanId(
  cwd: string,
  file: string,
  position: { line: number; character: number },
  fingerprint: string,
): string {
  const hash = createHash("sha256");
  hash.update(normalizeCwd(cwd));
  hash.update("\0");
  hash.update(resolve(cwd, file));
  hash.update("\0");
  hash.update(`${position.line}:${position.character}`);
  hash.update("\0");
  hash.update(fingerprint);
  return `sp-${hash.digest("hex").slice(0, 24)}`;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Register a resolved target in the given session-scoped store and return
 * stable session-scoped handles.
 *
 * If the same target identity (file, name, canonical kind, container,
 * declaration occurrence, and fingerprint) is registered again, its stable
 * target ID is reused and compatible facts are merged monotonically.
 * Unreadable files are registered as unfingerprinted and rechecked on lookup.
 */
export function registerWorkflowTarget(
  store: Map<string, TargetStoreEntry>,
  cwd: string,
  input: TargetRegistrationInput,
): TargetRegistrationOutput {
  const key = normalizeCwd(cwd);
  const absFile = resolve(cwd, input.file);

  // Compute fingerprint; if unavailable, still allow registration but
  // mark as unfingerprinted so stale checks know the fingerprint is absent
  const fingerprintResult = input.fileFingerprint ? null : computeFileFingerprint(absFile);
  const fingerprint =
    input.fileFingerprint ??
    (fingerprintResult?.kind === "ok" ? fingerprintResult.fingerprint : "unfingerprinted");

  const targetId = computeTargetId({
    cwd: key,
    file: input.file,
    name: input.name,
    identityKind: input.identityKind ?? input.kind ?? "",
    container: input.container,
    declarationPosition: input.declarationPosition ?? null,
    declarationOccurrence: input.declarationOccurrence ?? 0,
    fingerprint,
  });
  const spanId = computeSpanId(key, input.file, input.position, fingerprint);

  const incoming: TargetStoreEntry = {
    targetId,
    spanId,
    file: absFile,
    position: { line: input.position.line, character: input.position.character },
    declarationPosition: input.declarationPosition ? { ...input.declarationPosition } : null,
    declarationOccurrence: input.declarationOccurrence ?? 0,
    displayLine: input.displayLine,
    displayCharacter: input.displayCharacter,
    name: input.name,
    kind: input.kind,
    confidence: input.confidence,
    provenance: normalizeProvenance(input.provenance),
    anchorKind: input.anchorKind,
    fileFingerprint: fingerprint,
    container: input.container,
    resolution: input.resolution,
  };

  const existing = store.get(targetId);
  const entry = existing ? mergeTargetRefinement(existing, incoming) : incoming;
  store.set(targetId, entry);

  return { targetId, spanId: entry.spanId, entry };
}

/**
 * Merge compatible facts behind one stable target ID. Anchor precision,
 * evidence strength, display kind, and provider provenance refine independently
 * so no weaker or missing observation erases stronger established facts.
 */
function mergeTargetRefinement(
  existing: TargetStoreEntry,
  incoming: TargetStoreEntry,
): TargetStoreEntry {
  const anchorSource = selectAnchorSource(existing, incoming);
  const strongestEvidenceSource = selectStrongestEvidenceSource(existing, incoming);
  // Missing classification is not evidence that can erase an established display kind.
  const displayKind = strongestEvidenceSource.kind ?? existing.kind ?? incoming.kind;

  return {
    ...existing,
    spanId: anchorSource.spanId,
    position: { ...anchorSource.position },
    displayLine: anchorSource.displayLine,
    displayCharacter: anchorSource.displayCharacter,
    kind: displayKind,
    anchorKind: anchorSource.anchorKind,
    resolution: anchorSource.resolution,
    confidence: strongestEvidenceSource.confidence,
    provenance: mergeProvenance(existing.provenance, incoming.provenance),
  };
}

function selectAnchorSource(
  existing: TargetStoreEntry,
  incoming: TargetStoreEntry,
): TargetStoreEntry {
  if (existing.anchorKind === "declaration" && incoming.anchorKind === "name") return incoming;
  if (existing.anchorKind === "name" && incoming.anchorKind === "declaration") return existing;
  if (!existing.resolution && incoming.resolution) return incoming;
  return existing;
}

function selectStrongestEvidenceSource(
  existing: TargetStoreEntry,
  incoming: TargetStoreEntry,
): TargetStoreEntry {
  return confidenceRank(incoming.confidence) > confidenceRank(existing.confidence)
    ? incoming
    : existing;
}

const PROVENANCE_ORDER: readonly TargetProviderProvenance[] = ["semantic", "structural"];

function normalizeProvenance(
  provenance: readonly TargetProviderProvenance[],
): readonly TargetProviderProvenance[] {
  const sources = new Set(provenance);
  return Object.freeze(PROVENANCE_ORDER.filter((source) => sources.has(source)));
}

function mergeProvenance(
  existing: readonly TargetProviderProvenance[],
  incoming: readonly TargetProviderProvenance[],
): readonly TargetProviderProvenance[] {
  return normalizeProvenance([...existing, ...incoming]);
}

function confidenceRank(confidence: ConfidenceMode): number {
  switch (confidence) {
    case "semantic":
      return 3;
    case "structural":
      return 2;
    case "heuristic":
      return 1;
    case "unavailable":
      return 0;
  }
}

/**
 * Look up a stored target by targetId in the given session-scoped store.
 *
 * Returns `{ kind: "available", entry }` when found.
 * Returns `{ kind: "unavailable", reason }` when unknown or stale.
 *
 * Staleness is detected by comparing the stored fileFingerprint
 * against the current file contents. If the fingerprint was
 * "unfingerprinted" (file was unreadable at registration time),
 * staleness cannot be confirmed and the entry is returned as-is.
 */
export function getWorkflowTarget(
  store: Map<string, TargetStoreEntry>,
  targetId: string,
): TargetLookupResult {
  const entry = store.get(targetId);
  if (!entry) {
    return {
      kind: "unavailable",
      reason: `Target \`${targetId}\` not found. It may have been cleared or never registered.`,
    };
  }

  // Check staleness: re-fingerprint unfingerprinted entries and
  // compare fingerprints for entries with known fingerprints.
  const current = computeFileFingerprint(entry.file);
  if (current.kind === "error") {
    // File is gone or unreadable — remove and report unavailable
    store.delete(targetId);
    return {
      kind: "unavailable",
      reason: `${current.message} — target \`${targetId}\` is no longer available.`,
    };
  }

  if (entry.fileFingerprint === "unfingerprinted") {
    // Entry was registered without a fingerprint — update it now
    entry.fileFingerprint = current.fingerprint;
    return { kind: "available", entry };
  }

  if (current.fingerprint !== entry.fileFingerprint) {
    // Stale — remove and report unavailable
    store.delete(targetId);
    return {
      kind: "unavailable",
      reason: `Target \`${targetId}\` (\`${entry.name ?? entry.file}\`) is stale — the backing file has been modified since resolution. Re-resolve with \`code_resolve\`.`,
    };
  }

  return { kind: "available", entry };
}
