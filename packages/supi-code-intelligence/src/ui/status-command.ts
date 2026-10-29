import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";
import { type AutomaticLspPathPolicy, getWorkspaceLspRuntime } from "@mrclrchtr/supi-lsp/api";
import type { CapabilityWarningMissingServerSource } from "../analysis/capability/capability-warnings.ts";
import { checkWorkspaceDiagnostics } from "../analysis/health/check.ts";
import { observeWorkspaceStatus } from "../analysis/health/status.ts";
import { type CiStatusDialog, createCiStatusDialog } from "./status-overlay.ts";

/** Owned LSP facts used by the passive status warning collector. */
export interface CiStatusWarningSource {
  get(cwd: string): {
    lspController: CapabilityWarningMissingServerSource | null;
    automaticPathPolicy: AutomaticLspPathPolicy | null;
  };
}

async function collectStatusData(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  homeDir?: string,
  warningSource?: CiStatusWarningSource,
) {
  const workspace = getDefaultWorkspaceRuntime().getWorkspace(ctx.cwd);
  const facts = warningSource?.get(ctx.cwd);
  return {
    ...(await observeWorkspaceStatus({
      cwd: ctx.cwd,
      lspState: getWorkspaceLspRuntime(ctx.cwd),
      semanticState: workspace.semantic.state,
      structuralState: workspace.structural.state,
      projectTrusted: ctx.isProjectTrusted(),
      homeDir,
      lspController: facts?.lspController,
      automaticPathPolicy: facts?.automaticPathPolicy,
    })),
    activeTools: pi.getActiveTools().filter((tool) => tool.startsWith("code_")),
  };
}

function readDiagnosticDetails(cwd: string) {
  const lsp = getWorkspaceLspRuntime(cwd);
  if (lsp.kind !== "ready") throw new Error("LSP diagnostics are unavailable");
  return lsp.runtime.getOutstandingDiagnostics(2);
}

interface StatusInteraction {
  cancelled: boolean;
  close?: () => void;
  dialog?: CiStatusDialog;
}

/** Register the terminal inspector. Persistent footer contributions have a separate owner. */
export function registerCiStatusCommand(
  pi: ExtensionAPI,
  homeDir?: string,
  warningSource?: CiStatusWarningSource,
): void {
  let interaction: StatusInteraction | undefined;
  const close = () => {
    if (!interaction) return;
    interaction.cancelled = true;
    interaction.dialog?.dispose();
    interaction.close?.();
  };
  pi.on("session_shutdown", close);
  pi.on("session_start", close);

  pi.registerCommand("supi-ci-status", {
    description: "Toggle the code intelligence inspector (passive health snapshot)",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify(
          "The status inspector requires a terminal UI. Use code_health instead.",
          "warning",
        );
        return;
      }
      if (interaction) {
        close();
        return;
      }
      const current: StatusInteraction = { cancelled: false };
      interaction = current;
      const observe = () => collectStatusData(pi, ctx, homeDir, warningSource);
      let checkOffset = 0;
      const check = async (signal: AbortSignal) => {
        const lsp = getWorkspaceLspRuntime(ctx.cwd);
        if (lsp.kind !== "ready")
          throw new Error(`LSP runtime is ${lsp.kind}; diagnostics cannot be checked.`);
        pi.events.emit("supi:working:start", { source: "supi-code-intelligence" });
        try {
          const diagnosticCheck = await checkWorkspaceDiagnostics({
            runtime: lsp.runtime,
            cwd: ctx.cwd,
            offset: checkOffset,
            control: { signal, deadline: Date.now() + 30_000 },
          });
          const snapshot = await observe();
          checkOffset = diagnosticCheck.nextOffset;
          return { ...snapshot, diagnosticCheck };
        } finally {
          pi.events.emit("supi:working:end", { source: "supi-code-intelligence" });
        }
      };
      try {
        const data = await observe();
        if (current.cancelled) return;
        await ctx.ui.custom<void>(
          (tui, theme, keybindings, done) => {
            current.close = () => done(undefined);
            const dialog = createCiStatusDialog(data, {
              tui,
              theme,
              keybindings,
              done: current.close,
              onRefresh: observe,
              onCheck: check,
              fetchDetailedDiagnostics: () => readDiagnosticDetails(ctx.cwd),
            });
            current.dialog = dialog;
            if (current.cancelled) current.close();
            return dialog;
          },
          {
            overlay: true,
            overlayOptions: { anchor: "center", width: "85%", maxHeight: "85%" },
          },
        );
      } catch (error) {
        if (!current.cancelled)
          ctx.ui.notify(`Unable to open code intelligence status: ${String(error)}`, "error");
      } finally {
        current.dialog?.dispose();
        if (interaction === current) interaction = undefined;
      }
    },
  });
}
