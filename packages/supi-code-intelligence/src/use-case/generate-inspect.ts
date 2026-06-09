import * as fs from "node:fs";
import * as path from "node:path";

import { renderInspectResult } from "../presentation/markdown/inspect.ts";
import { normalizePath } from "../search-helpers.ts";
import { gatherNearbyDiagnostics, gatherTreeSitterContext } from "./gather-context.ts";
import type { InspectDeps, InspectInput, InspectUseCaseResult } from "./types.ts";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: inspect orchestration keeps data gathering and unavailable-section derivation in one place
export async function executeInspect(
  input: InspectInput,
  deps: InspectDeps,
): Promise<InspectUseCaseResult> {
  const resolvedFile = normalizePath(input.file, deps.cwd);
  if (!fs.existsSync(resolvedFile)) {
    const relTarget = `${input.file}:${input.line}:${input.character}`;
    return {
      content: `**Error:** File not found: \`${input.file}\``,
      details: {
        confidence: "unavailable",
        focusTarget: relTarget,
        unavailableSections: ["syntax", "hover", "definition", "diagnostics", "codeActions"],
        nextQueries: ["Use `code_health` to inspect provider state"],
      },
    };
  }

  const relPath = path.relative(deps.cwd, resolvedFile);
  const context = await gatherTreeSitterContext(
    deps.provider,
    relPath,
    input.line,
    input.character,
  );
  const diagnostics = await gatherNearbyDiagnostics(
    deps.cwd,
    relPath,
    input.line,
    input.maxResults ?? 5,
    deps.lspService,
  );
  const enclosing = context.outline.find(
    (item) => item.startLine <= input.line && item.endLine >= input.line,
  );
  const definitions = (context.definition ?? []).map((def) => {
    const absFile = def.uri.startsWith("file://") ? decodeURIComponent(def.uri.slice(7)) : def.uri;
    return {
      file: path.relative(deps.cwd, absFile),
      line: def.range.start.line + 1,
      character: def.range.start.character + 1,
    };
  });

  const unavailableSections: string[] = [];
  if (!context.nodeInfo && context.outline.length === 0) unavailableSections.push("syntax");
  if (!context.hover && deps.provider?.hover == null) unavailableSections.push("hover");
  if (definitions.length === 0 && deps.provider?.definition == null)
    unavailableSections.push("definition");
  if (diagnostics.length === 0 && deps.lspService.kind !== "ready")
    unavailableSections.push("diagnostics");
  if ((context.codeActions?.length ?? 0) === 0 && deps.provider?.codeActionTitles == null) {
    unavailableSections.push("codeActions");
  }

  if (
    !context.nodeInfo &&
    !enclosing &&
    !context.hover &&
    definitions.length === 0 &&
    diagnostics.length === 0 &&
    (context.codeActions?.length ?? 0) === 0
  ) {
    unavailableSections.push("providers");
  }

  const confidence = deriveConfidence({
    hasSemantic: Boolean(
      context.hover || definitions.length > 0 || (context.codeActions?.length ?? 0) > 0,
    ),
    hasStructural: Boolean(context.nodeInfo || enclosing),
    hasDiagnostics: diagnostics.length > 0,
  });

  const nextQueries = buildNextQueries(relPath, input.line, input.character, confidence);
  const content = renderInspectResult({
    relPath,
    line: input.line,
    character: input.character,
    confidence,
    node: context.nodeInfo,
    enclosingSymbol: enclosing
      ? {
          name: enclosing.name,
          kind: enclosing.kind,
          startLine: enclosing.startLine,
          endLine: enclosing.endLine,
        }
      : null,
    hover: context.hover?.contents ?? null,
    definitions,
    diagnostics,
    codeActions: context.codeActions ?? [],
    unavailableSections: dedupe(unavailableSections),
  });

  return {
    content,
    details: {
      confidence,
      focusTarget: `${relPath}:${input.line}:${input.character}`,
      unavailableSections: dedupe(unavailableSections),
      nextQueries,
    },
  };
}

function deriveConfidence(input: {
  hasSemantic: boolean;
  hasStructural: boolean;
  hasDiagnostics: boolean;
}): "semantic" | "structural" | "unavailable" {
  if (input.hasSemantic || input.hasDiagnostics) return "semantic";
  if (input.hasStructural) return "structural";
  return "unavailable";
}

function buildNextQueries(
  relPath: string,
  line: number,
  character: number,
  confidence: "semantic" | "structural" | "unavailable",
): string[] {
  const next = [
    `\`code_graph\`, \`file: "${relPath}"\`, \`line: ${line}\`, and \`character: ${character}\` for relationships`,
    `\`code_context\` with \`file: "${relPath}"\` for broader orientation`,
  ];
  if (confidence === "unavailable") {
    next.push("Use `code_health` to inspect provider state");
  } else {
    next.push("Use `code_health` when you need provider or diagnostic status");
  }
  return next;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
