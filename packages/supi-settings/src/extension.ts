import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { openSettingsOverlay } from "./ui/settings-ui.ts";

const baseDir = dirname(dirname(fileURLToPath(import.meta.url)));

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("supi-settings", {
    description: "Manage SuPi extension settings",
    handler: async (_args, ctx) => openSettingsOverlay(pi, ctx),
  });

  pi.on("resources_discover", () => ({
    skillPaths: [join(baseDir, "skills")],
  }));
}
