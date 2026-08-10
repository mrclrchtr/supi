import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import skillSettings from "./skill-settings.ts";
import skillShortcut from "./skill-shortcut.ts";

/** Register scoped skill controls and `$skill-name` input shortcuts. */
export default function supiSkills(pi: ExtensionAPI): void {
  skillShortcut(pi);
  skillSettings(pi);
}
