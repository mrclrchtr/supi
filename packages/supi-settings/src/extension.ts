import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { openSettingsOverlay } from "./ui/settings-ui.ts";

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("supi-settings", {
    description: "Manage SuPi extension settings",
    handler: async (_args, ctx) => openSettingsOverlay(pi, ctx),
  });
}
