import { nodeToRange } from "./coordinates.ts";
import type { SyntaxNodeLike } from "./syntax-node.ts";
import type { GrammarId, SourceRange } from "./types.ts";

/** Return whether a parsed tree contains an explicit or recovered syntax error. */
export function hasSyntaxErrors(root: SyntaxNodeLike): boolean {
  // web-tree-sitter's hasError already covers ERROR and missing descendants.
  if (root.hasError === true) return true;
  if (root.hasError === false) return false;
  if (root.type === "ERROR" || root.isMissing === true) return true;
  return (root.children ?? []).some(hasSyntaxErrors);
}

/** Collect explicit ERROR and inserted-node ranges from one parser tree. */
export function collectSyntaxErrorRanges(root: SyntaxNodeLike, source: string): SourceRange[] {
  const ranges: SourceRange[] = [];
  const seen = new Set<string>();
  const visit = (node: SyntaxNodeLike): void => {
    if (node.type === "ERROR" || node.isMissing === true) {
      const range = nodeToRange(node, source);
      const key = `${range.startLine}:${range.startCharacter}:${range.endLine}:${range.endCharacter}`;
      if (!seen.has(key)) {
        seen.add(key);
        ranges.push(range);
      }
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return ranges;
}

interface SyntaxCompletenessInput<T> {
  readonly data: T;
  readonly file: string;
  readonly root: SyntaxNodeLike;
  readonly source: string;
  readonly grammarId: GrammarId;
}

/** Attach explicit recovery metadata when a parsed tree contains syntax errors. */
export function withSyntaxCompleteness<T>(input: SyntaxCompletenessInput<T>):
  | { kind: "success"; data: T }
  | {
      kind: "partial";
      data: T;
      file: string;
      reason: string;
      errorRanges: SourceRange[];
    } {
  const { data, file, root, source, grammarId } = input;
  if (!PARTIAL_EVIDENCE_GRAMMARS.has(grammarId) || !hasSyntaxErrors(root)) {
    return { kind: "success", data };
  }
  return {
    kind: "partial",
    data,
    file,
    reason: "Tree-sitter recovered syntax; structural evidence may be incomplete.",
    errorRanges: collectSyntaxErrorRanges(root, source),
  };
}

const PARTIAL_EVIDENCE_GRAMMARS: ReadonlySet<GrammarId> = new Set([
  "javascript",
  "typescript",
  "tsx",
  "python",
  "java",
  "go",
  "rust",
  "c",
  "cpp",
]);
