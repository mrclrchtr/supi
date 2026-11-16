import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { warnRetiredPackages } from "@mrclrchtr/supi-core/retired-packages";

/**
 * Warn when the retired `supi-bash-timeout` package, folded into SuPi Extras in 13.0.0, is
 * still declared. Remove this check in 18.0.0 (five major versions later, #596).
 */
export default function retiredPackages(pi: ExtensionAPI): void {
  warnRetiredPackages(
    pi,
    [{ name: "@mrclrchtr/supi-bash-timeout", replacement: "@mrclrchtr/supi-extras" }],
    { source: "supi-extras" },
  );
}
