/**
 * Workflow target store — session-scoped target and span handle registry.
 *
 * Provides deterministic opaque IDs derived from cwd, file, position,
 * metadata, and file fingerprint. Re-resolving the same target with
 * unchanged file contents reuses the same IDs.
 *
 * The store is cwd-scoped in-memory. Cross-session persistence is
 * intentionally not implemented in Phase 1.
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

/** A stored resolved target entry with handles and metadata. */
export interface TargetStoreEntry {
  targetId: string;
  spanId: string;
  file: string;
  position: { line: number; character: number };
  displayLine: number;
  displayCharacter: number;
  name: string | null;
  kind: string | null;
  confidence: ConfidenceMode;
  provenance: string;
  anchorKind: AnchorKind;
  fileFingerprint: string;
}

/** Input shape for registering a resolved target. */
export interface TargetRegistrationInput {
  file: string;
  position: { line: number; character: number };
  displayLine: number;
  displayCharacter: number;
  name: string | null;
  kind: string | null;
  confidence: ConfidenceMode;
  provenance: string;
  /** Which anchor this target carries — drives strict-consumer enforcement (ADR 0003). */
  anchorKind: AnchorKind;
}

/** Output from registering a target: stable session-scoped handles. */
export interface TargetRegistrationOutput {
  targetId: string;
  spanId: string;
}

/** Lookup result for a target ID query. */
export type TargetLookupResult =
  | { kind: "available"; entry: TargetStoreEntry }
  | { kind: "unavailable"; reason: string };

// ── In-memory store ───────────────────────────────────────────────────

const store = new Map<string, Map<string, TargetStoreEntry>>();

function normalizeCwd(cwd: string): string {
  return cwd.replace(/\\/g, "/").replace(/\/$/, "");
}

// ── File fingerprinting ───────────────────────────────────────────────

const MAX_FINGERPRINT_BYTES = 1_048_576; // 1 MB — avoid hashing huge files

/**
 * Compute a SHA-256 file fingerprint for staleness detection.
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
    // Cap at MAX_FINGERPRINT_BYTES to avoid pathological files
    const buffer =
      content.length > MAX_FINGERPRINT_BYTES ? content.subarray(0, MAX_FINGERPRINT_BYTES) : content;
    const hash = createHash("sha256").update(buffer).digest("hex");
    return { kind: "ok", fingerprint: hash };
  } catch {
    return { kind: "error", message: `Cannot read file: \`${file}\`` };
  }
}

// ── ID generation ─────────────────────────────────────────────────────

/**
 * Build a deterministic target handle from target identity fields.
 *
 * Per ADR 0003, position is intentionally excluded from symbol identity:
 * nameAnchor is best-effort, so the same symbol can resolve to a name
 * anchor or fall back to the declaration anchor across calls; including
 * position would break the "re-resolve reuses the same IDs" invariant.
 * Identity is cwd, absolute file path, name, kind, and file fingerprint.
 */
function computeTargetId(opts: {
  cwd: string;
  file: string;
  position: { line: number; character: number };
  name: string | null;
  kind: string | null;
  fingerprint: string;
}): string {
  const hash = createHash("sha256");
  hash.update(normalizeCwd(opts.cwd));
  hash.update("\0");
  hash.update(resolve(opts.cwd, opts.file));
  hash.update("\0");
  hash.update(opts.name ?? "");
  hash.update("\0");
  hash.update(opts.kind ?? "");
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
 * Register a resolved target and return stable session-scoped handles.
 *
 * If the same target (same file, position, name, kind) is registered
 * and the file fingerprint matches, the same IDs are returned.
 *
 * Returns an error when the backing file cannot be read for fingerprinting.
 */
export function registerWorkflowTarget(
  cwd: string,
  input: TargetRegistrationInput,
): TargetRegistrationOutput {
  const key = normalizeCwd(cwd);
  const absFile = resolve(cwd, input.file);

  // Compute fingerprint; if unavailable, still allow registration but
  // mark as unfingerprinted so stale checks know the fingerprint is absent
  const fingerprintResult = computeFileFingerprint(absFile);
  const fingerprint =
    fingerprintResult.kind === "ok" ? fingerprintResult.fingerprint : "unfingerprinted";

  const targetId = computeTargetId({
    cwd: key,
    file: input.file,
    position: input.position,
    name: input.name,
    kind: input.kind,
    fingerprint,
  });
  const spanId = computeSpanId(key, input.file, input.position, fingerprint);

  // Check for existing entry with same targetId
  const cwdStore = store.get(key) ?? new Map<string, TargetStoreEntry>();
  const existing = cwdStore.get(targetId);
  if (existing) {
    return { targetId: existing.targetId, spanId: existing.spanId };
  }

  const entry: TargetStoreEntry = {
    targetId,
    spanId,
    file: absFile,
    position: { line: input.position.line, character: input.position.character },
    displayLine: input.displayLine,
    displayCharacter: input.displayCharacter,
    name: input.name,
    kind: input.kind,
    confidence: input.confidence,
    provenance: input.provenance,
    anchorKind: input.anchorKind,
    fileFingerprint: fingerprint,
  };

  cwdStore.set(targetId, entry);
  store.set(key, cwdStore);

  return { targetId, spanId };
}

/**
 * Look up a stored target by targetId.
 *
 * Returns `{ kind: "available", entry }` when found.
 * Returns `{ kind: "unavailable", reason }` when unknown or stale.
 *
 * Staleness is detected by comparing the stored fileFingerprint
 * against the current file contents. If the fingerprint was
 * "unfingerprinted" (file was unreadable at registration time),
 * staleness cannot be confirmed and the entry is returned as-is.
 */
export function getWorkflowTarget(cwd: string, targetId: string): TargetLookupResult {
  const key = normalizeCwd(cwd);
  const cwdStore = store.get(key);
  if (!cwdStore) {
    return { kind: "unavailable", reason: `No targets registered for this workspace (${key}).` };
  }

  const entry = cwdStore.get(targetId);
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
    cwdStore.delete(targetId);
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
    cwdStore.delete(targetId);
    return {
      kind: "unavailable",
      reason: `Target \`${targetId}\` (\`${entry.name ?? entry.file}\`) is stale — the backing file has been modified since resolution. Re-resolve with \`code_resolve\`.`,
    };
  }

  return { kind: "available", entry };
}

/** Clear all targets for a cwd. */
export function clearWorkflowTargets(cwd: string): void {
  const key = normalizeCwd(cwd);
  store.delete(key);
}

/** Clear all targets across all cwds (for test cleanup). */
export function clearAllWorkflowTargets(): void {
  store.clear();
}
