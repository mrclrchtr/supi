/** Independent substrate collection for exact point inspection. */

import {
  type CodePosition,
  type CodeRequestControl,
  isCodeRequestInterruption,
  mapCodeQueryResult,
  type OutlineData,
  type SemanticProvider,
  type StructuralProvider,
  unavailableCodeQuery,
} from "@mrclrchtr/supi-code-runtime/api";
import { uriToFile } from "@mrclrchtr/supi-core/path";
import type { WorkspaceLspRuntimeState } from "@mrclrchtr/supi-lsp/api";
import { relativeDisplayPath } from "../../analysis/search/paths.ts";
import { diagnosticMessageString } from "../../substrate/lsp/utils.ts";
import type {
  InspectDefinition,
  InspectDiagnostic,
  InspectEnclosingSymbol,
  InspectNode,
  InspectObservation,
  InspectSections,
} from "../inspect-types.ts";

export interface InspectCollectionInput {
  readonly cwd: string;
  readonly file: string;
  readonly line: number;
  readonly character: number;
  readonly lineCount: number;
  readonly requestControl?: CodeRequestControl;
  readonly structural: StructuralProvider | null;
  readonly semantic: SemanticProvider | null;
  readonly semanticUnavailableReason: string;
  readonly lspState: WorkspaceLspRuntimeState;
}

/** Collect every inspection section independently so one failure cannot erase siblings. */
export async function collectInspectSections(
  input: InspectCollectionInput,
): Promise<InspectSections> {
  const node = await collectNode(input);
  const enclosingSymbol = await collectEnclosingSymbol(input);
  const hover = await collectHover(input);
  const definition = await collectDefinition(input);
  const diagnostics = await collectDiagnostics(input);
  return { node, enclosingSymbol, hover, definition, diagnostics };
}

async function collectNode(
  input: InspectCollectionInput,
): Promise<InspectObservation<InspectNode | null>> {
  if (!input.structural) return unavailableCodeQuery("No structural node provider is active.");
  try {
    const result = await input.structural.nodeAt(
      input.file,
      input.line,
      input.character,
      input.requestControl,
    );
    if (result.kind !== "success") return unavailableCodeQuery(result.message);
    return {
      kind: "completed",
      data: {
        type: result.data.type,
        text: result.data.text,
        startLine: result.data.startLine,
        startCharacter: result.data.startCharacter,
        endLine: result.data.endLine,
        endCharacter: result.data.endCharacter,
        ancestry: result.data.ancestry ?? [],
      },
    };
  } catch (error) {
    if (isCodeRequestInterruption(error, input.requestControl)) throw error;
    return unavailableCodeQuery(failureReason("Structural node lookup", error));
  }
}

async function collectEnclosingSymbol(
  input: InspectCollectionInput,
): Promise<InspectObservation<InspectEnclosingSymbol | null>> {
  if (!input.structural) return unavailableCodeQuery("No structural outline provider is active.");
  try {
    const result = await input.structural.outline(input.file, input.requestControl);
    if (result.kind !== "success") return unavailableCodeQuery(result.message);
    return {
      kind: "completed",
      data: narrowestEnclosingSymbol(result.data, {
        line: input.line,
        character: input.character,
      }),
    };
  } catch (error) {
    if (isCodeRequestInterruption(error, input.requestControl)) throw error;
    return unavailableCodeQuery(failureReason("Structural outline lookup", error));
  }
}

async function collectHover(
  input: InspectCollectionInput,
): Promise<InspectObservation<string | null>> {
  if (!input.semantic?.hover) return unavailableCodeQuery(input.semanticUnavailableReason);
  try {
    return mapCodeQueryResult(
      await input.semantic.hover(input.file, toLspPosition(input)),
      (hover) => hover?.contents ?? null,
    );
  } catch (error) {
    return unavailableCodeQuery(failureReason("Hover lookup", error));
  }
}

async function collectDefinition(
  input: InspectCollectionInput,
): Promise<InspectObservation<readonly InspectDefinition[]>> {
  if (!input.semantic?.definition) return unavailableCodeQuery(input.semanticUnavailableReason);
  try {
    const result = await input.semantic.definition(input.file, toLspPosition(input));
    if (result.kind === "unavailable") return result;
    const definitions: InspectDefinition[] = [];
    let invalidCount = 0;
    for (const location of result.data) {
      try {
        const file = uriToFile(location.uri);
        definitions.push({
          file: relativeDisplayPath(input.cwd, file, file),
          line: location.range.start.line + 1,
          character: location.range.start.character + 1,
        });
      } catch {
        invalidCount++;
      }
    }
    const reasons = [
      ...(result.kind === "partial" ? [result.reason] : []),
      ...(invalidCount > 0 ? [`${invalidCount} invalid definition location(s) omitted.`] : []),
    ];
    return reasons.length > 0
      ? { kind: "partial", data: definitions, reason: reasons.join(" ") }
      : { kind: "completed", data: definitions };
  } catch (error) {
    return unavailableCodeQuery(failureReason("Definition lookup", error));
  }
}

