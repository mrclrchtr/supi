// Code Intelligence status view — TUI overlay for analysis capability state.
//
// Placeholder for a richer overlay. Currently the /ci-status command
// renders via ctx.ui.notify. Future work can expand this into a
// TUI overlay similar to supi-lsp's status overlay.

import { Box, Text } from "@earendil-works/pi-tui";

/**
 * Build a status view for display in the TUI.
 */
export function buildCiStatusView(
  capabilities: Array<{ label: string; state: string; detail?: string }>,
): Box {
  const box = new Box(1, 1, (t) => t);

  const lines: string[] = ["Code Intelligence Status", ""];
  for (const cap of capabilities) {
    lines.push(`${cap.label}: ${cap.state}`);
    if (cap.detail) {
      lines.push(`  ${cap.detail}`);
    }
  }

  box.addChild(new Text(lines.join("\n"), 0, 0));
  return box;
}
