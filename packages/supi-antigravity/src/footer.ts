import { footerContributions } from "@mrclrchtr/supi-core/footer-registry";
import { ANTIGRAVITY_FOOTER_KEY } from "./footer-constants.ts";
import type { AntigravityRuntime } from "./runtime.ts";

/** Register the Antigravity checking spinner and ready icon on the footer stats line. */
export function registerAntigravityFooterContribution(runtime: AntigravityRuntime): {
  dispose: () => void;
} {
  footerContributions.register({
    key: ANTIGRAVITY_FOOTER_KEY,
    placement: "stats-end",
    priority: 110,
    render: () => {
      const icon = runtime.footerIcon;
      return icon ? `| ${icon}` : "";
    },
  });

  return {
    dispose: unregisterAntigravityFooterContribution,
  };
}

/** Remove the Antigravity ready icon from the footer. */
export function unregisterAntigravityFooterContribution(): void {
  footerContributions.unregister(ANTIGRAVITY_FOOTER_KEY);
}
