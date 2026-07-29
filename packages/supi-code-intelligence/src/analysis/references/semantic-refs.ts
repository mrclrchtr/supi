// Shared low-level helpers for reference collection, aggregation, and formatting.
// Moved from src/actions/semantic-references.ts into the use-case support layer.

import * as path from "node:path";
import type {
  ConfidenceMode,
  SemanticProvider as SemanticSubstrate,
} from "@mrclrchtr/supi-code-runtime/api";
import { uriToFile } from "@mrclrchtr/supi-core/path";
import {
  createEvidenceList,
  type EvidenceList,
  type EvidenceListMetadata,
  renderEvidenceListDisclosure,
} from "../evidence.ts";
import { dedupeFileLineRefs, highestConfidence } from "../helpers.ts";
import { isInProjectPath } from "../search/paths.ts";
import type { ResolvedTargetData } from "../target/types.ts";
import { filterOutDeclaration } from "./locations.ts";

export interface FileLineRef {
  file: string;
  line: number;
}

export interface ReferenceCollection {
  refs: FileLineRef[];
  confidence: ConfidenceMode;
  externalCount: number;
}

/**
 * Collect semantic references for a target, filtering out the declaration itself
 * and partitioning project vs external (node_modules/out-of-tree) references.
 */
export async function collectReferences(
  target: { file: string; position: { line: number; character: number } },
  cwd: string,
  semantic: SemanticSubstrate,
): Promise<ReferenceCollection> {
  const result = await semantic.references(target.file, target.position);
  if (result.kind === "unavailable") {
    return { refs: [], confidence: "unavailable", externalCount: 0 };
  }
  const locations = result.data;

  let externalCount = 0;
  for (const ref of locations) {
    const filePath = uriToFile(ref.uri);
    if (!isInProjectPath(filePath, cwd)) {
      externalCount++;
    }
  }

  const filtered = filterOutDeclaration(locations, target.file, target.position);
  const projectRefs: FileLineRef[] = [];
  for (const ref of filtered) {
    const filePath = uriToFile(ref.uri);
    if (isInProjectPath(filePath, cwd)) {
      projectRefs.push({ file: path.relative(cwd, filePath), line: ref.range.start.line + 1 });
    }
  }

  return { refs: projectRefs, confidence: "semantic", externalCount };
}

/**
 * Run a collection function across multiple targets and aggregate the results.
 * Deduplicates refs by file:line, merges confidence, and sums external counts.
 */
export async function aggregatePerTarget<T extends ReferenceCollection>(
  targets: ResolvedTargetData[],
  collectFn: (target: ResolvedTargetData) => Promise<T>,
): Promise<ReferenceCollection> {
  if (targets.length === 0) {
    return { refs: [], confidence: "unavailable", externalCount: 0 };
  }

  const results = await Promise.all(targets.map(collectFn));
  const combinedRefs = dedupeFileLineRefs(results.flatMap((r) => r.refs));
  const combinedConfidence = highestConfidence(results.map((r) => r.confidence));
  const combinedExternal = results.reduce((sum, r) => sum + r.externalCount, 0);

  return { refs: combinedRefs, confidence: combinedConfidence, externalCount: combinedExternal };
}

/**
 * Compact sorted line numbers into a concise label string.
 * Consecutive runs produce ranges: [9,10] → "L9-L10".
 * Non-consecutive lines stay single: [9,348] → "L9, L348".
 */
export function compactLineRanges(lines: number[]): string {
  const unique = [...new Set(lines)];
  const sorted = unique.sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) {
      j++;
    }
    if (j > i) {
      parts.push(`L${sorted[i]}-L${sorted[j]}`);
    } else {
      parts.push(`L${sorted[i]}`);
    }
    i = j + 1;
  }
  return parts.join(", ");
}

/**
 * Append a formatted reference list to a lines array.
 * Groups shown refs by file, compacts line numbers into concise labels, and
 * caps reference-location atoms at maxResults.
 */
export function formatReferenceList(
  lines: string[],
  refs: FileLineRef[],
  maxResults: number,
): EvidenceListMetadata | null {
  if (refs.length === 0) return null;

  const evidence = createEvidenceList({
    key: "references.locations",
    items: refs,
    maxResults,
  });

  return formatAssembledReferenceList(lines, evidence);
}

/** Render a reference list whose items and completeness were already assembled. */
export function formatAssembledReferenceList(
  lines: string[],
  evidence: EvidenceList<FileLineRef>,
): EvidenceListMetadata | null {
  if (evidence.metadata.totalCount === 0 && evidence.items.length === 0) return null;

  const byFile = new Map<string, number[]>();
  for (const ref of evidence.items) {
    const group = byFile.get(ref.file) ?? [];
    group.push(ref.line);
    byFile.set(ref.file, group);
  }

  for (const [file, locations] of byFile) {
    lines.push(`### ${file}`);
    lines.push(`- ${compactLineRanges(locations)}`);
    lines.push("");
  }

  const disclosure = renderEvidenceListDisclosure(evidence);
  if (disclosure) lines.push(disclosure);
  return evidence.metadata;
}
