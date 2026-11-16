import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { warnRetiredPackages } from "@mrclrchtr/supi-core/retired-packages";

/**
 * Warn when the retired `supi-cache` package, folded into SuPi Debug in 13.0.0, is still
 * declared. Remove this check in 18.0.0 (five major versions later, #596).
 */
export function registerRetiredPackageWarnings(pi: ExtensionAPI): void {
  warnRetiredPackages(
    pi,
    [{ name: "@mrclrchtr/supi-cache", replacement: "@mrclrchtr/supi-debug" }],
    { source: "supi-debug" },
  );
}
