// /supi-settings command registration.
//
// Thin wrapper that registers the command and delegates to openSettingsOverlay.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { openSettingsOverlay } from "./settings-ui.ts";

export function registerSettingsCommand(pi: ExtensionAPI): void {
  pi.registerCommand("supi-settings", {
    description: "Manage SuPi extension settings",
    handler: async (_args, ctx) => {
      openSettingsOverlay(ctx);
    },
  });
}
