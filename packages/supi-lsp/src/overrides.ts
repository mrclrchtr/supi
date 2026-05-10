import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createEditTool, createReadTool, createWriteTool } from "@earendil-works/pi-coding-agent";
import { augmentDiagnostics } from "./diagnostics/diagnostic-augmentation.ts";
import { formatGroupedDiagnostics } from "./diagnostics/diagnostics.ts";
import { splitSuppressionDiagnostics } from "./diagnostics/suppression-diagnostics.ts";
import type { LspManager } from "./manager/manager.ts";
import type { Diagnostic } from "./types.ts";

interface LspOverrideState {
  getInlineSeverity(): number;
  getManager(): LspManager | null;
  getCwd(): string;
}

export function registerLspAwareToolOverrides(pi: ExtensionAPI, state: LspOverrideState): void {
  const readMeta = createReadTool(process.cwd());
  const writeMeta = createWriteTool(process.cwd());
  const editMeta = createEditTool(process.cwd());

  pi.registerTool({
    ...readMeta,
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(toolCallId, params, signal, onUpdate, _ctx) {
      const cwd = state.getCwd();
      const originalRead = createReadTool(cwd);
      const result = await originalRead.execute(toolCallId, params, signal, onUpdate);
      await ensureFileOpen(state.getManager(), params.path);
      return result;
    },
  });

  pi.registerTool({
    ...writeMeta,
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(toolCallId, params, signal, onUpdate, _ctx) {
      const cwd = state.getCwd();
      const originalWrite = createWriteTool(cwd);
      const result = await originalWrite.execute(toolCallId, params, signal, onUpdate);
      return appendInlineDiagnostics({
        manager: state.getManager(),
        filePath: params.path,
        inlineSeverity: state.getInlineSeverity(),
        cwd,
        result,
      });
    },
  });

  pi.registerTool({
    ...editMeta,
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(toolCallId, params, signal, onUpdate, _ctx) {
      const cwd = state.getCwd();
      const originalEdit = createEditTool(cwd);
      const result = await originalEdit.execute(toolCallId, params, signal, onUpdate);
      return appendInlineDiagnostics({
        manager: state.getManager(),
        filePath: params.path,
        inlineSeverity: state.getInlineSeverity(),
        cwd,
        result,
      });
    },
  });
}

interface AppendInlineDiagnosticsOptions<T extends { content: unknown[]; details: unknown }> {
  manager: LspManager | null;
  filePath: string;
  inlineSeverity: number;
  cwd: string;
  result: T;
}

async function appendInlineDiagnostics<T extends { content: unknown[]; details: unknown }>(
  options: AppendInlineDiagnosticsOptions<T>,
): Promise<T> {
  if (!options.manager) return options.result;

  try {
    const effectiveSeverity = Math.max(options.inlineSeverity, 2);
    const entries = await options.manager.syncFileAndGetCascadingDiagnostics(
      options.filePath,
      effectiveSeverity,
    );
    if (entries.length === 0) return options.result;

    const primaryDiagnostics =
      entries.find((entry) => entry.file === options.filePath)?.diagnostics ?? [];
    const augmentation = await augmentDiagnostics(
      options.filePath,
      splitSuppressionDiagnostics(primaryDiagnostics, options.inlineSeverity).regular,
      options.manager,
      options.cwd,
    );
    const diagText = buildInlineDiagnosticsMessage(
      entries,
      options.cwd,
      options.inlineSeverity,
      augmentation ?? undefined,
    );
    if (!diagText) return options.result;

    const diagnosticContent = {
      type: "text" as const,
      text: `\n\n${diagText}`,
    } as T["content"][number];

    return {
      ...options.result,
      content: [...options.result.content, diagnosticContent],
    } as T;
  } catch {
    return options.result;
  }
}

export function buildInlineDiagnosticsMessage(
  entries: Array<{ file: string; diagnostics: Diagnostic[] }>,
  cwd: string,
  inlineSeverity: number = 1,
  augmentation?: string,
): string | null {
  const regularEntries: Array<{ file: string; diagnostics: Diagnostic[] }> = [];
  const suppressionEntries: Array<{ file: string; diagnostics: Diagnostic[] }> = [];

  for (const entry of entries) {
    const { regular, suppressions } = splitSuppressionDiagnostics(
      entry.diagnostics,
      inlineSeverity,
    );
    if (regular.length > 0) {
      regularEntries.push({ file: entry.file, diagnostics: regular });
    }
    if (suppressions.length > 0) {
      suppressionEntries.push({ file: entry.file, diagnostics: suppressions });
    }
  }

  if (regularEntries.length === 0 && suppressionEntries.length === 0) {
    return null;
  }

  const sections = ["⚠️ LSP Diagnostics — review before continuing:"];

  if (regularEntries.length > 0) {
    sections.push(formatGroupedDiagnostics(regularEntries, cwd));
    if (augmentation) {
      sections.push(augmentation);
    }
  }

  if (suppressionEntries.length > 0) {
    sections.push(
      `🗑️ Stale suppressions — cleanup available:\n${formatGroupedDiagnostics(suppressionEntries, cwd)}`,
    );
  }

  sections.push(
    "If these errors are unexpected or appear across multiple files, fix the root cause before editing more files.",
  );
  return sections.join("\n\n");
}

async function ensureFileOpen(manager: LspManager | null, filePath: string): Promise<void> {
  if (!manager) return;

  try {
    await manager.ensureFileOpen(filePath);
  } catch {
    // Never block the agent on LSP errors
  }
}
