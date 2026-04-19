// Command handler for /supi-claude-md.
//
// Opens the interactive settings overlay directly.

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { openSettingsOverlay } from "./settings.ts";

export function handleCommand(_args: string, ctx: ExtensionContext): void {
  openSettingsOverlay(ctx);
}
