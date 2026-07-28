/** Session-owned Orientation workflow. */

import { existsSync, statSync } from "node:fs";
import { relative } from "node:path";
import { buildArchitectureModel } from "../analysis/architecture/discovery.ts";
import type { ArchitectureModel } from "../analysis/architecture/model.ts";
import {
  collectInstructionFiles,
  findInstructionFilesForDirectory,
} from "../analysis/instruction-files.ts";
import { createStructuralCodeProvider } from "../analysis/provider.ts";
import { normalizePath } from "../analysis/search/paths.ts";
import { loadCodeIntelligenceConfig } from "../config.ts";
import type { CapabilityAdapter } from "./capability-adapter.ts";
import { parseOrientationWorkflowInput } from "./input/workflows.ts";
import { executeOrientation } from "./orientation/collect.ts";
import { formatSectionNote } from "./orientation/context-sections.ts";
import type {
  OrientationBlock,
  OrientationFocusInput,
  OrientationResultData,
  OrientationSectionData,
  OrientationWorkflowInput,
  OrientationWorkflowOutcome,
} from "./orientation-types.ts";
import type { TargetStoreEntry } from "./target-store.ts";
import { resolveTargetWorkflow, type TargetWorkflowDeps } from "./target-workflow.ts";
import { reportProgress, throwIfAborted, type WorkflowControl } from "./workflow-control.ts";

export interface OrientationWorkflowDeps extends TargetWorkflowDeps {
  readonly capability: CapabilityAdapter;
  readonly nativeInstructionPaths: Set<string>;
  readonly surfacedInstructionDirs: Set<string>;
  readonly markInstructionDirsSurfaced: (directories: string[]) => void;
  /** Whether the project is trusted — controls instruction-file discovery. */
  readonly projectTrusted: boolean;
}

/** Resolve the Orientation focus and collect immutable facts for presentation adapters. */
export async function runOrientationWorkflow(
  input: OrientationWorkflowInput,
  deps: OrientationWorkflowDeps,
  control?: WorkflowControl,
): Promise<OrientationWorkflowOutcome> {
  const parsed = parseOrientationWorkflowInput(input);
  if (parsed.kind === "invalid-input") return parsed;
  const request = parsed.value;
  throwIfAborted(control);
  reportProgress(control, {
    intent: "orientation",
    phase: "model",
    message: "Building workspace orientation model",
  });
  const model = await buildArchitectureModel(deps.cwd);
  const provider = deps.capability.getProvider(deps.cwd);
  const lspRuntime = deps.capability.getLspRuntimeState(deps.cwd);
  const maxResults = request.maxResults ?? 10;

  if (!request.focus) {
    const result = await executeOrientation(
      { maxResults },
      { model, provider, lspRuntime, cwd: deps.cwd },
    );
    return { kind: "completed", data: result };
  }

  if ("target" in request.focus) {
    return orientTarget({ targetInput: request.focus.target, maxResults, model, deps, control });
  }

  const focus = resolveContextFocus(request.focus, deps.cwd, model);
  if (focus.kind === "invalid-input") return focus;
  const result = await executeOrientation(
    {
      focus: focus.path,
      maxResults,
    },
    { model, provider, lspRuntime, cwd: deps.cwd },
  );
  const withInstructions = addInstructionFiles(result, focus.path, deps);
  return { kind: "completed", data: withInstructions };
}

async function orientTarget(options: {
  targetInput: Extract<OrientationFocusInput, { target: unknown }>["target"];
  maxResults: number;
  model: ArchitectureModel;
  deps: OrientationWorkflowDeps;
  control?: WorkflowControl;
}): Promise<OrientationWorkflowOutcome> {
  const { targetInput, maxResults, model, deps, control } = options;
  reportProgress(control, {
    intent: "orientation",
    phase: "target",
    message: "Resolving precise Orientation target",
  });
  const target = await resolveTargetWorkflow(
    targetInput,
    {
      fileLevelAllowed: false,
      nameAnchorRequired: false,
      maxResults,
    },
    deps,
  );
  if (target.kind === "target-group") {
    return {
      kind: "invalid-input",
      message: "Precise Orientation requires one member handle from a Target group.",
    };
  }
  if (target.kind === "disambiguation" || target.kind === "kind-mismatch") {
    const candidates = target.candidates.map((candidate) => ({
      targetId: candidate.targetId,
      name: candidate.name,
      kind: candidate.kind,
      container: candidate.container,
      file: candidate.file,
      line: candidate.line,
      character: candidate.character,
      rank: candidate.rank,
      anchorKind: candidate.anchorKind,
    }));
    return target.kind === "kind-mismatch"
      ? {
          kind: "kind-mismatch",
          requestedKind: target.requestedKind,
          omittedCount: target.omittedCount,
          candidates,
        }
      : { kind: "disambiguation", omittedCount: target.omittedCount, candidates };
  }
  if (target.kind !== "resolved") return target;
  throwIfAborted(control);

  const entry = target.entry;
  const readiness = await deps.capability.ensureSemanticReadiness(deps.cwd, {
    kind: "file",
    file: entry.file,
  });
  const semanticReady = readiness.kind === "ready";
  const provider = semanticReady
    ? deps.capability.getProvider(deps.cwd)
    : createStructuralCodeProvider(deps.capability.getStructuralProvider(deps.cwd));
  const lspRuntime = semanticReady
    ? deps.capability.getLspRuntimeState(deps.cwd)
    : {
        kind: "unavailable" as const,
        reason: readiness.kind === "timeout" ? "Semantic readiness timed out" : readiness.reason,
      };
  const result = await executeOrientation(
    {
      target: {
        file: entry.file,
        line: entry.displayLine,
        character: entry.displayCharacter,
        name: entry.name,
        kind: entry.kind,
        anchorKind: entry.anchorKind,
      },
      maxResults,
    },
    {
      model,
      provider,
      lspRuntime,
      cwd: deps.cwd,
    },
  );
  return {
    kind: "completed",
    data: addTargetSummary(result, entry, target.notes, deps.cwd),
  };
}

