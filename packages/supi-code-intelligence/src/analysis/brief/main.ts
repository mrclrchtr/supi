/**
 * Focused brief generation — dispatches to file or directory brief.
 *
 * This is the main entry point, extracted from the original 800+ line
 * brief-focused.ts. File and directory brief logic now live in sibling
 * modules under use-case/brief/.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ConfidenceMode } from "@mrclrchtr/supi-code-runtime/api";
import type { BriefDetails } from "../../types/index.ts";
import type { ArchitectureModel } from "../architecture/model.ts";
import { findModuleForPath } from "../architecture/model.ts";
import { formatGitContext, gatherGitContext } from "../signals/git.ts";
import {
  appendPrioritySignalsSection,
  summarizePrioritySignalsForFiles,
} from "../signals/project.ts";
import { generateDirectoryBrief } from "./directory.ts";
import { generateFileBrief } from "./file.ts";
import type { BriefOpts } from "./models.ts";
import { summarizeDirectoryRecursively } from "./summarize.ts";

/**
 * Generate a focused brief for a specific path (directory or file).
 *
 * When opts.provider is available, file briefs include structural
 * context (outline, imports, exports) and inline diagnostics.
 * Module briefs include aggregated diagnostics across source files.
 */
export async function generateFocusedBrief(
  model: ArchitectureModel,
  focusPath: string,
  opts?: BriefOpts,
): Promise<{ content: string; details: BriefDetails }> {
  const resolvedPath = path.resolve(focusPath);

  if (!fs.existsSync(resolvedPath)) {
    return {
      content: `**Error:** Path not found: \`${focusPath}\``,
      details: {
        confidence: "unavailable",
        focusTarget: focusPath,
        startHere: [],
        publicSurfaces: [],
        dependencySummary: null,
        omittedCount: 0,
        nextQueries: [],
      },
    };
  }

  const stat = fs.statSync(resolvedPath);

  if (stat.isDirectory()) {
    return await generateDirectoryFocused(model, resolvedPath, focusPath, opts);
  }

  return await generateFileFocused(model, resolvedPath, focusPath, opts);
}

// ── Directory dispatch ────────────────────────────────────────────────

async function generateDirectoryFocused(
  model: ArchitectureModel,
  resolvedPath: string,
  originalPath: string,
  opts?: BriefOpts,
): Promise<{ content: string; details: BriefDetails }> {
  const confidence: ConfidenceMode = "structural";

  const { lines, publicSurfaces, nextQueries, startHere } = await generateDirectoryBrief(
    model,
    resolvedPath,
    originalPath,
    opts,
  );

  // Determine module info for dependency summary
  const mod = findModuleForPath(model, resolvedPath);
  const isModuleRoot = mod && mod.root === resolvedPath;

  // Priority signals
  const lspService =
    opts?.lspService ??
    ({
      kind: "unavailable" as const,
      reason: "No LSP service",
    } as import("@mrclrchtr/supi-lsp/api").SessionLspServiceState);
  const prioritySignals = summarizePrioritySignalsForFiles(
    model.root,
    summarizeDirectoryRecursively(resolvedPath).allFiles,
    lspService,
  );
  appendPrioritySignalsSection(lines, prioritySignals);

  // Git context
  if (opts?.showGitContext !== false) {
    const gitCtx = gatherGitContext(model.root);
    if (gitCtx) {
      lines.push(formatGitContext(gitCtx));
    }
  }

  lines.push("");

  return {
    content: lines.join("\n"),
    details: {
      confidence,
      focusTarget: originalPath,
      startHere: startHere.slice(0, 3),
      publicSurfaces: publicSurfaces.slice(0, 5),
      dependencySummary: isModuleRoot
        ? { moduleCount: 1, edgeCount: mod.internalDeps.length }
        : null,
      omittedCount: 0,
      nextQueries,
      prioritySignals,
    },
  };
}

// ── File dispatch ─────────────────────────────────────────────────────

async function generateFileFocused(
  model: ArchitectureModel,
  resolvedPath: string,
  originalPath: string,
  opts?: BriefOpts,
): Promise<{ content: string; details: BriefDetails }> {
  const {
    content: briefContent,
    publicSurfaces,
    nextQueries,
  } = await generateFileBrief(model, resolvedPath, opts);

  // Priority signals
  const lspService =
    opts?.lspService ??
    ({
      kind: "unavailable" as const,
      reason: "No LSP service",
    } as import("@mrclrchtr/supi-lsp/api").SessionLspServiceState);
  const prioritySignals = summarizePrioritySignalsForFiles(model.root, [resolvedPath], lspService);
  const extraLines: string[] = [];
  if (prioritySignals) {
    appendPrioritySignalsSection(extraLines, prioritySignals);
  }

  // Git context
  if (opts?.showGitContext !== false) {
    const gitCtx = gatherGitContext(model.root);
    if (gitCtx) {
      extraLines.push(formatGitContext(gitCtx));
    }
  }

  const extraStr = extraLines.filter((l) => l.trim()).join("\n");
  const combinedContent = extraStr ? `${briefContent.trim()}\n\n${extraStr}\n` : briefContent;

  return {
    content: combinedContent,
    details: {
      confidence: "structural",
      focusTarget: originalPath,
      startHere: [],
      publicSurfaces,
      dependencySummary: null,
      omittedCount: 0,
      nextQueries,
      prioritySignals,
    },
  };
}
