// Session factory — creates a TreeSitterSession bound to a working directory.

import { TreeSitterRuntime } from "./runtime.ts";
import { extractExports, extractImports, extractOutline, lookupNodeAt } from "./structure.ts";
import type {
  ExportRecord,
  ImportRecord,
  NodeAtResult,
  OutlineItem,
  QueryCapture,
  TreeSitterResult,
  TreeSitterSession,
} from "./types.ts";

/**
 * Create a new Tree-sitter session bound to the given working directory.
 * The session owns parser/grammar reuse and must be disposed when done.
 */
export function createTreeSitterSession(cwd: string): TreeSitterSession {
  const runtime = new TreeSitterRuntime(cwd);

  return {
    async parse(file: string) {
      const result = await runtime.parseFile(file);
      if (result.kind !== "success") return result;
      const { resolvedPath, grammarId, tree } = result.data;
      try {
        return {
          kind: "success",
          data: { file: resolvedPath, language: grammarId },
        };
      } finally {
        tree.delete();
      }
    },

    async query(file: string, queryString: string): Promise<TreeSitterResult<QueryCapture[]>> {
      return runtime.queryFile(file, queryString);
    },

    async outline(file: string): Promise<TreeSitterResult<OutlineItem[]>> {
      const parseResult = await runtime.parseFile(file);
      if (parseResult.kind !== "success") return parseResult;
      const { tree, source } = parseResult.data;
      try {
        const items = extractOutline(tree.rootNode, source);
        return { kind: "success", data: items };
      } finally {
        tree.delete();
      }
    },

    async imports(file: string): Promise<TreeSitterResult<ImportRecord[]>> {
      return extractImports(runtime, file);
    },

    async exports(file: string): Promise<TreeSitterResult<ExportRecord[]>> {
      return extractExports(runtime, file);
    },

    async nodeAt(
      file: string,
      line: number,
      character: number,
    ): Promise<TreeSitterResult<NodeAtResult>> {
      return lookupNodeAt(runtime, file, line, character);
    },

    dispose() {
      runtime.dispose();
    },
  };
}
