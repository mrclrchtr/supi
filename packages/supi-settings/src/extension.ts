import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSettingsCommand } from "@mrclrchtr/supi-core/settings";

export default function (pi: ExtensionAPI): void {
  registerSettingsCommand(pi);
}
