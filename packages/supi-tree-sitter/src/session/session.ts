// Session factory — creates runtime-backed Tree-sitter services and owned sessions.

import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import { detectGrammar } from "../language.ts";
import { supportsGrammarOperation } from "../operation-support.ts";
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
    async canParse(file: string, control?: CodeRequestControl) {
      const result = control
        ? await runtime.parseFile(file, control)
        : await runtime.parseFile(file);
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

    async query(
      file: string,
      queryString: string,
      control?: CodeRequestControl,
    ): Promise<TreeSitterResult<QueryCapture[]>> {
      return control
        ? runtime.queryFile(file, queryString, control)
        : runtime.queryFile(file, queryString);
    },

    async outline(
      file: string,
      control?: CodeRequestControl,
    ): Promise<TreeSitterResult<OutlineItem[]>> {
      const grammarId = detectGrammar(file);
      if (grammarId && !supportsGrammarOperation(grammarId, "outline")) {
        return {
          kind: "unsupported-language",
          file,
          message: `outline is not supported for ${grammarId} files`,
        };
      }
      const parseResult = control
        ? await runtime.parseFile(file, control)
        : await runtime.parseFile(file);
      if (parseResult.kind !== "success") return parseResult;
      const { tree, source } = parseResult.data;
      try {
        const items = extractOutline(tree.rootNode, source);
        return { kind: "success", data: items };
      } finally {
        tree.delete();
      }
    },

    async imports(
      file: string,
      control?: CodeRequestControl,
    ): Promise<TreeSitterResult<ImportRecord[]>> {
      const grammarId = detectGrammar(file);
      if (grammarId && !supportsGrammarOperation(grammarId, "imports")) {
        return {
          kind: "unsupported-language",
          file,
          message: `imports is not supported for ${grammarId} files`,
        };
      }
      return control ? extractImports(runtime, file, control) : extractImports(runtime, file);
    },

    async exports(
      file: string,
      control?: CodeRequestControl,
    ): Promise<TreeSitterResult<ExportRecord[]>> {
      const grammarId = detectGrammar(file);
      if (grammarId && !supportsGrammarOperation(grammarId, "exports")) {
        return {
          kind: "unsupported-language",
          file,
          message: `exports is not supported for ${grammarId} files`,
        };
      }
      return control ? extractExports(runtime, file, control) : extractExports(runtime, file);
    },

    async nodeAt(
      file: string,
      line: number,
      character: number,
      control?: CodeRequestControl,
    ): Promise<TreeSitterResult<NodeAtResult>> {
      return control
        ? lookupNodeAt(runtime, file, line, character, control)
        : lookupNodeAt(runtime, file, line, character);
    },

    async calleesAt(
      file: string,
      line: number,
      character: number,
      depthOrOptions?:
        | "direct"
        | "deep"
        | { depth?: "direct" | "deep"; control?: CodeRequestControl },
    ): Promise<TreeSitterResult<CalleesAtResult>> {
      const depth = typeof depthOrOptions === "string" ? depthOrOptions : depthOrOptions?.depth;
      const control = typeof depthOrOptions === "string" ? undefined : depthOrOptions?.control;
      return control
        ? lookupCalleesAt(runtime, file, line, character, depth, control)
        : lookupCalleesAt(runtime, file, line, character, depth);
    },

    async callSites(
      file: string,
      control?: CodeRequestControl,
    ): Promise<TreeSitterResult<CallSiteMatch[]>> {
      return control ? extractCallSites(runtime, file, control) : extractCallSites(runtime, file);
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
