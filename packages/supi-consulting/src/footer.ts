import { footerContributions } from "@mrclrchtr/supi-core/footer-registry";
import { CONSULTING_FOOTER_KEY } from "./footer-constants.ts";
import type { ConsultingRuntime } from "./runtime.ts";

/** Register the Consulting checking spinner and ready icon on the footer stats line. */
export function registerConsultingFooterContribution(runtime: ConsultingRuntime): {
  dispose: () => void;
} {
  footerContributions.register({
    key: CONSULTING_FOOTER_KEY,
    placement: "stats-end",
    priority: 110,
    render: () => {
      const icon = runtime.footerIcon;
      return icon ? `| ${icon}` : "";
    },
  });

  return { dispose: unregisterConsultingFooterContribution };
}

/** Remove the Consulting ready icon from the footer. */
export function unregisterConsultingFooterContribution(): void {
  footerContributions.unregister(CONSULTING_FOOTER_KEY);
}
