// Session factory — creates runtime-backed Tree-sitter services and owned sessions.

import { detectGrammar, isJsTsGrammar } from "../language.ts";
import {
  extractCallSites,
  extractExports,
  extractImports,
  extractOutline,
  lookupCalleesAt,
  lookupNodeAt,
} from "../tool/structure.ts";
import type {
  CalleesAtResult,
  CallSiteMatch,
  ExportRecord,
  ImportRecord,
  NodeAtResult,
  OutlineItem,
  QueryCapture,
  TreeSitterResult,
  TreeSitterService,
  TreeSitterSession,
} from "../types.ts";
import { TreeSitterRuntime } from "./runtime.ts";

/** Create a runtime-backed structural service without taking ownership of disposal. */
export function createTreeSitterService(runtime: TreeSitterRuntime): TreeSitterService {
  return {
    async canParse(file: string) {
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
      if (!isJsTsGrammar(parseResult.data.grammarId)) {
        return {
          kind: "unsupported-language",
          file,
          message: `outline is not supported for ${parseResult.data.grammarId} files`,
        };
      }
      const { tree, source } = parseResult.data;
      try {
        const items = extractOutline(tree.rootNode, source);
        return { kind: "success", data: items };
      } finally {
        tree.delete();
      }
    },

    async imports(file: string): Promise<TreeSitterResult<ImportRecord[]>> {
      const grammarId = detectGrammar(file);
      if (grammarId && !isJsTsGrammar(grammarId)) {
        return {
          kind: "unsupported-language",
          file,
          message: `imports is not supported for ${grammarId} files`,
        };
      }
      return extractImports(runtime, file);
    },

    async exports(file: string): Promise<TreeSitterResult<ExportRecord[]>> {
      const grammarId = detectGrammar(file);
      if (grammarId && !isJsTsGrammar(grammarId)) {
        return {
          kind: "unsupported-language",
          file,
          message: `exports is not supported for ${grammarId} files`,
        };
      }
      return extractExports(runtime, file);
    },

    async nodeAt(
      file: string,
      line: number,
      character: number,
    ): Promise<TreeSitterResult<NodeAtResult>> {
      return lookupNodeAt(runtime, file, line, character);
    },

    async calleesAt(
      file: string,
      line: number,
      character: number,
      depth?: "direct" | "deep",
    ): Promise<TreeSitterResult<CalleesAtResult>> {
      return lookupCalleesAt(runtime, file, line, character, depth);
    },

    async callSites(file: string): Promise<TreeSitterResult<CallSiteMatch[]>> {
      return extractCallSites(runtime, file);
    },
  };
}

/**
 * Create a new Tree-sitter session bound to the given working directory.
 * The session owns parser/grammar reuse and must be disposed when done.
 */
export function createTreeSitterSession(cwd: string): TreeSitterSession {
  const runtime = new TreeSitterRuntime(cwd);
  const service = createTreeSitterService(runtime);

  return {
    ...service,
    dispose() {
      runtime.dispose();
    },
  };
}
