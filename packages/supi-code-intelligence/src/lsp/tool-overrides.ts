// LSP-aware tool overrides — ports read/write/edit overrides from supi-lsp.
//
// Opens files on read, appends inline diagnostics after write/edit.
// biome-ignore-all lint/complexity/useMaxParams: pi ToolDefinition.execute signature requires 5 params.

import * as nodePath from "node:path";
import type {
  AgentToolUpdateCallback,
  EditToolInput,
  ExtensionAPI,
  ExtensionContext,
  ReadToolInput,
  WriteToolInput,
} from "@earendil-works/pi-coding-agent";
import { createEditTool, createReadTool, createWriteTool } from "@earendil-works/pi-coding-agent";
import type { LspAdapterState } from "./runtime-state.ts";

export function registerLspAwareToolOverrides(pi: ExtensionAPI, state: LspAdapterState): void {
  const readMeta = createReadTool(process.cwd());
  const writeMeta = createWriteTool(process.cwd());
  const editMeta = createEditTool(process.cwd());

  pi.registerTool({
    ...readMeta,
    execute: makeReadExecutor(state),
  });

  pi.registerTool({
    ...writeMeta,
    execute: makeWriteExecutor(state),
  });

  pi.registerTool({
    ...editMeta,
    execute: makeEditExecutor(state),
  });
}

function makeReadExecutor(state: LspAdapterState) {
  return async (
    toolCallId: string,
    params: ReadToolInput,
    signal: AbortSignal | undefined,
    onUpdate: AgentToolUpdateCallback | undefined,
    ctx: ExtensionContext,
  ) => {
    const originalRead = createReadTool(ctx.cwd);
    const result = await originalRead.execute(toolCallId, params, signal, onUpdate);
    if (!state.lspActive || !state.controller?.manager) return result;
    try {
      await state.controller.manager.ensureFileOpen(resolveSessionPath(ctx.cwd, params.path));
    } catch {
      /* never block the agent */
    }
    return result;
  };
}

function makeWriteExecutor(state: LspAdapterState) {
  return async (
    toolCallId: string,
    params: WriteToolInput,
    signal: AbortSignal | undefined,
    onUpdate: AgentToolUpdateCallback | undefined,
    ctx: ExtensionContext,
  ) => {
    const originalWrite = createWriteTool(ctx.cwd);
    const result = await originalWrite.execute(toolCallId, params, signal, onUpdate);
    if (!state.lspActive) return result;
    return appendInlineDiagnostics(state, ctx.cwd, params.path, result);
  };
}

function makeEditExecutor(state: LspAdapterState) {
  return async (
    toolCallId: string,
    params: EditToolInput,
    signal: AbortSignal | undefined,
    onUpdate: AgentToolUpdateCallback | undefined,
    ctx: ExtensionContext,
  ) => {
    const originalEdit = createEditTool(ctx.cwd);
    const result = await originalEdit.execute(toolCallId, params, signal, onUpdate);
    if (!state.lspActive) return result;
    return appendInlineDiagnostics(state, ctx.cwd, params.path, result);
  };
}

async function appendInlineDiagnostics<T extends { content: unknown[]; details: unknown }>(
  state: LspAdapterState,
  cwd: string,
  filePath: string,
  result: T,
): Promise<T> {
  const manager = state.controller?.manager;
  if (!manager) return result;

  try {
    const resolved = resolveSessionPath(cwd, filePath);
    const effectiveSeverity = Math.max(state.inlineSeverity, 2);
    const entries = await manager.syncFileAndGetCascadingDiagnostics(resolved, effectiveSeverity);
    if (entries.length === 0) return result;

    // biome-ignore format: manual formatting for readability
    const lines = [
      "\n\n⚠️ LSP Diagnostics — review before continuing:",
      ...entries.flatMap((entry) =>
        entry.diagnostics.map(
          (d: { range: { start: { line: number } }; message: string }) =>
            `  ${entry.file}:${d.range.start.line + 1}: ${d.message}`,
        ),
      ),
      "If these errors are unexpected or appear across multiple files, fix the root cause before editing more.",
    ];

    const diagnosticContent = {
      type: "text" as const,
      text: lines.join("\n"),
    } as T["content"][number];

    return { ...result, content: [...result.content, diagnosticContent] } as T;
  } catch {
    return result;
  }
}

function resolveSessionPath(cwd: string, filePath: string): string {
  if (nodePath.isAbsolute(filePath)) return filePath;
  if (filePath.startsWith("@")) return nodePath.resolve(cwd, filePath.slice(1));
  return nodePath.resolve(cwd, filePath);
}
