// Diagnostic injection handlers — before_agent_start and context for lsp-context messages.
//
// Ported from supi-lsp's diagnostic-injection.ts.

import * as nodePath from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  clearTsconfigCache,
  isLikelyStaleDiagnostic,
  syncWorkspaceSentinelSnapshot,
} from "@mrclrchtr/supi-lsp/api";
import { diagnosticMessageString } from "./diagnostic-utils.ts";
import type { LspAdapterState } from "./runtime-state.ts";

// LSP_TOOL_NAMES removed — lsp_* tools are no longer registered (TNDM-A9AQF4)
const LSP_TOOL_NAMES: readonly string[] = [];

export function registerDiagnosticInjectionHandlers(
  pi: ExtensionAPI,
  state: LspAdapterState,
): void {
  pi.on("before_agent_start", async (_event, _ctx: ExtensionContext) => {
    const manager = state.controller?.manager;
    if (!manager || !state.lspActive) {
      const activeTools = pi.getActiveTools();
      const nextTools = activeTools.filter(
        (t: string) => !LSP_TOOL_NAMES.includes(t as (typeof LSP_TOOL_NAMES)[number]),
      );
      if (nextTools.length !== activeTools.length) {
        pi.setActiveTools(nextTools);
      }
      return;
    }

    const missing = LSP_TOOL_NAMES.filter((name) => !pi.getActiveTools().includes(name));
    if (missing.length > 0) {
      pi.setActiveTools([...pi.getActiveTools(), ...missing]);
    }

    // Sentinel refresh: detect lockfile/tsconfig/d.ts changes from outside write/edit
    applySentinelChanges(state, manager);

    // Stale-module resync: force-reopen files with "Cannot find module" errors
    await resyncStaleModuleFiles(state);

    // Two-pass prune/refresh for diagnostics
    manager.pruneMissingFiles();
    try {
      await manager.refreshOpenDiagnostics();
    } catch {
      /* best-effort */
    }
    manager.pruneMissingFiles();

    const diagnostics = manager.getOutstandingDiagnosticSummary(state.inlineSeverity);
    if (!diagnostics || diagnostics.length === 0) {
      state.lastDiagnosticsFingerprint = null;
      state.currentContextToken = null;
      return;
    }

    state.currentContextToken = `lsp-context-${++state.contextCounter}`;

    const detailedDiagnostics = manager
      .getOutstandingDiagnostics(state.inlineSeverity)
      .map((entry) => ({
        file: entry.file,
        diagnostics: entry.diagnostics.map((d) => ({
          range: d.range,
          message: diagnosticMessageString(d),
        })),
      }));

    return {
      message: {
        customType: "lsp-context",
        content: buildInjectionContent(diagnostics, detailedDiagnostics),
        display: true,
        details: {
          contextToken: state.currentContextToken,
          promptContent: buildInjectionContent(diagnostics),
          inlineSeverity: state.inlineSeverity,
          diagnostics: diagnostics.map(
            (d: {
              file: string;
              errors: number;
              warnings: number;
              information: number;
              hints: number;
            }) => ({
              file: d.file,
              errors: d.errors,
              warnings: d.warnings,
              information: d.information,
              hints: d.hints,
            }),
          ),
        },
      },
    };
  });

  pi.on("context", (event, _ctx) => {
    const messages = event.messages as unknown as Array<Record<string, unknown>>;
    const token = state.currentContextToken;

    const pruned = messages.filter((m) => {
      if (m.customType !== "lsp-context") return true;
      if (!token) return false;
      const details = m.details as { contextToken?: string } | undefined;
      return details?.contextToken === token;
    });

    if (pruned.length === event.messages.length) return;
    return { messages: pruned as unknown as typeof event.messages };
  });
}

/** Diff sentinel snapshot and notify manager of changes. */
// biome-ignore lint/suspicious/noExplicitAny: callback accepts FileEvent[] which satisfies the structural type
function applySentinelChanges(state: LspAdapterState, manager: any): void {
  const controller = state.controller;
  if (!controller) return;

  const { snapshot, changes } = syncWorkspaceSentinelSnapshot(
    controller.cwd,
    state.sentinelSnapshot,
  );
  state.sentinelSnapshot = snapshot;

  if (changes.length === 0) return;

  clearTsconfigCache();
  manager.clearAllPullResultIds();
  manager.notifyWorkspaceFileChanges(changes);

  state.staleSuspected = true;
  state.lastDiagnosticsFingerprint = null;
  state.currentContextToken = null;
  state.lastWorkspaceChangeAt = Date.now();
}

/** Re-open files with stale module-resolution errors. */
async function resyncStaleModuleFiles(state: LspAdapterState): Promise<void> {
  const manager = state.controller?.manager;
  if (!manager) return;

  const outstanding = manager.getOutstandingDiagnostics(1);
  const staleFiles: string[] = [];

  for (const entry of outstanding) {
    // biome-ignore lint/suspicious/noExplicitAny: isLikelyStaleDiagnostic accepts Diagnostic, which the manager provides
    if (entry.diagnostics.some((d) => isLikelyStaleDiagnostic(d as any))) {
      staleFiles.push(entry.file);
    }
  }

  if (staleFiles.length === 0) return;

  const cwd = state.controller?.cwd ?? "";
  for (const file of staleFiles) {
    const filePath = nodePath.resolve(cwd, file);
    manager.closeFile(filePath);
    await manager.ensureFileOpen(filePath);
  }

  try {
    await manager.refreshOpenDiagnostics({ quietMs: 300, maxWaitMs: 2000 });
  } catch {
    /* best-effort */
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: diagnostic formatting logic
function buildInjectionContent(
  diagnostics: Array<{ file: string; errors: number; warnings: number }>,
  detailed?: Array<{
    file: string;
    diagnostics: Array<{ message: string; range: { start: { line: number } } }>;
  }>,
): string {
  if (!diagnostics || diagnostics.length === 0) return "";

  const parts: string[] = [
    '<extension-context source="supi-code-intelligence">',
    "Outstanding LSP diagnostics:",
  ];

  for (const diag of diagnostics.slice(0, 15)) {
    const pieces: string[] = [];
    if (diag.errors > 0) pieces.push(`${diag.errors} error${diag.errors > 1 ? "s" : ""}`);
    if (diag.warnings > 0) pieces.push(`${diag.warnings} warning${diag.warnings > 1 ? "s" : ""}`);
    parts.push(`- ${diag.file}: ${pieces.join(", ")}`);
  }

  if (diagnostics.length > 15) {
    parts.push(`... and ${diagnostics.length - 15} more files`);
  }

  if (detailed) {
    for (const entry of detailed.slice(0, 5)) {
      for (const d of entry.diagnostics.slice(0, 5)) {
        parts.push(`  ${d.range.start.line + 1}: ${d.message}`);
      }
    }
  }

  parts.push("</extension-context>");

  const totalErrors = diagnostics.reduce((s: number, d: { errors: number }) => s + d.errors, 0);
  if (totalErrors > 0) {
    parts.push("");
    parts.push(`Found ${totalErrors} errors across the workspace.`);
    parts.push("Use code_health to inspect issues.");
  }

  return parts.join("\n");
}
