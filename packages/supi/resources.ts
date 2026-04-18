// Dynamic resource contribution for the SuPi meta-package.
//
// Ensures skills and prompts are re-discovered on /reload by contributing
// them via resources_discover in addition to the static pi manifest.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const baseDir = dirname(fileURLToPath(import.meta.url));

export default function resourcesExtension(pi: ExtensionAPI) {
  pi.on("resources_discover", () => ({
    skillPaths: [join(baseDir, "skills")],
    promptPaths: [join(baseDir, "prompts")],
  }));
}
