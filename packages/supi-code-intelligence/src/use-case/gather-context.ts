/**
 * Substrate context gathering for anchored and symbol briefs.
 *
 * Extracted from generate-brief.ts to keep the file within the
 * noExcessiveLinesPerFile threshold.
 */

import type { SourceRange } from "@mrclrchtr/supi-code-runtime/api";
import type { CodeProvider } from "../analysis/context/request-context.ts";

export interface TreeSitterContext {
  nodeInfo: { type: string; text: string; startLine: number; startCharacter: number } | null;
  outline: Array<{ name: string; kind: string; startLine: number; endLine: number }>;
  imports: Array<{ moduleSpecifier: string }>;
  exports: Array<{ name: string; kind: string }>;
  /** Best-effort LSP hover info at the anchored position. `null` when unavailable. */
  hover: { contents: string; range?: SourceRange } | null;
  /** Best-effort LSP definition targets at the anchored position. `null` when unavailable. */
  definition: Array<{ uri: string; range: SourceRange }> | null;
  /** Best-effort code action titles at the anchored position. `null` when unavailable. */
  codeActions: Array<{ title: string; kind?: string }> | null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: best-effort substrate gathering with independent try/catch blocks kept together for readability
export async function gatherTreeSitterContext(
  provider: CodeProvider | null,
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
  let codeActions: TreeSitterContext["codeActions"] = null;

  if (!provider)
    return { nodeInfo, outline, imports, exports, hover, definition: null, codeActions: null };

  try {
    const nodeResult = await provider.nodeAt(relPath, line, character);
    if (nodeResult.kind === "success") {
      nodeInfo = {
        type: nodeResult.data.type,
        text: nodeResult.data.text,
        startLine: nodeResult.data.startLine,
        startCharacter: nodeResult.data.startCharacter,
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
        if (hoverResult) hover = hoverResult;
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
        if (defResult && defResult.length > 0) {
          definition = defResult.map((loc) => ({
            uri: loc.uri,
            range: loc.range,
          }));
        }
      } catch {
        // definition failed — continue without it
      }
    }

    // Best-effort code actions — LSP expects 0-based coordinates
    if (provider.codeActionTitles) {
      try {
        const titles = await provider.codeActionTitles(relPath, {
          line: line - 1,
          character: character - 1,
        });
        if (titles && titles.length > 0) {
          codeActions = titles.map((a) => ({
            title: a.title,
            kind: a.kind,
          }));
        }
      } catch {
        // code actions failed — continue without it
      }
    }
  } catch {
    // Provider not available
  }

  return { nodeInfo, outline, imports, exports, hover, definition, codeActions };
}
