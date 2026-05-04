import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createEditTool, createReadTool, createWriteTool } from "@mariozechner/pi-coding-agent";
import { augmentDiagnostics } from "./diagnostics/diagnostic-augmentation.ts";
import { formatDiagnostics } from "./diagnostics/diagnostics.ts";
import type { LspManager } from "./manager/manager.ts";

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
    const diags = await options.manager.syncFileAndGetDiagnostics(
      options.filePath,
      options.inlineSeverity,
    );
    if (diags.length === 0) return options.result;

    let diagText = formatDiagnostics(options.filePath, diags, options.cwd);

    const augmentation = await augmentDiagnostics(
      options.filePath,
      diags,
      options.manager,
      options.cwd,
    );
    if (augmentation) {
      diagText += `\n\n${augmentation}`;
    }

    const diagnosticContent = {
      type: "text" as const,
      text: `\n\n⚠️ LSP Diagnostics — review before continuing:\n${diagText}\nIf these errors are unexpected or appear across multiple files, fix the root cause before editing more files.`,
    } as T["content"][number];

    return {
      ...options.result,
      content: [...options.result.content, diagnosticContent],
    } as T;
  } catch {
    return options.result;
  }
}

async function ensureFileOpen(manager: LspManager | null, filePath: string): Promise<void> {
  if (!manager) return;

  try {
    await manager.ensureFileOpen(filePath);
  } catch {
    // Never block the agent on LSP errors
  }
}
