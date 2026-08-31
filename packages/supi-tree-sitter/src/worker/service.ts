import { detectGrammar } from "../language.ts";
import { supportsGrammarOperation } from "../operation-support.ts";
import type { StructuralWorkerOperation } from "../session/structural-worker-protocol.ts";
import { extractCallSites } from "../tool/call-sites.ts";
import { lookupCalleesAt } from "../tool/callees.ts";
import { extractExports } from "../tool/exports.ts";
import { extractImports } from "../tool/imports.ts";
import { lookupNodeAt } from "../tool/node-at.ts";
import { collectOutline as extractOutline } from "../tool/outline.ts";
import type { TreeSitterResult } from "../types.ts";
import {
  type StructuralRequestControl,
  throwIfStructuralRequestInterrupted,
} from "./request-control.ts";
import type { TreeSitterRuntime } from "./runtime.ts";

/** Execute parser-backed operations in the Structural Worker. */
export class StructuralWorkerService {
  constructor(private readonly runtime: TreeSitterRuntime) {}

  async execute(
    input: StructuralWorkerOperation,
    control: StructuralRequestControl,
  ): Promise<TreeSitterResult<unknown>> {
    throwIfStructuralRequestInterrupted(control);
    switch (input.operation) {
      case "canParse":
        return this.#canParse(input.file, control);
      case "query":
        return this.runtime.queryFile(input.file, input.query, control);
      case "outline":
        return this.#outline(input.file, control);
      case "imports":
        return this.#imports(input.file, control);
      case "exports":
        return this.#exports(input.file, control);
      case "nodeAt":
        return lookupNodeAt(this.runtime, input.file, input.line, input.character, control);
      case "calleesAt":
        return lookupCalleesAt(
          this.runtime,
          input.file,
          input.line,
          input.character,
          input.depth,
          control,
        );
      case "callSites":
        return extractCallSites(this.runtime, input.file, control);
    }
  }

  async #canParse(
    file: string,
    control: StructuralRequestControl,
  ): Promise<TreeSitterResult<{ file: string; language: string }>> {
    const result = await this.runtime.parseFile(file, control);
    if (result.kind !== "success") return result;
    const { resolvedPath, grammarId, tree } = result.data;
    try {
      return { kind: "success", data: { file: resolvedPath, language: grammarId } };
    } finally {
      tree.delete();
    }
  }

  async #outline(
    file: string,
    control: StructuralRequestControl,
  ): Promise<TreeSitterResult<unknown>> {
    const unsupported = unsupportedOperation(file, "outline");
    if (unsupported) return unsupported;
    const result = await this.runtime.parseFile(file, control);
    if (result.kind !== "success") return result;
    try {
      throwIfStructuralRequestInterrupted(control);
      return {
        kind: "success",
        data: extractOutline(result.data.tree.rootNode, result.data.source),
      };
    } finally {
      result.data.tree.delete();
    }
  }

  async #imports(
    file: string,
    control: StructuralRequestControl,
  ): Promise<TreeSitterResult<unknown>> {
    const unsupported = unsupportedOperation(file, "imports");
    return unsupported ?? extractImports(this.runtime, file, control);
  }

  async #exports(
    file: string,
    control: StructuralRequestControl,
  ): Promise<TreeSitterResult<unknown>> {
    const unsupported = unsupportedOperation(file, "exports");
    return unsupported ?? extractExports(this.runtime, file, control);
  }
}

function unsupportedOperation(
  file: string,
  operation: "outline" | "imports" | "exports",
): TreeSitterResult<never> | null {
  const grammarId = detectGrammar(file);
  if (!grammarId || supportsGrammarOperation(grammarId, operation)) return null;
  return {
    kind: "unsupported-language",
    file,
    message: `${operation} is not supported for ${grammarId} files`,
  };
}
