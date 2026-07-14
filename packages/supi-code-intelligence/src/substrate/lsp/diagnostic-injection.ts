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
import type { LspAdapterState } from "./state.ts";
import { diagnosticMessageString } from "./utils.ts";

export function registerDiagnosticInjectionHandlers(
  pi: ExtensionAPI,
  state: LspAdapterState,
): void {
  pi.on("before_agent_start", async (_event, _ctx: ExtensionContext) => {
    const runtime = state.controller?.workspaceRuntime;
    if (!runtime || !state.lspActive) {
      return;
    }

    // Sentinel refresh: detect lockfile/tsconfig/d.ts changes from outside write/edit
    applySentinelChanges(state, runtime);

    // Stale-module resync: force-reopen files with "Cannot find module" errors
    await resyncStaleModuleFiles(state);

    // Two-pass prune/refresh for diagnostics
    runtime.pruneMissingFiles();
    try {
      await runtime.refreshOpenDiagnostics();
    } catch {
      /* best-effort */
    }
    runtime.pruneMissingFiles();

    const diagnostics = runtime.getOutstandingDiagnosticSummary(state.inlineSeverity);
    if (!diagnostics || diagnostics.length === 0) {
      state.lastDiagnosticsFingerprint = null;
      state.currentContextToken = null;
      return;
    }

    state.currentContextToken = `lsp-context-${++state.contextCounter}`;

    const detailedDiagnostics = runtime
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

/** Diff the sentinel snapshot and notify the workspace runtime of changes. */
function applySentinelChanges(
  state: LspAdapterState,
  runtime: NonNullable<LspAdapterState["controller"]>["workspaceRuntime"],
): void {
  if (!runtime) return;
  const controller = state.controller;
  if (!controller) return;

  const { snapshot, changes } = syncWorkspaceSentinelSnapshot(
    controller.cwd,
    state.sentinelSnapshot,
  );
  state.sentinelSnapshot = snapshot;

  if (changes.length === 0) return;

  clearTsconfigCache();
  runtime.noteWorkspaceChanges(changes);

  state.staleSuspected = true;
  state.lastDiagnosticsFingerprint = null;
  state.currentContextToken = null;
  state.lastWorkspaceChangeAt = Date.now();
}

/** Re-open files with stale module-resolution errors. */
async function resyncStaleModuleFiles(state: LspAdapterState): Promise<void> {
  const runtime = state.controller?.workspaceRuntime;
  if (!runtime) return;

  const outstanding = runtime.getOutstandingDiagnostics(1);
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
    runtime.closeFile(filePath);
    await runtime.trackFile(filePath);
  }

  try {
    await runtime.refreshOpenDiagnostics({ quietMs: 300, maxWaitMs: 2000 });
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
