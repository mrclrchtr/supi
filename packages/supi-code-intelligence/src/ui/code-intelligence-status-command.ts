// Code Intelligence status command — replaces the old /lsp-status substrate command.
//
// Shows the current state of LSP and Tree-sitter capabilities in a
// unified status surface.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getDefaultWorkspaceRuntime } from "@mrclrchtr/supi-code-runtime/api";

/**
 * Register the unified /ci-status command.
 *
 * Shows available analysis capabilities and their current state.
 */
export function registerCiStatusCommand(pi: ExtensionAPI): void {
  pi.registerCommand("ci-status", {
    description: "Show code intelligence status — LSP and structural analysis state",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const workspace = getDefaultWorkspaceRuntime().getWorkspace(ctx.cwd);
      const lines: string[] = ["## Code Intelligence Status\n"];

      // Semantic (LSP)
      const semantic = workspace.semantic;
      lines.push(`**Semantic (LSP):** ${semantic.state.kind}`);
      if (semantic.state.kind === "unavailable" && semantic.state.reason) {
        lines.push(`  Reason: ${semantic.state.reason}`);
      }
      if (semantic.provider) {
        lines.push("  Provider: available");
      }
      if (semantic.refactorAvailable) {
        lines.push("  Refactor: available");
      }

      // Structural (Tree-sitter)
      const structural = workspace.structural;
      lines.push(`**Structural (Tree-sitter):** ${structural.state.kind}`);
      if (structural.state.kind === "unavailable" && structural.state.reason) {
        lines.push(`  Reason: ${structural.state.reason}`);
      }
      if (structural.provider) {
        lines.push("  Provider: available");
      }

      // Available tools
      const tools = pi.getActiveTools();
      const ciTools = tools.filter((t: string) => t.startsWith("code_"));
      if (ciTools.length > 0) {
        lines.push(`\n**Active tools:** ${ciTools.join(", ")}`);
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
