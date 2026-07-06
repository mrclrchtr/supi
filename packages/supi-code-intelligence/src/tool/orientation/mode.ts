/**
 * Orientation-mode execution for code_orientation.
 *
 * Runs the non-target path: validates/resolves the focus parameter
 * and delegates to the use-case layer for project/module/directory/file
 * orientation.
 */

import { existsSync, statSync } from "node:fs";
import type { ArchitectureModel } from "../../analysis/architecture/model.ts";
import {
  findInstructionFilesForDirectory,
  insertInstructionsNearTop,
  renderInstructionFiles,
} from "../../analysis/instruction-files.ts";
import { normalizePath } from "../../analysis/search/ripgrep.ts";
import { loadCodeIntelligenceConfig } from "../../config.ts";
import type { CodeIntelResult, CodeIntelToolExecCtx } from "../../types/index.ts";
import type { OrientationUseCaseResult } from "../../ui/markdown/types.ts";
import { unavailableContextDetails } from "../infra/error-results.ts";
import { prepareOrientationDeps } from "./deps.ts";
import type { CodeOrientationToolParams } from "./execute.ts";
import { executeOrientation } from "./orchestrate.ts";

/** Track which cwds have already shown git context in this session. */
const shownGitContextCwds = new Set<string>();

/**
 * Run orientation mode: validate/resolve focus and produce a
 * project/module/directory/file brief through the use-case layer.
 */
export async function runOrientationMode(
  params: CodeOrientationToolParams,
  ctx: CodeIntelToolExecCtx,
): Promise<CodeIntelResult> {
  const deps = await prepareOrientationDeps(params, ctx);
  if ("content" in deps) return deps;

  const focusResolution = resolveOrientationFocus(params.focus, ctx.cwd, deps.model);
  if (focusResolution.kind === "error") {
    return {
      content: `**Error:** ${focusResolution.reason}`,
      details: unavailableContextDetails([
        "Provide a workspace-relative path or a discovered module name as `focus`",
      ]),
    };
  }

  const showGitContext = !shownGitContextCwds.has(ctx.cwd);
  shownGitContextCwds.add(ctx.cwd);

  const result = await executeOrientation(
    {
      focus: focusResolution.path,
      maxResults: params.maxResults ?? 10,
      showGitContext,
    },
    { ...deps, cwd: ctx.cwd },
  );
  const withInstructions = addInstructionFilesForDirectoryFocus(result, focusResolution.path, ctx);

  return {
    content: withInstructions.content,
    details: { type: "context", data: withInstructions.details },
  };
}

function addInstructionFilesForDirectoryFocus(
  result: OrientationUseCaseResult,
  focusPath: string | undefined,
  ctx: CodeIntelToolExecCtx,
): OrientationUseCaseResult {
  if (!focusPath || !isDirectory(focusPath)) return result;

  const config = loadCodeIntelligenceConfig(ctx.cwd);
  const matches = findInstructionFilesForDirectory({
    directory: focusPath,
    cwd: ctx.cwd,
    fileNames: config.instructionFileNames,
    nativeContextPaths: ctx.session.nativeInstructionPaths,
    surfacedDirectories: ctx.session.surfacedInstructionDirs,
  });
  if (matches.length === 0) return result;

  const rendered = renderInstructionFiles(matches);
  if (!rendered) return result;

  ctx.session.markInstructionDirsSurfaced(rendered.metadata.files.map((file) => file.directory));

  return {
    content: insertInstructionsNearTop(result.content, rendered.markdown),
    details: {
      ...result.details,
      renderedSections: ["instructions", ...result.details.renderedSections],
      instructions: rendered.metadata,
    },
  };
}

function isDirectory(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolve a focus string to a concrete filesystem path or discovered
 * module root. Returns an error reason when the focus is ambiguous or
 * not found.
 */
function resolveOrientationFocus(
  focus: string | undefined,
  cwd: string,
  model: ArchitectureModel | null,
): { kind: "ok"; path: string | undefined } | { kind: "error"; reason: string } {
  if (!focus) return { kind: "ok", path: undefined };

  const pathCandidate = normalizePath(focus, cwd);
  if (existsSync(pathCandidate)) return { kind: "ok", path: pathCandidate };

  const matches =
    model?.modules.filter(
      (mod) => mod.name === focus || mod.name.replace(/^@[^/]+\//, "") === focus,
    ) ?? [];
  if (matches.length === 1) return { kind: "ok", path: matches[0].root };
  if (matches.length > 1) {
    const candidates = matches
      .map((mod) => `\`${mod.name}\` at \`${mod.relativePath}\``)
      .join(", ");
    return { kind: "error", reason: `Focus is ambiguous: ${candidates}` };
  }

  return {
    kind: "error",
    reason: `Focus not found: \`${focus}\`. Provide a workspace-relative path or discovered module name.`,
  };
}