function resolveContextFocus(
  focus: Exclude<OrientationFocusInput, { target: unknown }>,
  cwd: string,
  model: ArchitectureModel,
): { kind: "resolved"; path: string } | { kind: "invalid-input"; message: string } {
  if ("path" in focus) {
    const path = normalizePath(focus.path, cwd);
    return existsSync(path)
      ? { kind: "resolved", path }
      : { kind: "invalid-input", message: `Focus path not found: \`${focus.path}\`.` };
  }

  const matches = model.modules.filter(
    (module) =>
      module.name === focus.module || module.name?.replace(/^@[^/]+\//, "") === focus.module,
  );
  if (matches.length === 1) return { kind: "resolved", path: matches[0].root };
  if (matches.length > 1) {
    return {
      kind: "invalid-input",
      message: `Module focus is ambiguous: ${matches.map((module) => module.name).join(", ")}.`,
    };
  }
  return { kind: "invalid-input", message: `Module focus not found: \`${focus.module}\`.` };
}

function addInstructionFiles(
  result: Awaited<ReturnType<typeof executeOrientation>>,
  focusPath: string,
  deps: OrientationWorkflowDeps,
): Awaited<ReturnType<typeof executeOrientation>> {
  if (!deps.projectTrusted || !isDirectory(focusPath)) return result;
  const config = loadCodeIntelligenceConfig(deps.cwd);
  const matches = findInstructionFilesForDirectory({
    directory: focusPath,
    cwd: deps.cwd,
    fileNames: config.instructionFileNames,
    nativeContextPaths: deps.nativeInstructionPaths,
    surfacedDirectories: deps.surfacedInstructionDirs,
    projectTrusted: deps.projectTrusted,
  });
  const collected = collectInstructionFiles(matches);
  if (!collected) return result;
  deps.markInstructionDirsSurfaced(collected.metadata.files.map((file) => file.directory));
  const section: OrientationSectionData = {
    key: "instructions",
    title: "Instructions",
    status: "complete",
    reason: null,
    confidence: "unavailable",
    provenance: [{ source: "filesystem", detail: "configured instruction files" }],
    evidenceLists: [
      {
        key: "instructions.files",
        totalCount: collected.files.length,
        shownCount: collected.files.length,
        omittedCount: 0,
        partialReason: null,
      },
    ],
  };
  return {
    ...result,
    blocks: insertInstructionBlocks(result.blocks, collected.files, section),
    sections: [section, ...result.sections],
    renderedSections: ["instructions", ...result.renderedSections],
    instructions: collected.metadata,
  };
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function addTargetSummary(
  result: OrientationResultData,
  entry: Readonly<TargetStoreEntry>,
  notes: readonly string[],
  cwd: string,
): OrientationResultData {
  const name = entry.name ? ` ${entry.name}` : "";
  const summary: OrientationBlock[] = [
    ...notes.map((note): OrientationBlock => ({ kind: "paragraph", text: `Note: ${note}` })),
    {
      kind: "paragraph",
      text: `Resolved target${name}: ${relative(cwd, entry.file) || entry.file}:${entry.displayLine}:${entry.displayCharacter} — Target ID: ${entry.targetId}`,
    },
    { kind: "blank" },
  ];
  return { ...result, blocks: [...summary, ...result.blocks], target: { ...entry } };
}

function insertInstructionBlocks(
  existing: readonly OrientationBlock[],
  files: readonly {
    path: string;
    content: string;
    truncated: boolean;
    shownLines: number;
    totalLines: number;
  }[],
  section: OrientationSectionData,
): OrientationBlock[] {
  const blocks: OrientationBlock[] = [
    { kind: "heading", level: 2, text: "Instructions" },
    { kind: "paragraph", text: formatSectionNote(section) },
    { kind: "blank" },
  ];
  for (const file of files) {
    blocks.push(
      { kind: "heading", level: 3, text: file.path },
      { kind: "code", language: null, lines: file.content.split("\n") },
    );
    if (file.truncated) {
      blocks.push({
        kind: "paragraph",
        text: `Instruction file truncated to ${file.shownLines} of ${file.totalLines} lines. Read ${file.path} for the full file.`,
      });
    }
    blocks.push({ kind: "blank" });
  }

  const insertion = existing.findIndex(
    (block, index) => index > 0 && block.kind === "heading" && block.level === 2,
  );
  if (insertion < 0) return [...existing, ...blocks];
  return [...existing.slice(0, insertion), ...blocks, ...existing.slice(insertion)];
}
