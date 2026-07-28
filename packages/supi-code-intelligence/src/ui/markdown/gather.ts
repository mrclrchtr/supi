/**
 * Substrate context gathering for symbol briefs and point inspection (code_inspect).
 *
 * Extracted from generate-brief.ts to keep the file within the
 * noExcessiveLinesPerFile threshold.
 */

import type {
  SemanticProvider,
  SourceRange,
  StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";

export type ContextGatherProvider = Pick<
  StructuralProvider,
  "nodeAt" | "outline" | "imports" | "exports"
> &
  Partial<Pick<SemanticProvider, "hover" | "definition">>;

export interface TreeSitterContext {
  nodeInfo: {
    type: string;
    text: string;
    startLine: number;
    startCharacter: number;
    ancestry: Array<{
      type: string;
      startLine: number;
      startCharacter: number;
      endLine: number;
      endCharacter: number;
    }>;
  } | null;
  outline: Array<{ name: string; kind: string; startLine: number; endLine: number }>;
  imports: Array<{ moduleSpecifier: string }>;
  exports: Array<{ name: string; kind: string }>;
  /** Best-effort LSP hover info at the anchored position. `null` when unavailable. */
  hover: { contents: string; range?: SourceRange } | null;
  /** Best-effort LSP definition targets at the anchored position. `null` when unavailable. */
  definition: Array<{ uri: string; range: SourceRange }> | null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: best-effort substrate gathering with independent try/catch blocks kept together for readability
export async function gatherTreeSitterContext(
  provider: ContextGatherProvider | null,
  relPath: string,
  line: number,
  character: number,
): Promise<TreeSitterContext> {
  let nodeInfo: TreeSitterContext["nodeInfo"] = null;
  let outline: TreeSitterContext["outline"] = [];
  let imports: TreeSitterContext["imports"] = [];
  let exports: TreeSitterContext["exports"] = [];
  let hover: TreeSitterContext["hover"] = null;
  let definition: TreeSitterContext["definition"] = null;

  if (!provider) return { nodeInfo, outline, imports, exports, hover, definition: null };

  try {
    const nodeResult = await provider.nodeAt(relPath, line, character);
    if (nodeResult.kind === "success") {
      nodeInfo = {
        type: nodeResult.data.type,
        text: nodeResult.data.text,
        startLine: nodeResult.data.startLine,
        startCharacter: nodeResult.data.startCharacter,
        ancestry: nodeResult.data.ancestry ?? [],
      };
    }

    const outlineResult = await provider.outline(relPath);
    if (outlineResult.kind === "success") {
      outline = outlineResult.data.map((item) => ({
        name: item.name,
        kind: item.kind,
        startLine: item.startLine,
        endLine: item.endLine,
      }));
    }

    const importsResult = await provider.imports(relPath);
    if (importsResult.kind === "success") {
      imports = importsResult.data;
    }

    const exportsResult = await provider.exports(relPath);
    if (exportsResult.kind === "success") {
      exports = exportsResult.data.map((item) => ({
        name: item.name,
        kind: item.kind,
      }));
    }

    // Best-effort hover — LSP expects 0-based coordinates
    if (provider.hover) {
      try {
        const hoverResult = await provider.hover(relPath, {
          line: line - 1,
          character: character - 1,
        });
        if (hoverResult.kind !== "unavailable" && hoverResult.data) hover = hoverResult.data;
      } catch {
        // hover failed — continue without it
      }
    }

    // Best-effort definition — LSP expects 0-based coordinates
    if (provider.definition) {
      try {
        const defResult = await provider.definition(relPath, {
          line: line - 1,
          character: character - 1,
        });
        if (defResult.kind !== "unavailable" && defResult.data.length > 0) {
          definition = defResult.data.map((loc) => ({
            uri: loc.uri,
            range: loc.range,
          }));
        }
      } catch {
        // definition failed — continue without it
      }
    }
  } catch {
    // Provider not available
  }

  return { nodeInfo, outline, imports, exports, hover, definition };
}
