/**
 * Substrate context gathering for symbol-centered Orientation.
 *
 * Best-effort tree-sitter node/outline/imports/exports context plus LSP
 * hover/definition at one target position. Consumed by the Orientation
 * evidence collector in `collect.ts`.
 */

import {
  type CodeRequestControl,
  isCodeRequestInterruption,
  type SemanticProvider,
  type SourceRange,
  type StructuralProvider,
} from "@mrclrchtr/supi-code-runtime/api";

/** Structural provider subset plus optional semantic hover/definition used for gathering. */
export type ContextGatherProvider = Pick<
  StructuralProvider,
  "nodeAt" | "outline" | "imports" | "exports"
> &
  Partial<Pick<SemanticProvider, "hover" | "definition">>;

/**
 * Best-effort substrate evidence at one target position. Consult each operation's
 * status to distinguish a completed empty value from unavailable or withheld evidence.
 */
/** Availability of one independently attempted context observation. */
type CollectedStatus =
  | { readonly status: "complete"; readonly reason: null }
  | { readonly status: "partial" | "unavailable"; readonly reason: string };

export type ContextObservationStatus =
  | CollectedStatus
  | { readonly status: "withheld"; readonly reason: string };

export interface SubstrateContext {
  nodeInfo: {
    type: string;
    text: string;
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
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
  /** Best-effort LSP hover data; consult operations.hover for empty versus unavailable. */
  hover: { contents: string; range?: SourceRange } | null;
  /** Best-effort LSP definition data; empty arrays are successful observations. */
  definition: Array<{ uri: string; range: SourceRange }> | null;
  /** Availability of each independent observation, including withheld position-strict queries. */
  operations: {
    nodeAt: ContextObservationStatus;
    hover: ContextObservationStatus;
    definition: ContextObservationStatus;
    outline: CollectedStatus;
    imports: CollectedStatus;
    exports: CollectedStatus;
  };
  /** Structural recovery from independently queried source operations. */
  recovery: Array<{
    operation: "nodeAt" | "outline" | "imports" | "exports";
    file: string;
    reason: string;
    errorRanges: readonly SourceRange[];
  }>;
}

/**
 * Gather best-effort substrate context at one target position.
 *
 * `line`/`character` are 1-based display coordinates; LSP hover/definition
 * queries convert to 0-based internally. Position-strict operations
 * (tree-sitter `nodeAt`, hover-at) run only when `positionStrict` is true —
 * callers holding a declaration-anchor target must pass false (ADR 0003).
 * File-level evidence (outline, imports, exports) and position-tolerant
 * definition lookups run regardless. Failures retain unavailable status and reason.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: best-effort substrate gathering with independent try/catch blocks kept together for readability
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: keep the existing shared best-effort failure boundary and query order intact
// biome-ignore lint/complexity/useMaxParams: one internal gather call site carries the full position context
export async function gatherSubstrateContext(
  provider: ContextGatherProvider | null,
  relPath: string,
  line: number,
  character: number,
  positionStrict: boolean,
  requestControl?: CodeRequestControl,
): Promise<SubstrateContext> {
  let nodeInfo: SubstrateContext["nodeInfo"] = null;
  let outline: SubstrateContext["outline"] = [];
  let imports: SubstrateContext["imports"] = [];
  let exports: SubstrateContext["exports"] = [];
  let hover: SubstrateContext["hover"] = null;
  let definition: SubstrateContext["definition"] = null;
  const recovery: SubstrateContext["recovery"] = [];
  const withheld = {
    status: "withheld" as const,
    reason:
      "Position-strict evidence requires a name anchor; this target has a declaration anchor.",
  };
  const operations: SubstrateContext["operations"] = {
    nodeAt: positionStrict ? { status: "unavailable", reason: "Not collected." } : withheld,
    hover: positionStrict ? { status: "unavailable", reason: "Not collected." } : withheld,
    definition: { status: "unavailable", reason: "Not collected." },
    outline: { status: "unavailable", reason: "Not collected." },
    imports: { status: "unavailable", reason: "Not collected." },
    exports: { status: "unavailable", reason: "Not collected." },
  };
  let currentOperation: keyof SubstrateContext["operations"] | null = null;

  if (!provider) {
    for (const key of Object.keys(operations) as Array<keyof SubstrateContext["operations"]>) {
      if (operations[key].status !== "withheld")
        operations[key] = { status: "unavailable", reason: "Provider unavailable." };
    }
    return { nodeInfo, outline, imports, exports, hover, definition: null, recovery, operations };
  }

  try {
    if (positionStrict) {
      currentOperation = "nodeAt";
      const nodeResult = await provider.nodeAt(relPath, line, character, requestControl);
      operations.nodeAt = structuralStatus(nodeResult);
      if (nodeResult.kind === "partial") {
        recovery.push({
          operation: "nodeAt",
          file: nodeResult.file,
          reason: nodeResult.reason,
          errorRanges: nodeResult.errorRanges,
        });
      }
      if (nodeResult.kind === "success" || nodeResult.kind === "partial") {
        nodeInfo = {
          type: nodeResult.data.type,
          text: nodeResult.data.text,
          startLine: nodeResult.data.startLine,
          startCharacter: nodeResult.data.startCharacter,
          endLine: nodeResult.data.endLine,
          endCharacter: nodeResult.data.endCharacter,
          ancestry: nodeResult.data.ancestry ?? [],
        };
      }
      currentOperation = null;
    }

    currentOperation = "outline";
    const outlineResult = await provider.outline(relPath, requestControl);
    operations.outline = structuralStatus(outlineResult);
    if (outlineResult.kind === "partial") {
      recovery.push({
        operation: "outline",
        file: outlineResult.file,
        reason: outlineResult.reason,
        errorRanges: outlineResult.errorRanges,
      });
    }
    if (outlineResult.kind === "success" || outlineResult.kind === "partial") {
      outline = outlineResult.data.map((item) => ({
        name: item.name,
        kind: item.kind,
        startLine: item.startLine,
        endLine: item.endLine,
      }));
    }

    currentOperation = "imports";
    const importsResult = await provider.imports(relPath, requestControl);
    operations.imports = structuralStatus(importsResult);
    if (importsResult.kind === "partial") {
      recovery.push({
        operation: "imports",
        file: importsResult.file,
        reason: importsResult.reason,
        errorRanges: importsResult.errorRanges,
      });
    }
    if (importsResult.kind === "success" || importsResult.kind === "partial") {
      imports = importsResult.data;
    }

    currentOperation = "exports";
    const exportsResult = await provider.exports(relPath, requestControl);
    operations.exports = structuralStatus(exportsResult);
    if (exportsResult.kind === "partial") {
      recovery.push({
        operation: "exports",
        file: exportsResult.file,
        reason: exportsResult.reason,
        errorRanges: exportsResult.errorRanges,
      });
    }
    if (exportsResult.kind === "success" || exportsResult.kind === "partial") {
      exports = exportsResult.data.map((item) => ({
        name: item.name,
        kind: item.kind,
      }));
    }
    currentOperation = null;

    // Best-effort hover — LSP expects 0-based coordinates; hover-at is position-strict.
    if (positionStrict && provider.hover) {
      try {
        const hoverResult = await provider.hover(relPath, {
          line: line - 1,
          character: character - 1,
        });
        operations.hover = semanticStatus(hoverResult);
        if (hoverResult.kind !== "unavailable" && hoverResult.data) hover = hoverResult.data;
      } catch (error) {
        if (isCodeRequestInterruption(error, requestControl)) throw error;
        operations.hover = { status: "unavailable", reason: String(error) };
      }
    } else if (positionStrict) {
      operations.hover = { status: "unavailable", reason: "Hover provider unavailable." };
    }

    // Best-effort definition — LSP expects 0-based coordinates; definitions are position-tolerant.
    if (provider.definition) {
      try {
        const defResult = await provider.definition(relPath, {
          line: line - 1,
          character: character - 1,
        });
        operations.definition = semanticStatus(defResult);
        if (defResult.kind !== "unavailable") {
          definition = defResult.data.map((loc) => ({
            uri: loc.uri,
            range: loc.range,
          }));
        }
      } catch (error) {
        if (isCodeRequestInterruption(error, requestControl)) throw error;
        operations.definition = { status: "unavailable", reason: String(error) };
      }
    } else {
      operations.definition = { status: "unavailable", reason: "Definition provider unavailable." };
    }
  } catch (error) {
    if (isCodeRequestInterruption(error, requestControl)) throw error;
    if (currentOperation) {
      operations[currentOperation] = { status: "unavailable", reason: String(error) };
      for (const key of ["hover", "definition"] as const) {
        if (operations[key].reason === "Not collected.") {
          operations[key] = {
            status: "unavailable",
            reason: `Not collected after ${currentOperation} failed.`,
          };
        }
      }
    }
  }

  return { nodeInfo, outline, imports, exports, hover, definition, recovery, operations };
}

function semanticStatus(result: { kind: string; reason?: string }): CollectedStatus {
  if (result.kind === "completed") return { status: "complete", reason: null };
  if (result.kind === "partial")
    return { status: "partial", reason: result.reason ?? "Partial evidence." };
  return { status: "unavailable", reason: result.reason ?? "Semantic provider unavailable." };
}

function structuralStatus(result: {
  kind: string;
  reason?: string;
  message?: string;
}): SubstrateContext["operations"]["outline"] {
  if (result.kind === "success") return { status: "complete", reason: null };
  if (result.kind === "partial")
    return { status: "partial", reason: result.reason ?? "Partial evidence." };
  return { status: "unavailable", reason: result.message ?? "Structural provider unavailable." };
}
