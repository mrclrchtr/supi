/**
 * Shared code_resolve result contracts and registration helpers.
 *
 * Kept separate from service.ts and file-resolution.ts so file-level
 * resolution can reuse the public resolve result shape without importing the
 * service implementation back, avoiding a runtime import cycle.
 */

import { resolve } from "node:path";
import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { WorkspaceCodeIntelligenceSession } from "../../session/session.ts";
import type { TargetRegistrationInput, TargetStoreEntry } from "../../session/target-store.ts";
import type { DisambiguationCandidateData } from "./types.ts";

export interface ResolveServiceParams {
  query?: string;
  scope?: string;
  kind?: string;
  file?: string;
  line?: number;
  character?: number;
  maxResults?: number;
}

/**
 * A disambiguation candidate with a registered target handle.
 *
 * Composes {@link DisambiguationCandidateData} with the stored
 * {@link TargetStoreEntry} so renderers get both candidate metadata and stable
 * handles.
 */
export interface DisambiguationCandidate extends DisambiguationCandidateData {
  targetId: string;
  /** Full stored entry for tool details. */
  entry: TargetStoreEntry;
}

export type ResolveServiceResult =
  | {
      kind: "resolved";
      /** Registered target entries from the session store (absolute paths). */
      targets: TargetStoreEntry[];
      confidence: ConfidenceMode;
      omittedCount: number;
      nextQueries: string[];
    }
  | {
      kind: "disambiguation";
      candidates: DisambiguationCandidate[];
      omittedCount: number;
      nextQueries: string[];
    }
  | {
      kind: "error";
      message: string;
    };

/**
 * Register a single resolved target from the targeting pipeline into the
 * workflow target store and return the full stored entry.
 */
export function registerFromTarget(
  target: {
    file: string;
    position: { line: number; character: number };
    displayLine: number;
    displayCharacter: number;
    name: string | null;
    kind: string | null;
    confidence: string;
    anchorKind: TargetStoreEntry["anchorKind"];
    container: string | null;
    resolution?: import("../../types/index.ts").AnchoredResolutionMetadata;
  },
  session: WorkspaceCodeIntelligenceSession,
  provenance: string,
): TargetStoreEntry {
  const input: TargetRegistrationInput = {
    file: target.file,
    position: target.position,
    displayLine: target.displayLine,
    displayCharacter: target.displayCharacter,
    name: target.name,
    kind: target.kind,
    confidence: target.confidence as ConfidenceMode,
    provenance,
    anchorKind: target.anchorKind,
    container: target.container,
    resolution: target.resolution,
  };
  const { entry } = session.registerTarget(input);
  return entry;
}

/** Register a disambiguation candidate in the target store and return it with handles. */
export function registerCandidate(
  c: DisambiguationCandidateData,
  session: WorkspaceCodeIntelligenceSession,
): DisambiguationCandidate {
  const cwd = session.cwd;
  const input: TargetRegistrationInput = {
    file: resolve(cwd, c.file),
    position: { line: c.line - 1, character: c.character - 1 },
    displayLine: c.line,
    displayCharacter: c.character,
    name: c.name,
    kind: c.kind,
    confidence: "semantic" as ConfidenceMode,
    provenance: "disambiguation",
    anchorKind: c.anchorKind,
    container: c.container,
  };
  const { targetId, entry } = session.registerTarget(input);
  return { ...c, targetId, entry };
}
