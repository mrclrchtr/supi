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
  /** Specifiers or statements of `export … from`. */
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
  const importedLines: number[] = [];
  const exportListLines: number[] = [];
  const reExportLines: number[] = [];
  let localDeclarations = 0;
  for (const target of targets) {
    if (target.level === "local") {
      localDeclarations++;
      continue;
    }
    if (ranges && isReExportStatement(target, ranges)) {
      reExportLines.push(target.displayLine);
      continue;
    }
    if (ranges && !target.provenance.includes("structural")) {
      if (ranges.imports.some((range) => containsTarget(range, target))) {
        importedLines.push(target.displayLine);
        continue;
      }
      if (ranges.exportLists.some((range) => containsTarget(range, target))) {
        exportListLines.push(target.displayLine);
        continue;
      }
    }
    listed.push(target);
  }
  return {
    targets: listed,
    notListed: {
      importedNames: nameSpan(importedLines),
      exportListNames: nameSpan(exportListLines),
      reExportStatements: nameSpan(reExportLines),
      localDeclarations,
    },
  };
}

/** A syntax-parser `export` statement row whose lines hold a re-export. */
function isReExportStatement(target: DiscoveredTargetData, ranges: BindingRanges): boolean {
  if (target.kind !== "export" || target.provenance.includes("semantic")) return false;
  const start = target.declarationAnchor.line;
  const end = target.endLine ?? start;
  return ranges.reExports.some((range) => range.startLine >= start && range.endLine <= end);
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
