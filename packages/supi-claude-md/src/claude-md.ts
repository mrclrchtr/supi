// supi-claude-md — CLAUDE.md/AGENTS.md maintenance skills for pi.
//
// Runtime instruction-file surfacing is owned by supi-code-intelligence's
// code_orientation tool. This package only self-registers its skills.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const baseDir = dirname(dirname(fileURLToPath(import.meta.url)));

export default function claudeMdExtension(pi: ExtensionAPI) {
  pi.on("resources_discover", () => ({
    skillPaths: [join(baseDir, "skills")],
  }));
}
