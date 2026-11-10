/**
 * File outline omissions: which discovered declarations an outline leaves out
 * and how they are counted. Imported names, export-list names, and
 * `export … from` statements bind or forward names the file does not declare;
 * local declarations live inside function bodies.
 */

import type {
  CodeRequestControl,
  StructuralProvider as StructuralSubstrate,
} from "@mrclrchtr/supi-code-runtime/api";
import { isCodeRequestInterruption } from "@mrclrchtr/supi-code-runtime/api";
import type { DiscoveredTargetData } from "./file.ts";
import type { FileOutlineNameSpan, FileOutlineNotListed, ResolvedTargetData } from "./types.ts";

interface SourceSpan {
  readonly startLine: number;
  readonly startCharacter: number;
  readonly endLine: number;
  readonly endCharacter: number;
}

/** Statements that bind names the file does not declare itself. */
interface BindingRanges {
  readonly imports: readonly SourceSpan[];
  /** Specifiers of `export { … }` lists, with or without `from`. */
  readonly exportLists: readonly SourceSpan[];
  /**
   * Specifiers of `export { … } from`, and whole `export * from` or
   * `export * as name from` statements, which have no outline row.
   */
  readonly reExports: readonly SourceSpan[];
}

/** Syntax ranges of import statements and export-list specifiers, or null when unknown. */
export async function collectBindingRanges(
  file: string,
  structural: StructuralSubstrate | undefined,
  control?: CodeRequestControl,
): Promise<BindingRanges | null> {
  if (!structural) return null;
  try {
    const [imports, exports] = await Promise.all([
      structural.imports(file, control),
      structural.exports(file, control),
    ]);
    const exportData = exports.kind === "success" || exports.kind === "partial" ? exports.data : [];
    return {
      imports: imports.kind === "success" || imports.kind === "partial" ? imports.data : [],
      exportLists: exportData.filter(
        (entry) => entry.kind === "export" || entry.kind === "re-export",
      ),
      reExports: exportData.filter((entry) => entry.kind === "re-export"),
    };
  } catch (error) {
    if (isCodeRequestInterruption(error, control)) throw error;
    return null;
  }
}

/**
 * Split discovered declarations into the listed outline and counted omissions.
 *
 * Local declarations are omitted by level. A name only the language server
 * reported inside an import statement or an export list is a binding, not a
 * declaration of this file. A syntax-parser export statement that contains a
 * re-export only forwards names; an own `export { … }` list stays listed.
 * Without binding ranges such entries stay listed rather than being guessed.
 */
export function partitionOutline(
  targets: readonly DiscoveredTargetData[],
  ranges: BindingRanges | null,
): { targets: DiscoveredTargetData[]; notListed: FileOutlineNotListed } {
  const listed: DiscoveredTargetData[] = [];
  const lines = { imported: [] as number[], exportList: [] as number[], reExport: [] as number[] };
  const reExportRows: SourceSpan[] = [];
  let localDeclarations = 0;
  for (const target of targets) {
    const omission = classifyOmission(target, ranges);
    if (omission === "local") localDeclarations++;
    else if (omission === null) listed.push(target);
    else {
      lines[omission].push(target.displayLine);
      if (omission === "reExport") reExportRows.push(statementSpan(target));
    }
  }
  // `export *` statements have no outline row; each record is one statement.
  for (const record of ranges?.reExports ?? []) {
    if (!reExportRows.some((row) => containsLines(row, record))) {
      lines.reExport.push(record.startLine);
    }
  }
  return {
    targets: listed,
    notListed: {
      importedNames: nameSpan(lines.imported),
      exportListNames: nameSpan(lines.exportList),
      reExportStatements: nameSpan(lines.reExport),
      localDeclarations,
    },
  };
}

/** Why the outline leaves `target` out, or null when it is listed. */
function classifyOmission(
  target: DiscoveredTargetData,
  ranges: BindingRanges | null,
): "local" | "imported" | "exportList" | "reExport" | null {
  if (target.level === "local") return "local";
  if (!ranges) return null;
  if (isReExportStatement(target, ranges)) return "reExport";
  if (target.provenance.includes("structural")) return null;
  if (ranges.imports.some((range) => containsTarget(range, target))) return "imported";
  if (ranges.exportLists.some((range) => containsTarget(range, target))) return "exportList";
  return null;
}

/** A syntax-parser `export` statement row whose lines hold a re-export. */
function isReExportStatement(target: DiscoveredTargetData, ranges: BindingRanges): boolean {
  if (target.kind !== "export" || target.provenance.includes("semantic")) return false;
  const row = statementSpan(target);
  return ranges.reExports.some((range) => containsLines(row, range));
}

function statementSpan(target: DiscoveredTargetData): SourceSpan {
  const startLine = target.declarationAnchor.line;
  return { startLine, startCharacter: 1, endLine: target.endLine ?? startLine, endCharacter: 1 };
}

function containsLines(outer: SourceSpan, inner: SourceSpan): boolean {
  return inner.startLine >= outer.startLine && inner.endLine <= outer.endLine;
}

function containsTarget(range: SourceSpan, target: ResolvedTargetData): boolean {
  const { displayLine: line, displayCharacter: character } = target;
  const afterStart =
    line > range.startLine || (line === range.startLine && character >= range.startCharacter);
  const beforeEnd =
    line < range.endLine || (line === range.endLine && character <= range.endCharacter);
  return afterStart && beforeEnd;
}

function nameSpan(lines: readonly number[]): FileOutlineNameSpan | null {
  if (lines.length === 0) return null;
  return { count: lines.length, startLine: Math.min(...lines), endLine: Math.max(...lines) };
}
