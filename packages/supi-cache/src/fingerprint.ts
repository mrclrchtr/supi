// Prompt fingerprint computation and diffing for granular prompt change detection.
//
// Computes a structured fingerprint from `BuildSystemPromptOptions` on every
// `before_agent_start` so that later regression diagnostics can describe
// exactly which prompt component changed (context files, tools, skills, etc.).

import type { BuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";
import { fastHash } from "./hash.ts";

/** Per-component fingerprint of the structured system prompt options. */
export interface PromptFingerprint {
  /** Hash of `customPrompt` text, or 0 if absent. */
  customPromptHash: number;
  /** Hash of `appendSystemPrompt` text, or 0 if absent. */
  appendSystemPromptHash: number;
  /** Hash of joined `promptGuidelines` array, or 0 if absent. */
  promptGuidelinesHash: number;
  /** Hash of sorted `selectedTools` array joined by comma, or 0 if absent. */
  selectedToolsHash: number;
  /** Hash of joined `toolSnippets` values (sorted by key), or 0 if absent. */
  toolSnippetsHash: number;
  /** Per-context-file hashes, preserving insertion order. */
  contextFiles: Array<{ path: string; hash: number }>;
  /** Per-skill hashes, preserving insertion order. */
  skills: Array<{ name: string; hash: number }>;
}

/**
 * Compute a deterministic fingerprint from the structured system prompt options.
 *
 * Every component is independently fingerprinted so that `diffFingerprints` can
 * identify exactly which components changed between consecutive turns.
 *
 * @param opts - The `systemPromptOptions` from a `before_agent_start` event.
 *               When `undefined` or empty, a zero-valued fingerprint is returned.
 */
export function computePromptFingerprint(opts?: BuildSystemPromptOptions): PromptFingerprint {
  if (!opts) {
    return zeroFingerprint();
  }

  const customPromptHash = opts.customPrompt ? fastHash(opts.customPrompt) : 0;

  const appendSystemPromptHash = opts.appendSystemPrompt ? fastHash(opts.appendSystemPrompt) : 0;

  const promptGuidelinesHash = opts.promptGuidelines
    ? fastHash(opts.promptGuidelines.join("\n"))
    : 0;

  const selectedToolsHash = opts.selectedTools
    ? fastHash([...opts.selectedTools].sort().join(","))
    : 0;

  const toolSnippetsHash = opts.toolSnippets
    ? fastHash(
        Object.entries(opts.toolSnippets)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, v]) => v)
          .join("\n"),
      )
    : 0;

  const contextFiles = (opts.contextFiles ?? []).map((cf) => ({
    path: cf.path,
    hash: fastHash(cf.content),
  }));

  const skills = (opts.skills ?? []).map((s) => ({
    name: s.name,
    hash: fastHash(`${s.description ?? ""}|${s.filePath ?? ""}`),
  }));

  return {
    customPromptHash,
    appendSystemPromptHash,
    promptGuidelinesHash,
    selectedToolsHash,
    toolSnippetsHash,
    contextFiles,
    skills,
  };
}

/** Compare two fingerprints and return a human-readable list of changes. */
export function diffFingerprints(prev: PromptFingerprint, curr: PromptFingerprint): string[] {
  const changes: string[] = [];

  // ── Context files: count added, modified, removed ─────────

  const ctxDiff = diffArrays(prev.contextFiles, curr.contextFiles, (a) => a.path);
  if (ctxDiff) {
    changes.push(`contextFiles (${ctxDiff})`);
  }

  // ── Skills: count added, modified, removed ────────────────

  const skillDiff = diffArrays(prev.skills, curr.skills, (a) => a.name);
  if (skillDiff) {
    changes.push(`skills (${skillDiff})`);
  }

  // ── Scalar component checks ───────────────────────────────

  if (
    prev.selectedToolsHash !== curr.selectedToolsHash ||
    prev.toolSnippetsHash !== curr.toolSnippetsHash
  ) {
    changes.push("tools");
  }

  if (prev.promptGuidelinesHash !== curr.promptGuidelinesHash) {
    changes.push("guidelines");
  }

  if (prev.customPromptHash !== curr.customPromptHash) {
    changes.push("customPrompt");
  }

  if (prev.appendSystemPromptHash !== curr.appendSystemPromptHash) {
    changes.push("appendText");
  }

  return changes;
}

// ── Internal helpers ──────────────────────────────────────────

/**
 * Compare two arrays of `{ hash }` items by key, counting added, modified,
 * and removed items. Uses key-based lookup (via `getKey`) so it correctly
 * handles insertions and deletions anywhere in the array, not just at the end.
 *
 * Returns a human-readable summary like `+1, ~2, -1` when any differences
 * exist, or `undefined` when the arrays are identical in content.
 */
function diffArrays<T extends { hash: number }>(
  prev: T[],
  curr: T[],
  getKey: (item: T) => string,
): string | undefined {
  const prevMap = new Map<string, number>();
  const currMap = new Map<string, number>();

  for (const item of prev) prevMap.set(getKey(item), item.hash);
  for (const item of curr) currMap.set(getKey(item), item.hash);

  let added = 0;
  let modified = 0;
  let removed = 0;

  for (const [key, hash] of currMap) {
    if (!prevMap.has(key)) {
      added++;
    } else if (prevMap.get(key) !== hash) {
      modified++;
    }
  }

  for (const key of prevMap.keys()) {
    if (!currMap.has(key)) {
      removed++;
    }
  }

  if (added === 0 && modified === 0 && removed === 0) {
    return undefined;
  }

  const parts: string[] = [];
  if (added > 0) parts.push(`+${added}`);
  if (modified > 0) parts.push(`~${modified}`);
  if (removed > 0) parts.push(`-${removed}`);
  return parts.join(", ");
}

/** Create a zero-valued fingerprint (all hashes 0, empty arrays). */
export function zeroFingerprint(): PromptFingerprint {
  return {
    customPromptHash: 0,
    appendSystemPromptHash: 0,
    promptGuidelinesHash: 0,
    selectedToolsHash: 0,
    toolSnippetsHash: 0,
    contextFiles: [],
    skills: [],
  };
}
