// Shared low-level helpers for reference collection, aggregation, and formatting.
// Moved from src/actions/semantic-references.ts into the use-case support layer.

import * as path from "node:path";
import type {
  ConfidenceMode,
  SemanticProvider as SemanticSubstrate,
} from "@mrclrchtr/supi-code-runtime/api";
import { filterOutDeclaration, isInProjectPath, uriToFile } from "../../search-helpers.ts";
import { dedupeFileLineRefs, highestConfidence } from "../../semantic-action-helpers.ts";
import type { ResolvedTarget } from "../../target-resolution.ts";

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
  target: ResolvedTarget,
  cwd: string,
  semantic: SemanticSubstrate,
): Promise<ReferenceCollection> {
  const locs = await semantic.references(target.file, target.position);
  if (!locs) {
    return { refs: [], confidence: "unavailable", externalCount: 0 };
  }

  let externalCount = 0;
  for (const ref of locs) {
    const filePath = uriToFile(ref.uri);
    if (!isInProjectPath(filePath, cwd)) {
      externalCount++;
    }
  }

  const filtered = filterOutDeclaration(locs, target.file, target.position);
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
  targets: ResolvedTarget[],
  collectFn: (target: ResolvedTarget) => Promise<T>,
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
 * Append a formatted reference list to a lines array.
 * Groups refs by file, caps per-file lines at 5, and caps total files at maxResults.
 */
export function formatReferenceList(
  lines: string[],
  refs: FileLineRef[],
  maxResults: number,
  _cwd: string,
): void {
  if (refs.length === 0) return;

  const byFile = new Map<string, number[]>();
  for (const ref of refs) {
    const group = byFile.get(ref.file) ?? [];
    group.push(ref.line);
    byFile.set(ref.file, group);
  }

  let shown = 0;
  for (const [file, locations] of byFile) {
    if (shown >= maxResults) break;
    lines.push(`### ${file}`);
    for (const loc of locations.slice(0, 5)) {
      lines.push(`- L${loc}`);
    }
    if (locations.length > 5) {
      lines.push(`- _+${locations.length - 5} more in this file_`);
    }
    lines.push("");
    shown++;
  }

  if (byFile.size > maxResults) {
    lines.push(
      `_+${byFile.size - maxResults} more files omitted. Narrow with \`path\` or increase \`maxResults\`._`,
    );
  }
}