async function collectDiagnostics(
  input: InspectCollectionInput,
): Promise<InspectObservation<readonly InspectDiagnostic[]>> {
  if (input.lspState.kind !== "ready") {
    return unavailableCodeQuery(lspUnavailableReason(input.lspState));
  }
  try {
    const result = await input.lspState.runtime.fileDiagnostics(input.file, 4);
    if (result.kind === "unavailable") return result;
    const diagnostics = result.data
      .filter((diagnostic) => diagnosticOverlapsWindow(diagnostic.range, input))
      .map((diagnostic) => ({
        line: diagnostic.range.start.line + 1,
        character: diagnostic.range.start.character + 1,
        endLine: diagnostic.range.end.line + 1,
        endCharacter: diagnostic.range.end.character + 1,
        severity: diagnostic.severity ?? 1,
        message: diagnosticMessageString(diagnostic),
      }))
      .sort((left, right) => compareDiagnostics(left, right, input.line));
    return result.kind === "partial"
      ? { kind: "partial", data: diagnostics, reason: result.reason }
      : { kind: "completed", data: diagnostics };
  } catch (error) {
    return unavailableCodeQuery(failureReason("Diagnostic lookup", error));
  }
}

function toLspPosition(input: Pick<InspectCollectionInput, "line" | "character">): CodePosition {
  return { line: input.line - 1, character: input.character - 1 };
}

interface OutlineCandidate extends InspectEnclosingSymbol {
  readonly depth: number;
  readonly order: number;
}

function narrowestEnclosingSymbol(
  outline: readonly OutlineData[],
  point: { line: number; character: number },
): InspectEnclosingSymbol | null {
  const candidates = flattenOutline(outline).filter((candidate) => containsPoint(candidate, point));
  const selected = candidates.sort(compareOutlineCandidates)[0];
  if (!selected) return null;
  const { depth: _depth, order: _order, ...symbol } = selected;
  return symbol;
}

function flattenOutline(
  outline: readonly OutlineData[],
  depth = 0,
  state: { order: number } = { order: 0 },
): OutlineCandidate[] {
  return outline.flatMap((item) => {
    const candidate: OutlineCandidate = {
      name: item.name,
      kind: item.kind,
      startLine: item.startLine,
      startCharacter: item.startCharacter,
      endLine: item.endLine,
      endCharacter: item.endCharacter,
      depth,
      order: state.order++,
    };
    return [candidate, ...flattenOutline(item.children ?? [], depth + 1, state)];
  });
}

function containsPoint(
  range: InspectEnclosingSymbol,
  point: { line: number; character: number },
): boolean {
  return (
    comparePosition(range.startLine, range.startCharacter, point.line, point.character) <= 0 &&
    comparePosition(point.line, point.character, range.endLine, range.endCharacter) < 0
  );
}

function compareOutlineCandidates(left: OutlineCandidate, right: OutlineCandidate): number {
  const leftContainsRight = containsRange(left, right);
  const rightContainsLeft = containsRange(right, left);
  if (leftContainsRight !== rightContainsLeft) return leftContainsRight ? 1 : -1;

  // Provider ranges may overlap without nesting. Prefer the smaller full range,
  // then use source order so malformed or duplicate outlines remain deterministic.
  const byLineSpan = left.endLine - left.startLine - (right.endLine - right.startLine);
  const byCharacterSpan =
    left.endCharacter - left.startCharacter - (right.endCharacter - right.startCharacter);
  return (
    byLineSpan ||
    byCharacterSpan ||
    right.depth - left.depth ||
    comparePosition(left.startLine, left.startCharacter, right.startLine, right.startCharacter) ||
    left.order - right.order
  );
}

function containsRange(outer: InspectEnclosingSymbol, inner: InspectEnclosingSymbol): boolean {
  return (
    comparePosition(outer.startLine, outer.startCharacter, inner.startLine, inner.startCharacter) <=
      0 &&
    comparePosition(outer.endLine, outer.endCharacter, inner.endLine, inner.endCharacter) >= 0
  );
}

function diagnosticOverlapsWindow(
  range: { start: CodePosition; end: CodePosition },
  input: Pick<InspectCollectionInput, "line" | "lineCount">,
): boolean {
  const startLine = Math.max(1, input.line - 2) - 1;
  const endExclusiveLine = Math.min(input.lineCount, input.line + 2);
  const startsBeforeWindowEnd =
    comparePosition(range.start.line, range.start.character, endExclusiveLine, 0) < 0;
  const endsAfterWindowStart =
    comparePosition(range.end.line, range.end.character, startLine, 0) > 0;
  const emptyInsideWindow =
    comparePosition(
      range.start.line,
      range.start.character,
      range.end.line,
      range.end.character,
    ) === 0 &&
    range.start.line >= startLine &&
    range.start.line < endExclusiveLine;
  return startsBeforeWindowEnd && (endsAfterWindowStart || emptyInsideWindow);
}

function compareDiagnostics(
  left: InspectDiagnostic,
  right: InspectDiagnostic,
  pointLine: number,
): number {
  return (
    Math.abs(left.line - pointLine) - Math.abs(right.line - pointLine) ||
    left.line - right.line ||
    left.character - right.character ||
    left.severity - right.severity ||
    left.message.localeCompare(right.message)
  );
}

function comparePosition(
  leftLine: number,
  leftCharacter: number,
  rightLine: number,
  rightCharacter: number,
): number {
  return leftLine - rightLine || leftCharacter - rightCharacter;
}

function lspUnavailableReason(state: Exclude<WorkspaceLspRuntimeState, { kind: "ready" }>): string {
  switch (state.kind) {
    case "unavailable":
      return state.reason;
    case "pending":
      return "LSP diagnostics are still pending.";
    case "inactive":
      return "LSP diagnostics are inactive.";
    case "disabled":
      return "LSP diagnostics are disabled.";
  }
}

function failureReason(operation: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${operation} failed: ${detail}`;
}
